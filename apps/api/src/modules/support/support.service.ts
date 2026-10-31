import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ANY_MODE, Prisma, PrismaClient } from '@paybrain/database';
import { ProviderError } from '@paybrain/providers';
import { toE164 } from '@paybrain/shared';
import { ApiError } from '../../common/errors/api-error';
import { formatAmount, toMajorAmount } from '../../common/money';
import { JobQueue, QUEUES, QueueName } from '../../common/queue/job-queue';
import { decryptField, deterministicHash, maskEmail } from '../../common/security/pii-crypto';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { SessionService } from '../auth/session.service';
import { PaymentsService } from '../payments/payments.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { WebhookDeliveryService } from '../webhooks-out/webhook-delivery.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Un paiement en attente au-delà de ce délai est signalé comme bloqué. */
const STUCK_MS = 15 * 60_000;
const DAY_MS = 86_400_000;

const money = (v: bigint, currency = 'XAF') => ({ amount: toMajorAmount(v, currency), display: formatAmount(v, currency) });

function paymentRow(tx: { id: string; merchantId: string; livemode: boolean; status: string; operator: string; amount: bigint; currency: string; externalId: string; payerPhoneMask: string | null; failureReason: string | null; createdAt: Date; merchant?: { name: string } }) {
  return {
    id: tx.id,
    merchant_id: tx.merchantId,
    merchant_name: tx.merchant?.name,
    livemode: tx.livemode,
    status: tx.status,
    operator: tx.operator,
    ...money(tx.amount, tx.currency),
    reference: tx.externalId,
    payer_phone: tx.payerPhoneMask,
    failure_reason: tx.failureReason,
    created_at: tx.createdAt,
  };
}

/**
 * Assistance (§M12) : tout ce qu'un agent doit voir pour dépanner un client
 * (paiements, webhooks, clés, journaux d'API, messages, équipe, journal), et
 * les gestes de dépannage. Jamais de secret ni de donnée personnelle en clair :
 * numéros et emails masqués, secrets de clés et d'endpoints jamais renvoyés.
 */
@Injectable()
export class SupportService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(JobQueue) private readonly queue: JobQueue,
    private readonly payments: PaymentsService,
    private readonly webhooks: WebhooksService,
    private readonly deliveries: WebhookDeliveryService,
    private readonly apiKeys: ApiKeysService,
    private readonly sessions: SessionService,
  ) {}

  // ─── Recherche globale ────────────────────────────────────────────────────

  /** Un identifiant, une référence, un numéro de payeur, un préfixe de clé ou un nom de marchand. */
  async search(raw: string) {
    const q = raw.trim();
    if (q.length < 3) return { payments: [], merchants: [] };

    const txOr: Prisma.TransactionWhereInput[] = [{ externalId: q }, { mtnReferenceId: q }];
    if (UUID.test(q)) txOr.push({ id: q });
    try {
      txOr.push({ payerPhoneHash: new Uint8Array(deterministicHash(toE164(q))) });
    } catch {
      // Pas un numéro de téléphone.
    }
    const merchantOr: Prisma.MerchantWhereInput[] = [
      { name: { contains: q, mode: 'insensitive' } },
      { companyName: { contains: q, mode: 'insensitive' } },
      { apiKeys: { some: { prefix: { startsWith: q } } } },
    ];
    if (UUID.test(q)) {
      merchantOr.push({ id: q });
      // Livraison de webhook ou endpoint cité par le client.
      merchantOr.push({ webhookEndpoints: { some: { OR: [{ id: q }, { deliveries: { some: { OR: [{ id: q }, { webhookId: q }] } } }] } } });
    }

    const [payments, merchants] = await Promise.all([
      this.prisma.transaction.findMany({ where: { OR: txOr, livemode: ANY_MODE }, orderBy: { createdAt: 'desc' }, take: 20, include: { merchant: { select: { name: true } } } }),
      this.prisma.merchant.findMany({
        where: { OR: merchantOr },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, name: true, onboardingStatus: true, isActive: true, createdAt: true },
      }),
    ]);
    return { payments: payments.map(paymentRow), merchants };
  }

  // ─── Paiement : tout son parcours ─────────────────────────────────────────

  async payment(id: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        merchant: { select: { name: true } },
        audits: { orderBy: { createdAt: 'asc' } },
        outboxEvents: { orderBy: { createdAt: 'asc' } },
        webhookLogs: { orderBy: { processedAt: 'asc' }, select: { id: true, event: true, processedAt: true } },
        refunds: { orderBy: { createdAt: 'asc' } },
        disputes: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!tx) throw new NotFoundException('Paiement introuvable');
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: { endpoint: { merchantId: tx.merchantId }, payload: { path: ['data', 'object', 'id'], equals: tx.id } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, event: true, status: true, attempts: true, responseStatus: true, lastError: true, createdAt: true, endpoint: { select: { url: true } } },
    });
    return {
      ...paymentRow(tx),
      provider_reference: tx.mtnReferenceId,
      description: tx.payerMessage,
      retry_count: tx.retryCount,
      store_id: tx.storeId,
      till_id: tx.tillId,
      payment_link_id: tx.paymentLinkId,
      updated_at: tx.updatedAt,
      card: tx.operator === 'CARD' ? { brand: tx.cardBrand, last4: tx.cardLast4 } : null,
      amount_refunded: money(tx.amountRefunded, tx.currency),
      refunds: tx.refunds.map((r) => ({ id: r.id, ...money(r.amount, r.currency), reason: r.reason, method: r.method, status: r.status, failure_reason: r.failureReason, actor_type: r.actorType, created_at: r.createdAt })),
      disputes: tx.disputes.map((d) => ({ id: d.id, ...money(d.amount, d.currency), reason: d.reason, status: d.status, evidence_due_at: d.evidenceDueAt, evidence: d.evidenceText, created_at: d.createdAt })),
      stuck: tx.status === 'PENDING' && Date.now() - tx.createdAt.getTime() > STUCK_MS,
      history: tx.audits.map((a) => ({ from: a.fromStatus, to: a.toStatus, reason: a.reason, at: a.createdAt })),
      operator_requests: tx.outboxEvents.map((e) => ({ id: e.id, type: e.type, status: e.status, attempts: e.attempts, last_error: e.lastError, next_attempt_at: e.nextAttemptAt })),
      operator_callbacks: tx.webhookLogs.map((w) => ({ id: w.id, event: w.event, at: w.processedAt })),
      webhooks: deliveries.map((d) => ({ id: d.id, event: d.event, url: d.endpoint.url, status: d.status, attempts: d.attempts, response_status: d.responseStatus, last_error: d.lastError, created_at: d.createdAt })),
    };
  }

  /**
   * Interroge l'opérateur et applique le statut qu'il confirme (D-021 : seule
   * source de vérité). Sans référence opérateur, relance la demande en échec.
   */
  async refreshPayment(id: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx) throw new NotFoundException('Paiement introuvable');
    if (tx.status !== 'PENDING') return { changed: false, status: tx.status, detail: 'statut déjà final' };
    if (!tx.mtnReferenceId) {
      const requeued = await this.prisma.outboxEvent.updateMany({
        where: { transactionId: id, status: 'DEAD' },
        data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date() },
      });
      return { changed: false, status: tx.status, detail: requeued.count ? 'demande opérateur relancée' : 'demande opérateur en cours' };
    }
    let verified;
    try {
      verified = await this.payments.fetchProviderStatus({ ...tx, mtnReferenceId: tx.mtnReferenceId });
    } catch (err) {
      const detail = err instanceof ProviderError ? `${err.code}: ${err.message}` : (err as Error).message;
      throw new ApiError(502, 'operateur_injoignable', `L'opérateur ne répond pas : ${detail}`);
    }
    const changed = await this.webhooks.applyVerifiedStatus(tx, verified.status, verified.failureReason, 'back-office : vérification opérateur');
    return { changed, status: changed ? verified.status : tx.status, operator_status: verified.status };
  }

  async requeueOutbox(id: string) {
    const event = await this.prisma.outboxEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Demande introuvable');
    if (event.status !== 'DEAD') throw new ApiError(409, 'etat_incompatible', 'Seule une demande en échec définitif peut être relancée');
    await this.prisma.outboxEvent.update({ where: { id }, data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date() } });
    return { id, status: 'PENDING', transaction_id: event.transactionId };
  }

  // ─── Marchand : paiements, développeurs, messages, équipe, journal ────────

  async merchantPayments(merchantId: string, opts: { status?: string; mode?: string; cursor?: string }) {
    // Le back-office voit les deux modes (§4.6 : explicite, jamais par oubli).
    const where: Prisma.TransactionWhereInput = { merchantId, livemode: ANY_MODE };
    if (opts.mode === 'live' || opts.mode === 'test') where.livemode = opts.mode === 'live';
    const status = opts.status?.toUpperCase();
    if (status && ['PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELED'].includes(status)) where.status = status as any;
    const rows = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      ...(opts.cursor && UUID.test(opts.cursor) ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    return rows.map(paymentRow);
  }

  async developers(merchantId: string) {
    const since = new Date(Date.now() - DAY_MS);
    const [keys, endpoints, deliveries, logs, calls, errors] = await Promise.all([
      this.prisma.apiKey.findMany({
        where: { merchantId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, mode: true, prefix: true, scopes: true, ipAllowlist: true, lastUsedAt: true, revokedAt: true, createdAt: true },
      }),
      this.prisma.webhookEndpoint.findMany({
        where: { merchantId, livemode: ANY_MODE },
        orderBy: { createdAt: 'desc' },
        select: { id: true, url: true, events: true, livemode: true, status: true, createdAt: true },
      }),
      this.prisma.webhookDelivery.findMany({
        where: { endpoint: { merchantId } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, endpointId: true, event: true, webhookId: true, status: true, attempts: true, responseStatus: true, responseBody: true, lastError: true, nextRetryAt: true, createdAt: true },
      }),
      this.prisma.apiRequestLog.findMany({ where: { merchantId, livemode: ANY_MODE }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.apiRequestLog.count({ where: { merchantId, livemode: ANY_MODE, createdAt: { gte: since } } }),
      this.prisma.apiRequestLog.count({ where: { merchantId, livemode: ANY_MODE, createdAt: { gte: since }, status: { gte: 400 } } }),
    ]);
    return {
      api_keys: keys,
      webhook_endpoints: endpoints,
      deliveries: deliveries.map((d) => ({ ...d, responseBody: d.responseBody?.slice(0, 500) ?? null })),
      api_logs: logs,
      api_24h: { calls, errors, error_rate_pct: calls ? Math.round((errors / calls) * 10_000) / 100 : 0 },
    };
  }

  messages(merchantId: string) {
    return this.prisma.message.findMany({
      where: { merchantId, livemode: ANY_MODE },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, livemode: true, channel: true, category: true, templateKey: true, destinationMasked: true,
        status: true, provider: true, attempts: true, lastError: true, creditsCharged: true, createdAt: true, deliveredAt: true, failedAt: true,
      },
    });
  }

  async team(merchantId: string) {
    const members = await this.prisma.merchantMember.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, fullName: true, emailEncrypted: true, phoneMasked: true, status: true, lastLoginAt: true } } },
    });
    const now = new Date();
    const active = await this.prisma.session.groupBy({
      by: ['userId'],
      where: { userId: { in: members.map((m) => m.userId) }, revokedAt: null, expiresAt: { gt: now } },
      _count: { id: true },
    });
    const sessions = new Map(active.map((s) => [s.userId, s._count.id]));
    return members.map((m) => ({
      id: m.id,
      role: m.role,
      status: m.status,
      name: m.user.fullName,
      email: maskEmail(decryptField(m.user.emailEncrypted)),
      phone: m.user.phoneMasked,
      user_status: m.user.status,
      last_login_at: m.user.lastLoginAt,
      active_sessions: sessions.get(m.userId) ?? 0,
      joined_at: m.joinedAt,
    }));
  }

  // ─── Journal d'audit (marchand ou global) ─────────────────────────────────

  async audit(filter: { merchantId?: string; action?: string; actorType?: string; cursor?: string }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (filter.merchantId) where.merchantId = filter.merchantId;
    if (filter.action) where.action = { startsWith: filter.action };
    if (filter.actorType) where.actorType = filter.actorType;
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      ...(filter.cursor && UUID.test(filter.cursor) ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      select: { id: true, actorType: true, actorId: true, merchantId: true, action: true, targetType: true, targetId: true, metadata: true, createdAt: true },
    });
    const staffIds = [...new Set(rows.filter((r) => r.actorType === 'staff' && r.actorId).map((r) => r.actorId!))];
    const staff = staffIds.length ? await this.prisma.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, displayName: true } }) : [];
    const names = new Map(staff.map((s) => [s.id, s.displayName]));
    return rows.map((r) => ({ ...r, actor_name: r.actorType === 'staff' && r.actorId ? names.get(r.actorId) ?? null : null }));
  }

  // ─── Gestes de dépannage ──────────────────────────────────────────────────

  async resendDelivery(id: string) {
    const delivery = await this.prisma.webhookDelivery.findUnique({ where: { id }, include: { endpoint: { select: { merchantId: true } } } });
    if (!delivery) throw new NotFoundException('Livraison introuvable');
    const result = await this.deliveries.resend(delivery);
    return { merchantId: delivery.endpoint.merchantId, result };
  }

  async testEndpoint(merchantId: string, endpointId: string) {
    const endpoint = await this.ownedEndpoint(merchantId, endpointId);
    return this.deliveries.sendTest({ id: endpoint.id, url: endpoint.url, secret: endpoint.secret });
  }

  async setEndpointStatus(merchantId: string, endpointId: string, active: boolean) {
    await this.ownedEndpoint(merchantId, endpointId);
    const updated = await this.prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { status: active ? 'ACTIVE' : 'DISABLED' }, select: { id: true, status: true } });
    return updated;
  }

  revokeKey(merchantId: string, keyId: string) {
    return this.apiKeys.revoke(merchantId, keyId);
  }

  /** Déconnecte un membre partout (compte compromis, appareil perdu). */
  async revokeMemberSessions(merchantId: string, memberId: string) {
    const member = await this.prisma.merchantMember.findFirst({ where: { id: memberId, merchantId } });
    if (!member) throw new NotFoundException('Membre introuvable');
    const revoked = await this.sessions.revokeAll(member.userId, 'back-office');
    return { userId: member.userId, revoked };
  }

  async assertMerchant(merchantId: string) {
    const exists = await this.prisma.merchant.count({ where: { id: merchantId } });
    if (!exists) throw new NotFoundException('Marchand introuvable');
  }

  private async ownedEndpoint(merchantId: string, endpointId: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id: endpointId, merchantId } });
    if (!endpoint) throw new NotFoundException('Endpoint introuvable');
    return endpoint;
  }

  // ─── Santé de la plateforme ───────────────────────────────────────────────

  async system() {
    const now = Date.now();
    const since = new Date(now - DAY_MS);
    const started = Date.now();
    let database: 'ok' | 'ko' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'ko';
    }
    const dbMs = Date.now() - started;
    const queues = await this.queue.counts().catch(() => null);
    const [outbox, webhooksPending, webhooksFailed, messagesQueued, messagesFailed, stuck, connections, lastRuns] = await Promise.all([
      this.prisma.outboxEvent.groupBy({ by: ['status'], where: { status: { in: ['PENDING', 'PROCESSING', 'DEAD'] } }, _count: { id: true } }),
      this.prisma.webhookDelivery.count({ where: { status: 'PENDING' } }),
      this.prisma.webhookDelivery.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
      this.prisma.message.count({ where: { status: 'QUEUED', livemode: ANY_MODE } }),
      this.prisma.message.count({ where: { status: 'FAILED', livemode: ANY_MODE, createdAt: { gte: since } } }),
      this.prisma.transaction.findMany({
        where: { status: 'PENDING', livemode: true, createdAt: { lt: new Date(now - STUCK_MS) } },
        orderBy: { createdAt: 'asc' },
        take: 20,
        include: { merchant: { select: { name: true } } },
      }),
      this.prisma.providerConnection.groupBy({ by: ['operator', 'livemode', 'status'], where: { livemode: ANY_MODE }, _count: { id: true } }),
      this.prisma.reconciliationRun.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, operator: true, statementDate: true, discrepancyCount: true, alert: true, createdAt: true } }),
    ]);
    const deadOutbox = await this.prisma.outboxEvent.findMany({
      where: { status: 'DEAD' },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, transactionId: true, type: true, attempts: true, lastError: true, updatedAt: true },
    });
    return {
      database: { status: database, latency_ms: dbMs },
      queues,
      outbox: Object.fromEntries(outbox.map((o) => [o.status, o._count.id])),
      dead_outbox: deadOutbox,
      webhooks: { pending: webhooksPending, failed_24h: webhooksFailed },
      messages: { queued: messagesQueued, failed_24h: messagesFailed },
      stuck_payments: stuck.map(paymentRow),
      provider_connections: connections.map((c) => ({ operator: c.operator, livemode: c.livemode, status: c.status, count: c._count.id })),
      reconciliation_runs: lastRuns,
    };
  }

  retryQueue(queue: string) {
    if (!(Object.values(QUEUES) as string[]).includes(queue)) throw new NotFoundException('File inconnue');
    return this.queue.retryFailed(queue as QueueName);
  }
}
