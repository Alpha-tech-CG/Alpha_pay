import { Inject, Injectable, Logger } from '@nestjs/common';
import { ANY_MODE, PrismaClient, TransactionStatus } from '@paybrain/database';
import { Operator, WebhookPayload } from '@paybrain/shared';
import { WebhooksGateway } from './webhooks.gateway';
import { WebhookDeliveryService } from '../webhooks-out/webhook-delivery.service';
import { PaymentsService } from '../payments/payments.service';
import { ConcurrentModificationError, IllegalTransitionError, transitionStatus } from '../transactions/transaction-state';

const STATUS_EVENT: Record<string, string> = {
  SUCCESSFUL: 'payment.succeeded',
  FAILED: 'payment.failed',
  REJECTED: 'payment.failed',
  PENDING: 'payment.pending',
};

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly gateway: WebhooksGateway,
    private readonly webhookDelivery: WebhookDeliveryService,
    private readonly payments: PaymentsService,
  ) {}

  async handleWebhook(operator: Operator, payload: WebhookPayload, eventTimestamp = Math.floor(Date.now() / 1000)) {
    const { financialTransactionId, externalId } = payload;

    // Anti-replay au-delà de la fenêtre temporelle (ALP-157) : un même event
    // opérateur ne doit déclencher le traitement qu'une seule fois. La contrainte
    // unique (operator, providerEventId) en base sert de verrou de déduplication.
    const airtelTx = (payload as any).transaction as { id?: string; airtel_money_id?: string } | undefined;
    const providerEventId = financialTransactionId ?? externalId ?? airtelTx?.airtel_money_id ?? airtelTx?.id;
    if (!providerEventId) {
      this.logger.warn(`Webhook ${operator} sans identifiant d'event exploitable — ignoré`);
      return { received: true };
    }

    try {
      await this.prisma.webhookInboundEvent.create({
        data: {
          operator,
          providerEventId,
          signatureHex: '',
          timestampEpoch: eventTimestamp,
          rawPayload: payload as any,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        // Déjà reçu : on ACK 200 sans retraiter, pour stopper les retries opérateur.
        return { received: true, duplicate: true };
      }
      throw err;
    }

    // La référence envoyée à l'opérateur est l'id de la transaction AlphaPay :
    // MTN la renvoie dans `externalId`, Airtel renvoie notre identifiant de
    // transaction (stocké comme référence fournisseur).
    const candidates = [externalId, (payload as any).transaction?.id].filter((v): v is string => typeof v === 'string');
    const transaction = candidates.length
      ? await this.prisma.transaction.findFirst({
          where: {
            operator,
            livemode: ANY_MODE,
            OR: candidates.flatMap((c) => [{ id: c }, { mtnReferenceId: c }]),
          },
        })
      : null;

    if (!transaction) {
      this.logger.warn(`Webhook ${operator} reçu pour une transaction inconnue (externalId=${externalId})`);
      return { received: true };
    }

    await this.prisma.webhookLog.create({
      data: {
        transactionId: transaction.id,
        mtnReferenceId: transaction.mtnReferenceId,
        event: `${operator}_NOTIFICATION`,
        payload: payload as any,
      },
    });

    // Le webhook ne fait que déclencher une vérification : on ne fait jamais confiance
    // au statut qu'il transporte, on interroge l'opérateur pour confirmer.
    if (transaction.status !== 'PENDING' || !transaction.mtnReferenceId) {
      return { received: true };
    }

    const { status: verifiedStatus, failureReason } = await this.payments.fetchProviderStatus({
      ...transaction,
      mtnReferenceId: transaction.mtnReferenceId,
    });

    await this.applyVerifiedStatus(transaction, verifiedStatus, failureReason ?? payload.reason, `webhook ${operator}`);
    return { received: true };
  }

  /**
   * Applique un statut CONFIRMÉ par l'opérateur (callback ou relance) puis
   * notifie le tableau de bord et les webhooks du marchand. Idempotent :
   * renvoie false si rien n'a changé (déjà final, conflit concurrent).
   */
  async applyVerifiedStatus(
    transaction: { id: string; merchantId: string; livemode: boolean; externalId: string; mtnReferenceId: string | null; amount: bigint; currency: string },
    verifiedStatus: TransactionStatus,
    reason: string | undefined,
    source: string,
  ): Promise<boolean> {
    if (verifiedStatus === 'PENDING') return false;

    // Transition via la machine d'état stricte (ALP-167) : SERIALIZABLE + FOR UPDATE
    // + version CAS. Une transition illégale (ex. depuis un état terminal) ou un
    // conflit concurrent est ignoré gracieusement — le traitement reste idempotent.
    try {
      const result = await transitionStatus(this.prisma, transaction.id, verifiedStatus, {
        reason: source,
        failureReason: reason ?? null,
      });
      if (!result.changed) return false;
    } catch (err) {
      if (err instanceof IllegalTransitionError || err instanceof ConcurrentModificationError) {
        this.logger.warn(`${source} : ${err.message} (tx ${transaction.id})`);
        return false;
      }
      throw err;
    }

    this.gateway.broadcastToMerchant(transaction.merchantId, 'transaction_update', {
      externalId: transaction.externalId,
      status: verifiedStatus,
      reason,
    });

    // Notifie le marchand via ses webhooks sortants (ALP-132).
    const event = STATUS_EVENT[verifiedStatus];
    if (event) {
      await this.webhookDelivery.dispatch(transaction.merchantId, transaction.livemode, event, {
        type: event,
        externalId: transaction.externalId,
        referenceId: transaction.mtnReferenceId,
        status: verifiedStatus,
        amount: transaction.amount,
        currency: transaction.currency,
        reason,
      }).catch((err) => this.logger.error(`Dispatch webhook sortant échoué: ${err?.message}`));
    }
    return true;
  }
}
