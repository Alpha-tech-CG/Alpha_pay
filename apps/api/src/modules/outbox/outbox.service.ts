import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@paybrain/database';
import { createMtnConnector, createAirtelConnector } from '@paybrain/connectors';

const BACKOFF_BASE_MS = 30_000; // 30s, 1min, 2min, 4min, 8min...

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly mtn = createMtnConnector();
  private readonly airtel = createAirtelConnector();

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingEvents() {
    const events = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING', type: 'payment.failed', nextAttemptAt: { lte: new Date() } },
      take: 10,
      orderBy: { createdAt: 'asc' },
    });

    for (const event of events) {
      await this.retryPaymentFailedEvent(event);
    }
  }

  private async retryPaymentFailedEvent(event: { id: string; transactionId: string; attempts: number; maxAttempts: number; payload: any }) {
    // Claim atomique multi-instance : chaque pod exécute ce cron, donc plusieurs
    // instances lisent le MÊME lot PENDING. Le passage PENDING→PROCESSING est
    // conditionné sur status='PENDING' → une seule instance obtient count=1 et
    // appelle l'opérateur. Sans ce garde, N pods déclenchent N `requestToPay`
    // pour le même événement (multi-débit du payeur).
    const claim = await this.prisma.outboxEvent.updateMany({
      where: { id: event.id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (claim.count === 0) return; // déjà pris (ou terminé) par une autre instance

    const { dto, operator } = event.payload as { dto: any; operator: 'MTN' | 'AIRTEL' };
    const connector = operator === 'MTN' ? this.mtn : this.airtel;

    try {
      const result = await connector.requestToPay(dto);

      await this.prisma.transaction.update({
        where: { id: event.transactionId },
        data: { status: 'PENDING', mtnReferenceId: result.referenceId, failureReason: null },
      });
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'SENT' },
      });
      this.logger.log(`Retry réussi pour transaction ${event.transactionId} (réf. ${result.referenceId})`);
    } catch (err: any) {
      const reason = err.response?.data?.message || err.message || 'Erreur opérateur';
      const attempts = event.attempts + 1;
      await this.prisma.transaction.update({
        where: { id: event.transactionId },
        data: { retryCount: attempts, failureReason: reason },
      });

      if (attempts >= event.maxAttempts) {
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: 'DEAD', attempts, lastError: reason },
        });
        this.logger.error(`Transaction ${event.transactionId} envoyée en DLQ après ${attempts} tentatives: ${reason}`);
        return;
      }

      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'PENDING',
          attempts,
          lastError: reason,
          nextAttemptAt: new Date(Date.now() + BACKOFF_BASE_MS * 2 ** attempts),
        },
      });
    }
  }
}
