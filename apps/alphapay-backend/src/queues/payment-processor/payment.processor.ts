import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Transaction } from '../../modules/payments/entities/transaction.entity';
import { TransactionStatus } from '../../common/types/transaction-status.enum';
import { Operator } from '../../common/types/operator.enum';
import { MobileMoneyFactory } from '../../connectors/mobile-money/mobile-money.factory';

export const PAYMENT_QUEUE = 'payment-processor';
export interface PaymentPollJob {
  transactionId: string;
  operator: Operator;
  externalReference: string;
  attempt: number;
}

/**
 * Polls the mobile-money provider for a final status. Re-enqueues with a 30s
 * delay up to 5 attempts; on a final status updates the transaction and hands
 * off to the webhook dispatcher.
 */
@Processor(PAYMENT_QUEUE)
export class PaymentProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentProcessor.name);
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly RETRY_DELAY_MS = 30_000;

  constructor(
    @InjectRepository(Transaction) private readonly txs: Repository<Transaction>,
    private readonly momo: MobileMoneyFactory,
    @InjectQueue(PAYMENT_QUEUE) private readonly queue: Queue,
    @InjectQueue('webhook-dispatcher') private readonly webhookQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<PaymentPollJob>): Promise<void> {
    const { transactionId, operator, externalReference, attempt } = job.data;
    const tx = await this.txs.findOne({ where: { id: transactionId } });
    if (!tx || tx.status !== TransactionStatus.PENDING) return; // already resolved

    const { status } = await this.momo.getConnector(operator).getTransactionStatus(externalReference);
    if (status === 'PENDING') {
      if (attempt < PaymentProcessor.MAX_ATTEMPTS) {
        await this.queue.add('poll-status', { ...job.data, attempt: attempt + 1 }, { delay: PaymentProcessor.RETRY_DELAY_MS });
      } else {
        this.logger.warn(`Tx ${transactionId} still pending after ${attempt} attempts`);
      }
      return;
    }

    tx.status = status === 'SUCCESSFUL' ? TransactionStatus.SUCCESSFUL : TransactionStatus.FAILED;
    await this.txs.save(tx);
    await this.webhookQueue.add('dispatch', { userId: tx.userId, event: `payment.${tx.status.toLowerCase()}`, payload: { transactionId: tx.id, status: tx.status } });
  }
}
