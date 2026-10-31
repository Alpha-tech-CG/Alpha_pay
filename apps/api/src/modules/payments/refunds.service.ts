import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient, Refund } from '@paybrain/database';
import { ProviderError } from '@paybrain/providers';
import { AuditService } from '../../common/audit/audit.service';
import { ApiError } from '../../common/errors/api-error';
import { formatAmount, toMajorAmount, toMinor } from '../../common/money';
import { CardAcquirerRegistry } from '../providers/card-acquirer.registry';
import { WebhookDeliveryService } from '../webhooks-out/webhook-delivery.service';

export interface RefundActor {
  type: 'user' | 'api_key' | 'staff';
  id?: string;
  ip?: string;
}

export interface CreateRefundInput {
  /** Unités majeures ; absent = tout le montant restant. */
  amount?: number;
  reason: string;
  /**
   * Mobile Money : MTN et Airtel n'exposent pas de remboursement dans l'API
   * d'encaissement. Le marchand rembourse depuis son compte opérateur, puis le
   * déclare ici (`manual: true`) pour que ses comptes et son client le voient.
   */
  manual?: boolean;
}

export function presentRefund(r: Refund) {
  return {
    id: r.id,
    object: 'refund',
    payment_id: r.transactionId,
    livemode: r.livemode,
    amount: toMajorAmount(r.amount, r.currency),
    amount_display: formatAmount(r.amount, r.currency),
    currency: r.currency,
    reason: r.reason,
    method: r.method,
    status: { PENDING: 'en_attente', SUCCEEDED: 'réussi', FAILED: 'échoué' }[r.status],
    failure_reason: r.failureReason,
    created_at: r.createdAt,
  };
}

/**
 * Remboursements (§M13) : total ou partiel, jamais au-delà du montant payé,
 * jamais pendant un litige ouvert. Le montant est réservé sur le paiement
 * avant l'appel au fournisseur (pas de double remboursement concurrent), puis
 * rendu si le fournisseur refuse.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly cards: CardAcquirerRegistry,
    private readonly webhooks: WebhookDeliveryService,
    private readonly audit: AuditService,
  ) {}

  list(transactionId: string, merchantId: string, livemode: boolean) {
    return this.prisma.refund.findMany({ where: { transactionId, merchantId, livemode }, orderBy: { createdAt: 'asc' } });
  }

  async create(transactionId: string, merchantId: string, livemode: boolean, input: CreateRefundInput, actor: RefundActor): Promise<Refund> {
    const tx = await this.prisma.transaction.findFirst({ where: { id: transactionId, merchantId, livemode } });
    if (!tx) throw new ApiError(404, 'paiement_introuvable', 'Paiement introuvable', 'id');
    if (tx.status !== 'SUCCEEDED') throw new ApiError(409, 'remboursement_impossible', 'Seul un paiement réussi peut être remboursé');
    const disputed = await this.prisma.dispute.count({ where: { transactionId, livemode, status: { in: ['OPEN', 'UNDER_REVIEW'] } } });
    if (disputed) throw new ApiError(409, 'litige_en_cours', 'Un litige est ouvert sur ce paiement : il se règle avec la banque du porteur, pas par un remboursement');

    const card = tx.operator === 'CARD';
    if (!card && !input.manual) {
      throw new ApiError(422, 'remboursement_manuel_requis', 'Mobile Money : remboursez depuis votre compte opérateur, puis déclarez le remboursement (manual: true).', 'manual');
    }

    const remaining = tx.amount - tx.amountRefunded;
    const amount = input.amount != null ? toMinor(input.amount, tx.currency) : remaining;
    if (amount <= 0n || amount > remaining) {
      throw new ApiError(400, 'montant_invalide', `Montant remboursable : au plus ${formatAmount(remaining, tx.currency)}`, 'amount');
    }

    // Réservation atomique : échoue si un autre remboursement a modifié le total entre-temps.
    const reserved = await this.prisma.transaction.updateMany({
      where: { id: tx.id, livemode, amountRefunded: tx.amountRefunded },
      data: { amountRefunded: tx.amountRefunded + amount },
    });
    if (reserved.count !== 1) throw new ApiError(409, 'conflit', 'Un autre remboursement est en cours sur ce paiement, réessayez');

    let refund = await this.prisma.refund.create({
      data: {
        transactionId: tx.id, merchantId, livemode, amount, currency: tx.currency, reason: input.reason,
        method: card ? 'provider' : 'manual', status: card ? 'PENDING' : 'SUCCEEDED', actorType: actor.type, actorId: actor.id ?? null,
      },
    });

    if (card) {
      try {
        const acquirer = await this.cards.forMerchant(merchantId, livemode);
        const result = await acquirer.refund({ sessionId: tx.mtnReferenceId!, amount: Number(amount), currency: tx.currency, reference: refund.id, reason: input.reason });
        refund = await this.settle(refund, result.status === 'pending' ? 'PENDING' : result.status === 'succeeded' ? 'SUCCEEDED' : 'FAILED', result.refundRef, result.failureReason);
      } catch (err) {
        const reason = err instanceof ProviderError ? `${err.code}: ${err.message}` : (err as Error).message;
        this.logger.warn(`Remboursement ${refund.id} refusé par l'acquéreur : ${reason}`);
        refund = await this.settle(refund, 'FAILED', null, reason);
      }
    } else {
      await this.notify(refund);
    }

    await this.audit.record({
      actorType: actor.type, actorId: actor.id, merchantId, action: 'payment.refunded', targetType: 'refund', targetId: refund.id, ip: actor.ip,
      metadata: { payment_id: tx.id, amount: Number(amount), method: refund.method, status: refund.status, reason: input.reason, livemode },
    });
    return refund;
  }

  /** Issue d'un remboursement (réponse immédiate ou webhook de l'acquéreur) ; rend le montant s'il échoue. */
  async settle(refund: Refund, status: 'PENDING' | 'SUCCEEDED' | 'FAILED', providerRef: string | null, failureReason?: string): Promise<Refund> {
    if (refund.status !== 'PENDING') return refund;
    const updated = await this.prisma.refund.update({
      where: { id: refund.id },
      data: { status, providerRef: providerRef ?? refund.providerRef, failureReason: failureReason ?? null },
    });
    if (status === 'FAILED') {
      await this.prisma.transaction.updateMany({ where: { id: refund.transactionId, livemode: refund.livemode }, data: { amountRefunded: { decrement: refund.amount } } });
    }
    if (status !== 'PENDING') await this.notify(updated);
    return updated;
  }

  private async notify(refund: Refund) {
    const event = refund.status === 'SUCCEEDED' ? 'refund.succeeded' : refund.status === 'FAILED' ? 'refund.failed' : null;
    if (!event) return;
    try {
      await this.webhooks.dispatch(refund.merchantId, refund.livemode, event, presentRefund(refund));
    } catch (err) {
      this.logger.error(`Webhook ${event} non envoyé : ${(err as Error).message}`);
    }
  }
}
