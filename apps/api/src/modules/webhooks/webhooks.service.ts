import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { Operator, WebhookPayload } from '@paybrain/shared';
import { createAirtelConnector, createMtnConnector } from '@paybrain/connectors';
import { WebhooksGateway } from './webhooks.gateway';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly mtn = createMtnConnector();
  private readonly airtel = createAirtelConnector();

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly gateway: WebhooksGateway,
  ) {}

  async handleWebhook(operator: Operator, payload: WebhookPayload, eventTimestamp = Math.floor(Date.now() / 1000)) {
    const { financialTransactionId, externalId } = payload;

    // Anti-replay au-delà de la fenêtre temporelle (ALP-157) : un même event
    // opérateur ne doit déclencher le traitement qu'une seule fois. La contrainte
    // unique (operator, providerEventId) en base sert de verrou de déduplication.
    const providerEventId = financialTransactionId ?? externalId;
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

    const transaction = await this.prisma.transaction.findFirst({
      where: {
        operator,
        OR: [
          { mtnReferenceId: financialTransactionId ?? '__none__' },
          { externalId: externalId ?? '__none__' },
        ],
      },
    });

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

    const connector = operator === 'MTN' ? this.mtn : this.airtel;
    const verifiedStatus = await connector.getStatus(transaction.mtnReferenceId);

    if (verifiedStatus === 'PENDING') {
      return { received: true };
    }

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: verifiedStatus, failureReason: payload.reason },
    });

    this.gateway.broadcast('transaction_update', {
      externalId: transaction.externalId,
      status: verifiedStatus,
      reason: payload.reason,
    });

    return { received: true };
  }
}
