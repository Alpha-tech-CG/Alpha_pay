import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlphapayInvoice, ANY_MODE, PrismaClient, Transaction } from '@paybrain/database';
import { AuditService } from '../../common/audit/audit.service';
import { ApiError } from '../../common/errors/api-error';
import { KvStore } from '../../common/kv/kv-store';
import { formatAmount, toMajorAmount } from '../../common/money';
import { PaymentHooks } from '../../common/payments/payment-hooks';
import { CronLockService } from '../../common/scheduling/cron-lock.service';
import { decryptField } from '../../common/security/pii-crypto';
import { MessagingService } from '../messaging/messaging.service';
import { PaymentLinksService } from '../payment-links/payment-links.service';
import { monthlyQuota } from './monthly-quota';

// ─── Contrôle d'accès par palier (T-83) ──────────────────────────────────────

/** Modules payants. Encaisser (M4) et Vérif (M5) sont inclus dans tous les paliers. */
export const MODULE_KEYS = {
  m6_manage: 'Gérer',
  m7_recover: 'Recouvrer',
  m8_school: 'Pack École',
  m9_messaging: 'Messages',
  m10_developers: 'Développeurs',
  m11_billing: 'Facturation',
} as const;

export type ModuleKey = keyof typeof MODULE_KEYS;

/** Palier appliqué à un marchand sans abonnement. */
export const DEFAULT_PLAN = 'gratuit';
const DAY = 86_400_000;
const PERIOD_DAYS = 30;

export interface ModuleAccess {
  allowed: boolean;
  /** Impayé au-delà de la période de grâce : lecture seule sur les modules payants. */
  readonly: boolean;
  plan: string;
}

function graceDays(): number {
  const n = Number(process.env.BILLING_GRACE_DAYS ?? 7);
  return Number.isInteger(n) && n >= 0 ? n : 7;
}

function lowCreditThreshold(): number {
  const n = Number(process.env.LOW_CREDIT_THRESHOLD ?? 50);
  return Number.isInteger(n) && n >= 0 ? n : 50;
}

/**
 * Facturation AlphaPay (§M11) : AlphaPay facture SES services au marchand, payés
 * par MTN ou Airtel sur le compte marchand d'AlphaPay, comme n'importe quel client
 * paie un marchand (lien de paiement). Rien n'est accordé avant le paiement :
 * crédits et palier payant sont appliqués au paiement réussi. Un impayé ne bloque
 * JAMAIS les encaissements des clients du marchand, seulement les modules payants.
 */
@Injectable()
export class BillingService implements OnModuleInit {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly links: PaymentLinksService,
    private readonly hooks: PaymentHooks,
    private readonly messaging: MessagingService,
    private readonly audit: AuditService,
    private readonly cronLock: CronLockService,
    private readonly kv: KvStore,
  ) {}

  onModuleInit() {
    this.hooks.onSucceeded('facturation', (tx) => this.onPaymentSucceeded(tx));
  }

  // ─── Catalogue ─────────────────────────────────────────────────────────────

  async listPlans() {
    const plans = await this.prisma.billingPlan.findMany({ where: { isActive: true }, orderBy: { priceMonthly: 'asc' } });
    // Prix lus en base à chaque appel (§M11 : aucun prix en dur), en unités majeures.
    return plans.map((p) => ({
      code: p.code,
      label: p.label,
      price_monthly: toMajorAmount(p.priceMonthly, p.currency),
      price_yearly: toMajorAmount(p.priceYearly, p.currency),
      currency: p.currency,
      included_modules: p.includedModules,
      included_credits: p.includedCredits,
      limits: { stores: p.maxStores, tills: p.maxTills, monthly_transactions: p.maxMonthlyTransactions },
    }));
  }

  async listCreditPacks() {
    const packs = await this.prisma.creditPack.findMany({ where: { isActive: true }, orderBy: { credits: 'asc' } });
    return packs.map((p) => ({ code: p.code, label: p.label, credits: p.credits, price: toMajorAmount(p.price, p.currency), currency: p.currency }));
  }

  // ─── Abonnement ────────────────────────────────────────────────────────────

  async getSubscription(merchantId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { merchantId }, include: { plan: true } });
    const plan = sub?.plan ?? (await this.prisma.billingPlan.findUnique({ where: { code: DEFAULT_PLAN } }));
    const pending = await this.prisma.alphapayInvoice.findFirst({ where: { merchantId, kind: 'SUBSCRIPTION', status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
    const quota = await monthlyQuota(this.prisma, merchantId);
    return {
      plan: plan ? { code: plan.code, label: plan.label, included_modules: plan.includedModules } : null,
      status: sub ? sub.status.toLowerCase() : 'gratuit',
      read_only: sub?.status === 'EXPIRED',
      period_end: sub?.periodEnd ?? null,
      usage: { monthly_transactions: quota.used, monthly_transactions_limit: quota.limit },
      pending_invoice: pending ? await this.presentInvoice(pending) : null,
    };
  }

  /**
   * Changement de palier : gratuit (prix 0) → immédiat ; payant → facture AlphaPay
   * et lien de paiement, le palier s'applique au paiement réussi.
   */
  async subscribe(merchantId: string, planCode: string, actorId: string) {
    const plan = await this.prisma.billingPlan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.isActive) throw new ApiError(HttpStatus.NOT_FOUND, 'palier_introuvable', 'Palier introuvable', 'plan');
    // Paliers payants livrés à 0 tant que les prix ne sont pas fixés (migration 31) :
    // sans ce garde, n'importe quel marchand obtiendrait Pro gratuitement.
    if (plan.priceMonthly === 0n && plan.code !== DEFAULT_PLAN) {
      throw new ApiError(HttpStatus.CONFLICT, 'prix_non_fixe', `Le palier ${plan.label} n'est pas encore disponible à la souscription : contactez AlphaPay`, 'plan');
    }
    if (plan.priceMonthly === 0n) {
      await this.activate(merchantId, plan.id);
      await this.audit.record({ actorType: 'user', actorId, merchantId, action: 'billing.plan_changed', targetType: 'billing_plan', targetId: plan.id, metadata: { plan: plan.code, paid: false } });
      return { status: 'active', plan: plan.code };
    }
    const invoice = await this.createInvoice(merchantId, { kind: 'SUBSCRIPTION', planId: plan.id, amount: plan.priceMonthly, currency: plan.currency, label: `Abonnement AlphaPay ${plan.label} (30 jours)` });
    await this.audit.record({ actorType: 'user', actorId, merchantId, action: 'billing.subscription_requested', targetType: 'alphapay_invoice', targetId: invoice.id, metadata: { plan: plan.code } });
    return { status: 'en_attente_de_paiement', invoice: await this.presentInvoice(invoice) };
  }

  async cancelSubscription(merchantId: string, actorId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { merchantId } });
    if (!sub) throw new ApiError(HttpStatus.NOT_FOUND, 'introuvable', 'Aucun abonnement');
    // Le palier reste actif jusqu'à la fin de la période payée.
    await this.prisma.subscription.update({ where: { merchantId }, data: { status: 'CANCELED', canceledAt: new Date() } });
    await this.audit.record({ actorType: 'user', actorId, merchantId, action: 'billing.subscription_canceled', targetType: 'subscription', targetId: sub.id });
    return { status: 'annulé', period_end: sub.periodEnd };
  }

  // ─── Crédits de messages ───────────────────────────────────────────────────

  async getBalance(merchantId: string): Promise<number> {
    const agg = await this.prisma.creditLedger.aggregate({ where: { merchantId, livemode: true }, _sum: { delta: true } });
    return agg._sum.delta ?? 0;
  }

  /** Achat d'un pack : facture AlphaPay + lien de paiement ; les crédits arrivent au paiement réussi. */
  async purchasePack(merchantId: string, packCode: string, actorId: string) {
    const pack = await this.prisma.creditPack.findUnique({ where: { code: packCode } });
    if (!pack || !pack.isActive) throw new ApiError(HttpStatus.NOT_FOUND, 'pack_introuvable', 'Pack introuvable', 'pack');
    const invoice = await this.createInvoice(merchantId, { kind: 'CREDIT_PACK', creditPackId: pack.id, amount: pack.price, currency: pack.currency, label: `${pack.credits} crédits de messages AlphaPay` });
    await this.audit.record({ actorType: 'user', actorId, merchantId, action: 'billing.credit_pack_requested', targetType: 'alphapay_invoice', targetId: invoice.id, metadata: { pack: pack.code } });
    return { status: 'en_attente_de_paiement', invoice: await this.presentInvoice(invoice) };
  }

  // ─── Accès aux modules ─────────────────────────────────────────────────────

  async checkModuleAccess(merchantId: string, moduleKey: ModuleKey): Promise<ModuleAccess> {
    const sub = await this.prisma.subscription.findUnique({ where: { merchantId }, include: { plan: true } });
    const plan = sub?.plan ?? (await this.prisma.billingPlan.findUnique({ where: { code: DEFAULT_PLAN } }));
    if (!plan) return { allowed: true, readonly: false, plan: 'aucun' }; // catalogue absent : rien n'est verrouillé
    return { allowed: plan.includedModules.includes(moduleKey), readonly: sub?.status === 'EXPIRED', plan: plan.code };
  }

  /** Limite de boutiques ou de caisses du palier (§M11) ; lève 403 au-delà. */
  async assertWithinLimit(merchantId: string, kind: 'stores' | 'tills', current: number): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { merchantId }, include: { plan: true } });
    const plan = sub?.plan ?? (await this.prisma.billingPlan.findUnique({ where: { code: DEFAULT_PLAN } }));
    const max = kind === 'stores' ? plan?.maxStores : plan?.maxTills;
    if (max != null && current >= max) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'limite_palier', `Votre palier ${plan!.label} est limité à ${max} ${kind === 'stores' ? 'boutique(s)' : 'caisse(s)'} : changez de palier pour en ajouter`);
    }
  }

  // ─── Factures AlphaPay ─────────────────────────────────────────────────────

  async listInvoices(merchantId: string) {
    const rows = await this.prisma.alphapayInvoice.findMany({ where: { merchantId }, orderBy: { createdAt: 'desc' }, take: 24 });
    return Promise.all(rows.map((r) => this.presentInvoice(r)));
  }

  private billingAccount(): { merchantId: string; livemode: boolean } {
    const merchantId = process.env.ALPHAPAY_BILLING_MERCHANT_ID;
    if (!merchantId) throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'facturation_non_configuree', 'Paiement des services AlphaPay momentanément indisponible');
    // Production : vrais paiements ; ailleurs, mode test (opérateur factice) sauf réglage contraire.
    const livemode = (process.env.ALPHAPAY_BILLING_LIVEMODE ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true';
    return { merchantId, livemode };
  }

  private async createInvoice(
    merchantId: string,
    p: { kind: 'SUBSCRIPTION' | 'CREDIT_PACK'; planId?: string; creditPackId?: string; amount: bigint; currency: string; label: string },
    subscriptionId?: string,
  ): Promise<AlphapayInvoice> {
    const account = this.billingAccount();
    const link = await this.links.create(
      account.merchantId,
      account.livemode,
      { amount: toMajorAmount(p.amount, p.currency), currency: p.currency, description: p.label, expiresAt: new Date(Date.now() + 15 * DAY) },
      { type: 'system', id: 'facturation' },
    );
    return this.prisma.alphapayInvoice.create({
      data: {
        merchantId,
        subscriptionId,
        kind: p.kind,
        planId: p.planId,
        creditPackId: p.creditPackId,
        amount: p.amount,
        currency: p.currency,
        dueDate: new Date(Date.now() + 7 * DAY),
        paymentLinkId: link.id,
      },
    });
  }

  private async presentInvoice(inv: AlphapayInvoice) {
    const link = inv.paymentLinkId ? await this.prisma.paymentLink.findFirst({ where: { id: inv.paymentLinkId, livemode: ANY_MODE } }) : null;
    return {
      id: inv.id,
      kind: inv.kind === 'CREDIT_PACK' ? 'pack_credits' : 'abonnement',
      amount: toMajorAmount(inv.amount, inv.currency),
      amount_display: formatAmount(inv.amount, inv.currency),
      status: inv.status === 'PAID' ? 'payée' : inv.status === 'CANCELED' ? 'annulée' : 'en_attente',
      due_date: inv.dueDate,
      paid_at: inv.paidAt,
      payment_url: link?.publicCode && inv.status === 'PENDING' ? PaymentLinksService.checkoutUrl(link.publicCode) : null,
    };
  }

  /** Paiement réussi sur le compte marchand d'AlphaPay : applique la facture correspondante (une seule fois). */
  private async onPaymentSucceeded(tx: Transaction) {
    if (!tx.paymentLinkId) return;
    const inv = await this.prisma.alphapayInvoice.findUnique({ where: { paymentLinkId: tx.paymentLinkId } });
    if (!inv || inv.status !== 'PENDING') return;
    const claimed = await this.prisma.alphapayInvoice.updateMany({ where: { id: inv.id, status: 'PENDING' }, data: { status: 'PAID', paidAt: new Date(), transactionId: tx.id } });
    if (claimed.count === 0) return; // déjà appliquée (callback rejoué)

    if (inv.kind === 'CREDIT_PACK' && inv.creditPackId) {
      const pack = await this.prisma.creditPack.findUniqueOrThrow({ where: { id: inv.creditPackId } });
      await this.prisma.creditLedger.create({ data: { merchantId: inv.merchantId, livemode: true, delta: pack.credits, reason: 'achat' } });
    } else if (inv.planId) {
      await this.activate(inv.merchantId, inv.planId);
    }
    await this.audit.record({ actorType: 'system', merchantId: inv.merchantId, action: 'billing.invoice_paid', targetType: 'alphapay_invoice', targetId: inv.id, metadata: { kind: inv.kind, transaction: tx.id } });
  }

  /** Active (ou prolonge de 30 jours) un palier ; crédits inclus versés à chaque période payée. */
  private async activate(merchantId: string, planId: string) {
    const plan = await this.prisma.billingPlan.findUniqueOrThrow({ where: { id: planId } });
    const current = await this.prisma.subscription.findUnique({ where: { merchantId } });
    const now = new Date();
    const from = current && current.planId === planId && current.periodEnd > now ? current.periodEnd : now;
    const periodEnd = new Date(from.getTime() + PERIOD_DAYS * DAY);
    await this.prisma.subscription.upsert({
      where: { merchantId },
      create: { merchantId, planId, status: 'ACTIVE', periodStart: now, periodEnd },
      update: { planId, status: 'ACTIVE', periodStart: from, periodEnd, canceledAt: null },
    });
    if (plan.includedCredits > 0) {
      await this.prisma.creditLedger.create({ data: { merchantId, livemode: true, delta: plan.includedCredits, reason: 'achat' } });
    }
  }

  // ─── Tâches quotidiennes : renouvellement, grâce, lecture seule, solde bas ─

  @Cron('0 0 6 * * *', { timeZone: 'Africa/Brazzaville' })
  async daily() {
    await this.cronLock.runExclusive('billing-daily', () => this.runDaily());
  }

  async runDaily(now = new Date()) {
    const subs = await this.prisma.subscription.findMany({ where: { status: { in: ['ACTIVE', 'GRACE', 'CANCELED'] }, periodEnd: { lte: now } }, include: { plan: true } });
    for (const sub of subs) {
      if (sub.status === 'CANCELED' || sub.plan.priceMonthly === 0n) {
        // Annulé ou gratuit : retour au palier gratuit à l'échéance.
        if (sub.status === 'CANCELED') {
          const free = await this.prisma.billingPlan.findUnique({ where: { code: DEFAULT_PLAN } });
          if (free) await this.prisma.subscription.update({ where: { id: sub.id }, data: { planId: free.id, status: 'ACTIVE', periodStart: now, periodEnd: new Date(now.getTime() + PERIOD_DAYS * DAY) } });
        } else {
          await this.prisma.subscription.update({ where: { id: sub.id }, data: { periodStart: now, periodEnd: new Date(now.getTime() + PERIOD_DAYS * DAY) } });
        }
        continue;
      }
      // Facture de la période suivante (une seule à la fois).
      let pending = await this.prisma.alphapayInvoice.findFirst({ where: { merchantId: sub.merchantId, kind: 'SUBSCRIPTION', status: 'PENDING' } });
      if (!pending) {
        try {
          pending = await this.createInvoice(sub.merchantId, { kind: 'SUBSCRIPTION', planId: sub.planId, amount: sub.plan.priceMonthly, currency: sub.plan.currency, label: `Abonnement AlphaPay ${sub.plan.label} (30 jours)` }, sub.id);
          await this.notifyOwner(sub.merchantId, `Votre facture AlphaPay de ${formatAmount(pending.amount, pending.currency)} est disponible dans le tableau de bord (Facturation).`);
        } catch (err) {
          this.logger.warn(`Facture d'abonnement non créée pour ${sub.merchantId} : ${(err as Error).message}`);
          continue;
        }
      }
      // Impayé : période de grâce, puis lecture seule (les encaissements continuent).
      const overdueDays = (now.getTime() - sub.periodEnd.getTime()) / DAY;
      const target = overdueDays > graceDays() ? 'EXPIRED' : 'GRACE';
      if (sub.status !== target) {
        await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: target } });
        await this.audit.record({ actorType: 'system', merchantId: sub.merchantId, action: target === 'EXPIRED' ? 'billing.read_only' : 'billing.grace_started', targetType: 'subscription', targetId: sub.id });
        await this.notifyOwner(
          sub.merchantId,
          target === 'EXPIRED'
            ? 'Abonnement AlphaPay impayé : les modules payants passent en lecture seule. Vos clients peuvent toujours vous payer.'
            : `Abonnement AlphaPay arrivé à échéance : réglez la facture sous ${graceDays()} jours pour garder vos modules.`,
        );
      }
    }
    await this.lowCreditAlerts();
  }

  /** Alerte de solde bas (§M11), au plus une fois par jour et par marchand. */
  private async lowCreditAlerts() {
    const threshold = lowCreditThreshold();
    if (threshold === 0) return;
    const rows = await this.prisma.creditLedger.groupBy({ by: ['merchantId'], where: { livemode: true }, _sum: { delta: true } });
    for (const r of rows) {
      const balance = r._sum.delta ?? 0;
      if (balance >= threshold) continue;
      if (!(await this.kv.setIfAbsent(`billing:low-credit:${r.merchantId}`, '1', 86_400))) continue;
      await this.notifyOwner(r.merchantId, `Solde de crédits de messages bas : ${balance} crédit(s). Rechargez dans le tableau de bord (Facturation).`);
    }
  }

  private async notifyOwner(merchantId: string, text: string) {
    const owner = await this.prisma.merchantMember.findFirst({
      where: { merchantId, role: 'OWNER', status: 'ACTIVE' },
      select: { user: { select: { emailEncrypted: true, phoneEncrypted: true } } },
    });
    if (!owner) return;
    const email = owner.user.emailEncrypted ? decryptField(owner.user.emailEncrypted) : undefined;
    const phone = owner.user.phoneEncrypted ? decryptField(owner.user.phoneEncrypted) : undefined;
    await this.messaging
      .send({ merchantId: null, livemode: true, channels: email ? ['EMAIL', 'SMS'] : ['SMS'], to: { email, phone }, templateKey: 'message.libre', variables: { subject: 'AlphaPay - facturation', text }, category: 'TRANSACTIONAL' })
      .catch((err) => this.logger.warn(`Notification de facturation non envoyée : ${(err as Error).message}`));
  }
}
