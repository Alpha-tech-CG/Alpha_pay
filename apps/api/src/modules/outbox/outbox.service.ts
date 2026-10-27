import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@paybrain/database';
import { ProviderError } from '@paybrain/providers';
import { PaymentsService } from '../payments/payments.service';

const BACKOFF_BASE_MS = 30_000; // 30s, 1min, 2min, 4min, 8min...

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly payments: PaymentsService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingEvents() {
    const events = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING', type: 'payment.request', nextAttemptAt: { lte: new Date() } },
      take: 10,
      orderBy: { createdAt: 'asc' },
    });

    for (const event of events) {
      await this.retryPaymentRequest(event);
    }
  }

  /**
   * Rejoue une demande opérateur restée sans réponse (erreur réseau, 5xx, 429).
   * La référence envoyée est l'id de la transaction : l'opérateur refuse un
   * doublon, le payeur n'est jamais sollicité deux fois (D-020).
   */
  private async retryPaymentRequest(event: { id: string; transactionId: string; attempts: number; maxAttempts: number }) {
    // Claim atomique multi-instance : chaque pod exécute ce cron, donc plusieurs
    // instances lisent le MÊME lot PENDING. Le passage PENDING→PROCESSING est
    // conditionné sur status='PENDING' → une seule instance obtient count=1 et
    // appelle l'opérateur.
    const claim = await this.prisma.outboxEvent.updateMany({
      where: { id: event.id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (claim.count === 0) return; // déjà pris (ou terminé) par une autre instance

    try {
      const providerRef = await this.payments.retryRequest(event.transactionId);
      await this.prisma.outboxEvent.update({ where: { id: event.id }, data: { status: 'SENT' } });
      this.logger.log(`Retry réussi pour transaction ${event.transactionId} (réf. ${providerRef})`);
    } catch (err) {
      const reason = err instanceof ProviderError ? `${err.code}: ${err.message}` : (err as Error)?.message ?? 'Erreur opérateur';
      const attempts = event.attempts + 1;
      const definitive = err instanceof ProviderError && !err.retryable;

      if (definitive || attempts >= event.maxAttempts) {
        await this.prisma.transaction.update({
          where: { id: event.transactionId },
          data: { status: 'FAILED', retryCount: attempts, failureReason: reason },
        });
        await this.prisma.outboxEvent.update({ where: { id: event.id }, data: { status: 'DEAD', attempts, lastError: reason } });
        this.logger.error(`Transaction ${event.transactionId} en échec après ${attempts} tentative(s): ${reason}`);
        return;
      }

      await this.prisma.transaction.update({ where: { id: event.transactionId }, data: { retryCount: attempts } });
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
