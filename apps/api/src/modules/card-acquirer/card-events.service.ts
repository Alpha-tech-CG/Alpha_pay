import { Inject, Injectable, Logger } from '@nestjs/common';
import { ANY_MODE, Dispute, PrismaClient } from '@paybrain/database';
import { CardAcquirer, CardDisputeEvent, CardWebhookEvent, IncomingRequest, ProviderError } from '@paybrain/providers';
import { AuditService } from '../../common/audit/audit.service';
import { ApiError } from '../../common/errors/api-error';
import { formatAmount, toMajorAmount } from '../../common/money';
import { CardAcquirerRegistry } from '../providers/card-acquirer.registry';
import { PaymentsService } from '../payments/payments.service';
import { RefundsService } from '../payments/refunds.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { WebhookDeliveryService } from '../webhooks-out/webhook-delivery.service';

const DISPUTE_STATUS = { open: 'OPEN', under_review: 'UNDER_REVIEW', won: 'WON', lost: 'LOST' } as const;

export function presentDispute(d: Dispute) {
  return {
    id: d.id,
    object: 'dispute',
    payment_id: d.transactionId,
    livemode: d.livemode,
    amount: toMajorAmount(d.amount, d.currency),
    amount_display: formatAmount(d.amount, d.currency),
    currency: d.currency,
    reason: d.reason,
    status: { OPEN: 'ouvert', UNDER_REVIEW: 'en_examen', WON: 'gagné', LOST: 'perdu' }[d.status],
    evidence_due_at: d.evidenceDueAt,
    evidence_sent_at: d.evidenceSentAt,
    closed_at: d.closedAt,
    created_at: d.createdAt,
  };
}

/**
 * Événements de l'acquéreur carte (§M13) : paiement, remboursement, litige.
 * Comme pour MTN (D-021), un webhook de paiement n'est jamais cru sur parole :
 * le statut est relu chez l'acquéreur avant toute transition.
 */
@Injectable()
export class CardEventsService {
  private readonly logger = new Logger(CardEventsService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly cards: CardAcquirerRegistry,
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
    private readonly webhooks: WebhooksService,
    private readonly deliveries: WebhookDeliveryService,
    private readonly audit: AuditService,
  ) {}

  /** Vérifie la signature puis traite l'événement ; `scope` = marchand de la connexion (acquéreur réel). */
  async handle(acquirer: CardAcquirer, req: IncomingRequest, scope?: { merchantId: string; livemode: boolean }) {
    let event: CardWebhookEvent | null;
    try {
      event = acquirer.parseWebhook(req);
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'invalid_signature') throw new ApiError(401, 'signature_invalide', 'Signature invalide');
      throw err;
    }
    if (!event) return { received: true, ignored: true };
    if (event.type === 'payment') await this.onPayment(event.payment.providerRef, scope);
    else if (event.type === 'refund') await this.onRefund(event.refund.reference, event.refund.status, event.refund.refundRef, event.refund.failureReason);
    else await this.onDispute(event.dispute, scope);
    return { received: true };
  }

  private async findPayment(sessionId: string, scope?: { merchantId: string; livemode: boolean }) {
    return this.prisma.transaction.findFirst({
      where: { mtnReferenceId: sessionId, operator: 'CARD', livemode: scope?.livemode ?? ANY_MODE, ...(scope ? { merchantId: scope.merchantId } : {}) },
    });
  }

  private async onPayment(sessionId: string, scope?: { merchantId: string; livemode: boolean }) {
    const tx = await this.findPayment(sessionId, scope);
    if (!tx || tx.status !== 'PENDING') return;
    const verified = await this.payments.fetchProviderStatus({ ...tx, mtnReferenceId: sessionId });
    await this.webhooks.applyVerifiedStatus(tx, verified.status, verified.failureReason, 'webhook carte');
  }

  private async onRefund(refundId: string, status: 'pending' | 'succeeded' | 'failed', refundRef: string, failureReason?: string) {
    const refund = await this.prisma.refund.findFirst({ where: { id: refundId, livemode: ANY_MODE } });
    if (!refund || status === 'pending') return;
    await this.refunds.settle(refund, status === 'succeeded' ? 'SUCCEEDED' : 'FAILED', refundRef, failureReason);
  }

  private async onDispute(d: CardDisputeEvent, scope?: { merchantId: string; livemode: boolean }) {
    const tx = await this.findPayment(d.sessionId, scope);
    if (!tx) {
      this.logger.warn(`Litige ${d.disputeRef} pour une session inconnue ${d.sessionId}`);
      return;
    }
    const status = DISPUTE_STATUS[d.status];
    const closed = status === 'WON' || status === 'LOST';
    const existing = await this.prisma.dispute.findUnique({ where: { providerRef: d.disputeRef } });
    const dispute = existing
      ? await this.prisma.dispute.update({ where: { id: existing.id }, data: { status, closedAt: closed ? new Date() : null } })
      : await this.prisma.dispute.create({
          data: {
            transactionId: tx.id, merchantId: tx.merchantId, livemode: tx.livemode, amount: BigInt(d.amount), currency: d.currency,
            reason: d.reason, status, providerRef: d.disputeRef, evidenceDueAt: d.evidenceDueAt ?? null, closedAt: closed ? new Date() : null,
          },
        });
    const event = !existing ? 'dispute.created' : closed ? 'dispute.closed' : null;
    if (event) {
      await this.audit.record({ actorType: 'system', merchantId: tx.merchantId, action: `card.${event}`, targetType: 'dispute', targetId: dispute.id, metadata: { status, payment_id: tx.id } });
      try {
        await this.deliveries.dispatch(tx.merchantId, tx.livemode, event, presentDispute(dispute));
      } catch (err) {
        this.logger.error(`Webhook ${event} non envoyé : ${(err as Error).message}`);
      }
    }
  }

  /** Réponse du marchand à un litige : ses preuves partent chez l'acquéreur. */
  async submitEvidence(disputeId: string, merchantId: string, livemode: boolean, text: string, actor: { type: 'user' | 'api_key' | 'staff'; id?: string; ip?: string }) {
    const dispute = await this.prisma.dispute.findFirst({ where: { id: disputeId, merchantId, livemode } });
    if (!dispute) throw new ApiError(404, 'litige_introuvable', 'Litige introuvable', 'id');
    if (dispute.status !== 'OPEN') throw new ApiError(409, 'litige_ferme', 'Les preuves ne peuvent plus être modifiées');
    if (dispute.evidenceDueAt && dispute.evidenceDueAt < new Date()) throw new ApiError(409, 'delai_depasse', 'Le délai de réponse est dépassé');
    const acquirer = await this.cards.forMerchant(merchantId, livemode);
    await acquirer.submitDisputeEvidence(dispute.providerRef, text);
    const updated = await this.prisma.dispute.update({ where: { id: dispute.id }, data: { status: 'UNDER_REVIEW', evidenceText: text, evidenceSentAt: new Date() } });
    await this.audit.record({ actorType: actor.type, actorId: actor.id, merchantId, action: 'card.dispute_evidence_sent', targetType: 'dispute', targetId: dispute.id, ip: actor.ip });
    return updated;
  }

  listDisputes(merchantId: string, livemode: boolean) {
    return this.prisma.dispute.findMany({ where: { merchantId, livemode }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
