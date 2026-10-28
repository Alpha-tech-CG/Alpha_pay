import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { toMajorAmount } from '../../common/money';

// ─── Contrôle d'accès par palier (T-83) ──────────────────────────────────────

export const MODULE_KEYS = {
  m6_manage: 'M6 Gérer',
  m7_recover: 'M7 Recouvrer',
  m8_school: 'M8 Pack École',
  m9_messaging: 'M9 Messages',
  m10_developers: 'M10 Développeurs',
  m11_billing: 'M11 Facturation',
} as const;

export type ModuleKey = keyof typeof MODULE_KEYS;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class BillingService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  // ─── Plans ─────────────────────────────────────────────────────────────────

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
    }));
  }

  // ─── Abonnement (T-81) ────────────────────────────────────────────────────

  async getSubscription(merchantId: string) {
    return this.prisma.subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });
  }

  async subscribe(merchantId: string, planCode: string) {
    const plan = await this.prisma.billingPlan.findUnique({ where: { code: planCode } });
    if (!plan) throw new NotFoundException(`Plan ${planCode} introuvable`);

    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 30);

    const sub = await this.prisma.subscription.upsert({
      where: { merchantId },
      create: { merchantId, planId: plan.id, status: 'TRIAL', periodStart, periodEnd },
      update: { planId: plan.id, status: 'ACTIVE', periodStart, periodEnd },
    });

    // Crédite les crédits inclus dans le plan
    if (plan.includedCredits > 0) {
      await this.prisma.creditLedger.create({
        data: {
          merchantId,
          delta: plan.includedCredits,
          reason: 'plan_included',
          refId: plan.id,
        } as any,
      });
    }

    return sub;
  }

  async cancelSubscription(merchantId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { merchantId } });
    if (!sub) throw new NotFoundException('Abonnement introuvable');
    return this.prisma.subscription.update({
      where: { merchantId },
      data: { status: 'CANCELED', canceledAt: new Date() },
    });
  }

  // ─── Crédits (T-82) ───────────────────────────────────────────────────────

  listCreditPacks() {
    return this.prisma.creditPack.findMany({ where: { isActive: true }, orderBy: { credits: 'asc' } });
  }

  async getBalance(merchantId: string): Promise<number> {
    const agg = await this.prisma.creditLedger.aggregate({
      where: { merchantId } as any,
      _sum: { delta: true },
    });
    return agg._sum.delta ?? 0;
  }

  async purchasePack(merchantId: string, packCode: string) {
    const pack = await this.prisma.creditPack.findUnique({ where: { code: packCode } });
    if (!pack) throw new NotFoundException(`Pack ${packCode} introuvable`);

    await this.prisma.creditLedger.create({
      data: { merchantId, delta: pack.credits, reason: 'pack_purchase', refId: pack.id } as any,
    });

    // TODO : créer une facture AlphaPay et un paiement livemode pour le pack
    const balance = await this.getBalance(merchantId);
    return { pack_code: packCode, credits_added: pack.credits, new_balance: balance };
  }

  async debitCredit(merchantId: string, amount: number, reason: string, refId?: string) {
    if (amount <= 0) throw new BadRequestException({ code: 'montant_invalide', message: 'amount must be > 0' });
    const balance = await this.getBalance(merchantId);
    if (balance < amount) {
      throw new BadRequestException({ code: 'credits_insuffisants', balance, required: amount });
    }
    await this.prisma.creditLedger.create({
      data: { merchantId, delta: -amount, reason, refId } as any,
    });
    return { new_balance: balance - amount };
  }

  // ─── Contrôle d'accès par palier (T-83) ──────────────────────────────────

  async checkModuleAccess(merchantId: string, moduleKey: ModuleKey): Promise<{ allowed: boolean; readonly: boolean }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });

    // Sans abonnement : accès par défaut aux modules de base (TRIAL implicite)
    if (!sub) return { allowed: true, readonly: false };

    const included = sub.plan.includedModules.includes(moduleKey);
    const grace = sub.status === 'GRACE';

    // Module non inclus dans le plan => verrouillé visible
    if (!included && sub.status !== 'TRIAL') return { allowed: false, readonly: false };

    // Période de grâce => lecture seule (jamais bloquer les encaissements)
    if (grace) return { allowed: true, readonly: true };

    return { allowed: true, readonly: false };
  }

  // ─── Factures AlphaPay (T-81) ─────────────────────────────────────────────

  listInvoices(merchantId: string) {
    return this.prisma.alphapayInvoice.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });
  }
}
