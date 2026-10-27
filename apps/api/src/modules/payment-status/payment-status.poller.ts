import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { JobQueue, QUEUES } from '../../common/queue/job-queue';
import { PaymentsService } from '../payments/payments.service';
import { WebhooksService } from '../webhooks/webhooks.service';

export interface PaymentStatusJob {
  transactionId: string;
  attempt: number;
}

const FIRST_DELAY_MS = 5_000;
const MAX_DELAY_MS = 60_000;

/** Intervalles croissants : 5 s, 10 s, 20 s, 40 s, puis toutes les 60 s. */
export function nextPollDelayMs(attempt: number): number {
  return Math.min(FIRST_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}

/** Durée au-delà de laquelle un paiement sans réponse est déclaré expiré. */
export function paymentExpiryMs(): number {
  const s = Number(process.env.PAYMENT_EXPIRY_SECONDS);
  return (Number.isFinite(s) && s > 0 ? s : 600) * 1000;
}

export function pollJobId(transactionId: string, attempt: number): string {
  return `poll-${transactionId}-${attempt}`;
}

/**
 * Tâche de relance (§M3) : les opérateurs n'envoient pas toujours de callback
 * fiable. Tant qu'un paiement est en attente, on interroge son statut à
 * intervalles croissants, jusqu'à un statut final ou l'expiration — aucun
 * paiement ne reste bloqué indéfiniment.
 */
@Injectable()
export class PaymentStatusPoller {
  private readonly logger = new Logger(PaymentStatusPoller.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly payments: PaymentsService,
    private readonly webhooks: WebhooksService,
    @Inject(JobQueue) private readonly queue: JobQueue,
  ) {}

  /** Appelé uniquement par le process worker. */
  register(): void {
    this.queue.process<PaymentStatusJob>(QUEUES.paymentStatus, (job) => this.poll(job));
  }

  async poll({ transactionId, attempt }: PaymentStatusJob): Promise<void> {
    const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx || tx.status !== 'PENDING' || !tx.mtnReferenceId) return;

    if (Date.now() - tx.createdAt.getTime() >= paymentExpiryMs()) {
      await this.webhooks.applyVerifiedStatus(tx, 'FAILED', 'EXPIRED', 'relance : expiration');
      return;
    }

    // Une erreur opérateur fait échouer la tâche : BullMQ la réessaie avec délai croissant.
    const { status, failureReason } = await this.payments.fetchProviderStatus({ ...tx, mtnReferenceId: tx.mtnReferenceId });
    if (status !== 'PENDING') {
      await this.webhooks.applyVerifiedStatus(tx, status, failureReason, 'relance de statut');
      return;
    }

    const next = attempt + 1;
    await this.queue.enqueue<PaymentStatusJob>(
      QUEUES.paymentStatus,
      'poll',
      { transactionId, attempt: next },
      { delayMs: nextPollDelayMs(next), jobId: pollJobId(transactionId, next) },
    );
    this.logger.debug(`Paiement ${transactionId} toujours en attente (relance ${next})`);
  }
}
