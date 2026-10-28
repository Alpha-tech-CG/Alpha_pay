import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ANY_MODE, PrismaClient } from '@paybrain/database';
import { MockWebPushProvider, ProviderError, VapidWebPushProvider, WebPushProvider } from '@paybrain/providers';
import { randomBytes } from 'crypto';
import { ApiError } from '../../common/errors/api-error';
import { KvStore } from '../../common/kv/kv-store';
import { formatAmount, toMajorAmount } from '../../common/money';
import { decryptField } from '../../common/security/pii-crypto';
import { MessagingService } from '../messaging/messaging.service';
import { StoresService } from '../stores/stores.service';
import { MemberRole } from '../team/permissions/permissions';
import { VerifBus, VerifEvent } from './verif-bus';

/** Fuseau du Congo pour « les paiements du jour » (UTC+1, sans heure d'été). */
const CONGO_OFFSET_MS = 60 * 60 * 1000;
const TICKET_TTL_S = 60;

/** Référence courte lisible au comptoir (« AP-8F3K2 »), dérivée de l'id du paiement. */
export function shortRef(id: string): string {
  return `AP-${id.replace(/-/g, '').slice(0, 5).toUpperCase()}`;
}

/** Fournisseur web push : VAPID si les clés sont configurées, factice sinon (§2.7). */
export function webPushProviderFromEnv(): WebPushProvider {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    return new VapidWebPushProvider({ publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT ?? 'mailto:support@alphapay.cg' });
  }
  return new MockWebPushProvider();
}
export const WEB_PUSH = Symbol('WEB_PUSH');

/** Membre abonné au flux temps réel. */
export interface StreamViewer {
  merchantId: string;
  memberId: string;
  role: MemberRole;
}

/**
 * Vérif (T-55, §M5) : dès qu'un paiement passe à « réussi », le propriétaire et
 * les caissiers de la caisse reçoivent la confirmation — flux temps réel du
 * tableau de bord, web push, et SMS/WhatsApp si la caisse l'a activé. Un
 * paiement échoué n'est JAMAIS confirmé (seul l'appel sur SUCCEEDED déclenche).
 */
@Injectable()
export class VerifService {
  private readonly logger = new Logger(VerifService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(WEB_PUSH) private readonly push: WebPushProvider,
    private readonly bus: VerifBus,
    private readonly messaging: MessagingService,
    private readonly stores: StoresService,
    private readonly kv: KvStore,
  ) {}

  get pushPublicKey(): string {
    return this.push.publicKey;
  }

  /** Appelé après la transition vers SUCCEEDED. N'échoue jamais : la confirmation ne bloque pas le paiement. */
  async onPaymentSucceeded(transactionId: string): Promise<void> {
    try {
      await this.confirm(transactionId);
    } catch (err: any) {
      this.logger.error(`Vérif : confirmation impossible pour ${transactionId} : ${err?.message}`);
    }
  }

  private async confirm(transactionId: string) {
    const tx = await this.prisma.transaction.findFirst({ where: { id: transactionId, livemode: ANY_MODE } });
    if (!tx || tx.status !== 'SUCCEEDED') return;
    const till = tx.tillId
      ? await this.prisma.till.findUnique({ where: { id: tx.tillId }, select: { name: true, confirmBySms: true, confirmByWhatsApp: true } })
      : null;

    const amountDisplay = formatAmount(tx.amount, tx.currency);
    const operator = tx.operator === 'AIRTEL' ? 'Airtel' : 'MTN';
    const payer = tx.payerPhoneMask ?? 'un client';
    const ref = shortRef(tx.id);
    const event: VerifEvent = {
      merchantId: tx.merchantId,
      tillId: tx.tillId,
      payment: {
        id: tx.id,
        ref,
        amount: toMajorAmount(tx.amount, tx.currency),
        currency: tx.currency,
        amount_display: amountDisplay,
        operator: operator.toLowerCase(),
        payer,
        store_id: tx.storeId,
        till_id: tx.tillId,
        till_name: till?.name ?? null,
        livemode: tx.livemode,
        at: tx.updatedAt.toISOString(),
      },
      message: `Paiement reçu : ${amountDisplay} de ${payer}, ${operator}, réf. ${ref}`,
    };

    // 1. Temps réel d'abord (objectif < 5 s, §M5).
    await this.bus.publish(event);

    // 2. Destinataires : propriétaire(s) + caissiers rattachés à la caisse.
    const recipients = await this.prisma.merchantMember.findMany({
      where: {
        merchantId: tx.merchantId,
        status: 'ACTIVE',
        OR: [{ role: 'OWNER' }, ...(tx.tillId ? [{ role: 'CASHIER' as const, tills: { some: { tillId: tx.tillId } } }] : [])],
      },
      select: { id: true, user: { select: { phoneEncrypted: true } }, pushSubscriptions: true },
    });

    await Promise.all([
      this.sendPushes(recipients.flatMap((r) => r.pushSubscriptions), event),
      this.sendMessages(tx, till, recipients, event),
    ]);
  }

  private async sendPushes(subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[], event: VerifEvent) {
    const payload = {
      title: event.payment.livemode ? 'Paiement reçu' : 'Paiement reçu (test)',
      body: `${event.payment.amount_display} · ${event.payment.operator.toUpperCase()} · réf. ${event.payment.ref}`,
      tag: `verif-${event.payment.till_id ?? 'api'}`,
      url: '/caisse',
      data: { paymentId: event.payment.id },
    };
    await Promise.all(
      subscriptions.map(async (s) => {
        try {
          await this.push.send(s, payload, { ttlSeconds: 600 });
          await this.prisma.webPushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
        } catch (err) {
          if (err instanceof ProviderError && err.code === 'not_found') {
            await this.prisma.webPushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
          } else {
            this.logger.warn(`Vérif : web push non délivré (${(err as Error).message})`);
          }
        }
      }),
    );
  }

  /** SMS/WhatsApp en option, réglés par caisse (§M5). */
  private async sendMessages(
    tx: { merchantId: string; livemode: boolean },
    till: { confirmBySms: boolean; confirmByWhatsApp: boolean } | null,
    recipients: { user: { phoneEncrypted: Uint8Array | null } }[],
    event: VerifEvent,
  ) {
    if (!till || (!till.confirmBySms && !till.confirmByWhatsApp)) return;
    const channels = [...(till.confirmByWhatsApp ? (['WHATSAPP'] as const) : []), ...(till.confirmBySms ? (['SMS'] as const) : [])];
    const p = event.payment;
    for (const r of recipients) {
      if (!r.user.phoneEncrypted) continue;
      await this.messaging
        .send({
          merchantId: tx.merchantId,
          livemode: tx.livemode,
          channels: [...channels],
          to: { phone: decryptField(r.user.phoneEncrypted) },
          templateKey: 'verif.paiement_recu',
          variables: { amount: p.amount_display, payer: p.payer, operator: p.operator === 'airtel' ? 'Airtel' : 'MTN', reference: p.ref },
          category: 'TRANSACTIONAL',
        })
        .catch((err) => this.logger.warn(`Vérif : message non envoyé (${err?.message})`));
    }
  }

  // ─── Flux temps réel (SSE) ───────────────────────────────────────────────

  /** Ticket à usage unique (60 s) : EventSource ne peut pas envoyer d'en-tête Authorization. */
  async createStreamTicket(viewer: StreamViewer): Promise<{ ticket: string; expires_in: number }> {
    const ticket = randomBytes(24).toString('base64url');
    await this.kv.set(`verif:ticket:${ticket}`, JSON.stringify(viewer), TICKET_TTL_S);
    return { ticket, expires_in: TICKET_TTL_S };
  }

  async redeemStreamTicket(ticket: string | undefined): Promise<StreamViewer> {
    const key = `verif:ticket:${ticket ?? ''}`;
    const raw = ticket ? await this.kv.get(key) : null;
    // Usage unique : seul celui qui supprime effectivement la clé l'utilise.
    if (!raw || (await this.kv.del(key)) !== 1) throw new ApiError(HttpStatus.UNAUTHORIZED, 'ticket_invalide', 'Ticket de flux invalide ou expiré');
    const viewer = JSON.parse(raw) as StreamViewer;
    // Le membre doit être toujours actif (retrait ou suspension depuis l'émission).
    const member = await this.prisma.merchantMember.findFirst({ where: { id: viewer.memberId, merchantId: viewer.merchantId, status: 'ACTIVE' }, select: { role: true } });
    if (!member) throw new ApiError(HttpStatus.UNAUTHORIZED, 'ticket_invalide', 'Accès retiré');
    return { ...viewer, role: member.role as MemberRole };
  }

  /** Abonne un membre aux confirmations qu'il a le droit de voir (périmètre caisse du caissier). */
  async subscribe(viewer: StreamViewer, onEvent: (event: VerifEvent) => void): Promise<() => void> {
    const visible = await this.stores.visibleTillIds(viewer.merchantId, viewer);
    return this.bus.subscribe((event) => {
      if (event.merchantId !== viewer.merchantId) return;
      if (visible !== 'all' && (!event.tillId || !visible.includes(event.tillId))) return;
      onEvent(event);
    });
  }

  /** Écran Caisse : paiements réussis du jour (heure du Congo), dans le périmètre du membre. */
  async today(viewer: StreamViewer, livemode: boolean, tillId?: string) {
    const visible = await this.stores.visibleTillIds(viewer.merchantId, viewer);
    if (visible !== 'all' && visible.length === 0) throw new ApiError(HttpStatus.FORBIDDEN, 'acces_refuse', 'Aucune caisse rattachée');
    if (tillId && visible !== 'all' && !visible.includes(tillId)) throw new ApiError(HttpStatus.FORBIDDEN, 'acces_refuse', 'Caisse hors de votre périmètre');

    const now = Date.now();
    const startOfDay = new Date(Math.floor((now + CONGO_OFFSET_MS) / 86_400_000) * 86_400_000 - CONGO_OFFSET_MS);
    const rows = await this.prisma.transaction.findMany({
      where: {
        merchantId: viewer.merchantId,
        livemode,
        status: 'SUCCEEDED',
        updatedAt: { gte: startOfDay },
        ...(tillId ? { tillId } : visible === 'all' ? {} : { tillId: { in: visible } }),
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    const tills = await this.prisma.till.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.tillId).filter(Boolean))] as string[] } }, select: { id: true, name: true } });
    const tillName = new Map(tills.map((t) => [t.id, t.name]));
    const total = rows.reduce((sum, r) => sum + r.amount, 0n);
    return {
      date: new Date(startOfDay.getTime() + CONGO_OFFSET_MS).toISOString().slice(0, 10),
      count: rows.length,
      total: toMajorAmount(total, 'XAF'),
      total_display: formatAmount(total, 'XAF'),
      data: rows.map((r) => ({
        id: r.id,
        ref: shortRef(r.id),
        amount: toMajorAmount(r.amount, r.currency),
        amount_display: formatAmount(r.amount, r.currency),
        operator: r.operator.toLowerCase(),
        payer: r.payerPhoneMask,
        till_id: r.tillId,
        till_name: r.tillId ? tillName.get(r.tillId) ?? null : null,
        at: r.updatedAt,
      })),
      notice: LIMIT_NOTICE,
    };
  }

  // ─── Abonnements web push ────────────────────────────────────────────────

  async savePushSubscription(memberId: string, sub: { endpoint: string; p256dh: string; auth: string }, userAgent?: string) {
    await this.prisma.webPushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { memberId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, userAgent: userAgent?.slice(0, 250) },
      update: { memberId, p256dh: sub.p256dh, auth: sub.auth, userAgent: userAgent?.slice(0, 250) },
    });
    return { ok: true };
  }

  async deletePushSubscription(memberId: string, endpoint: string) {
    await this.prisma.webPushSubscription.deleteMany({ where: { memberId, endpoint } });
    return { ok: true };
  }
}

/** Limite à afficher clairement au marchand (§M5). */
export const LIMIT_NOTICE =
  "Vérif confirme uniquement les paiements passés par AlphaPay (QR, lien, page de paiement, API). Un transfert envoyé directement à votre numéro Mobile Money, hors AlphaPay, n'apparaît pas ici.";
