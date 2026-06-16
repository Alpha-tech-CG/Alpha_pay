import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { WebhookPayload } from '@paybrain/shared';
import { WebhooksGateway } from './webhooks.gateway';

@Injectable()
export class WebhooksService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly gateway: WebhooksGateway,
  ) {}

  async handleMtnWebhook(payload: WebhookPayload) {
    const { financialTransactionId, externalId, status, reason } = payload;
    const refId = financialTransactionId ?? externalId;

    const mapped = status === 'SUCCESSFUL' ? 'SUCCESSFUL'
      : status === 'FAILED' ? 'FAILED'
      : status === 'REJECTED' ? 'REJECTED'
      : 'PENDING';

    const transaction = await this.prisma.transaction.findFirst({
      where: {
        OR: [
          { mtnReferenceId: financialTransactionId ?? '' },
          { externalId: externalId ?? '' },
        ],
      },
    });

    if (transaction) {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: mapped, failureReason: reason },
      });
    }

    await this.prisma.webhookLog.create({
      data: {
        transactionId: transaction?.id,
        mtnReferenceId: refId,
        event: `MTN_${status}`,
        payload: payload as any,
      },
    });

    this.gateway.broadcast('transaction_update', {
      externalId,
      status: mapped,
      reason,
    });

    return { received: true };
  }
}
