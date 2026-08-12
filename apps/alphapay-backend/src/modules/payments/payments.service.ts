import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { InitiatePaymentDto, CreateTransferDto, TransactionFilterDto } from './dto/payments.dto';
import { TransactionStatus } from '../../common/types/transaction-status.enum';
import { TransactionType } from '../../common/types/enums';
import { UsersService } from '../users/users.service';
import { FxService } from '../fx/fx.service';
import { MobileMoneyFactory } from '../../connectors/mobile-money/mobile-money.factory';
import { CIRCLE_CONNECTOR, CircleConnector } from '../../connectors/circle/circle.connector';
import { WISE_CONNECTOR, WiseConnector } from '../../connectors/wise/wise.connector';
import { Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PAYMENT_QUEUE } from '../../queues/payment-processor/payment.processor';
import { NOTIFICATION_CONNECTOR, NotificationConnector } from '../../connectors/notifications/notification.connector';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Transaction) private readonly repo: Repository<Transaction>,
    private readonly users: UsersService,
    private readonly fx: FxService,
    private readonly momo: MobileMoneyFactory,
    @Inject(CIRCLE_CONNECTOR) private readonly circle: CircleConnector,
    @Inject(WISE_CONNECTOR) private readonly wise: WiseConnector,
    @InjectQueue(PAYMENT_QUEUE) private readonly paymentQueue: Queue,
    @Inject(NOTIFICATION_CONNECTOR) private readonly notify: NotificationConnector,
  ) {}

  private mapStatus(s: 'PENDING' | 'SUCCESSFUL' | 'FAILED'): TransactionStatus {
    return s === 'SUCCESSFUL' ? TransactionStatus.SUCCESSFUL : s === 'FAILED' ? TransactionStatus.FAILED : TransactionStatus.PENDING;
  }

  /** Local Mobile Money payment (MTN/Airtel). Requires KYC level >= 1. */
  async initiateLocalPayment(userId: string, dto: InitiatePaymentDto): Promise<Transaction> {
    const user = await this.users.findById(userId);
    if (user.kycLevel < 1) throw new ForbiddenException('KYC level 1 required for payments');

    const fee = +(dto.amount * 0.005 + 100).toFixed(2); // 0.5% + 100 XAF
    const tx = await this.repo.save(
      this.repo.create({
        userId,
        type: TransactionType.PAYMENT_LOCAL,
        operator: dto.operator,
        status: TransactionStatus.PENDING,
        amount: String(dto.amount),
        currency: dto.currency,
        fee: String(fee),
        recipientPhone: dto.phoneNumber,
        merchantId: dto.merchantId ?? null,
      }),
    );

    const connector = this.momo.getConnector(dto.operator);
    const result = await connector.requestToPay({
      amount: dto.amount,
      currency: dto.currency,
      phoneNumber: dto.phoneNumber,
      externalId: tx.id,
      payerMessage: dto.note ?? 'AlphaPay payment',
      payeeNote: 'AlphaPay',
    });

    tx.status = this.mapStatus(result.status);
    tx.externalReference = result.referenceId;
    if (result.status === 'FAILED') tx.failureReason = result.message ?? 'Payment failed';
    const saved = await this.repo.save(tx);

    // Notif de confirmation (best-effort — n'échoue pas le paiement).
    if (saved.status === TransactionStatus.SUCCESSFUL) {
      this.notify
        .sendSms(dto.phoneNumber, `Paiement AlphaPay de ${dto.amount} ${dto.currency} confirmé. Réf ${saved.id.slice(0, 8)}.`)
        .catch(() => undefined);
    }

    // Async: if the provider hasn't given a final status, poll it on the queue.
    if (saved.status === TransactionStatus.PENDING) {
      await this.paymentQueue.add(
        'poll-status',
        { transactionId: saved.id, operator: dto.operator, externalReference: result.referenceId, attempt: 1 },
        { delay: 30_000 },
      );
    }
    return saved;
  }

  /** International transfer. Requires KYC level >= 2. Congo↔Libya via Circle (USDC), else Wise. */
  async initiateInternationalPayment(userId: string, dto: CreateTransferDto): Promise<Transaction & { quote: unknown }> {
    const user = await this.users.findById(userId);
    if (user.kycLevel < 2) throw new ForbiddenException('KYC level 2 required for international transfers');

    const quote = await this.fx.getQuote(dto.amount, dto.sourceCurrency, dto.targetCurrency);
    const usesCircle = dto.corridor === 'CONGO_LIBYA' || dto.targetCurrency === 'USDC';

    const tx = await this.repo.save(
      this.repo.create({
        userId,
        type: TransactionType.PAYMENT_INTERNATIONAL,
        status: TransactionStatus.PROCESSING,
        amount: String(dto.amount),
        currency: dto.sourceCurrency,
        convertedAmount: String(quote.convertedAmount),
        convertedCurrency: dto.targetCurrency,
        fee: String(quote.fee),
        recipientPhone: dto.recipientPhone,
        corridor: dto.corridor,
      }),
    );

    if (usesCircle) {
      const r = await this.circle.convertToUsdc({ amount: dto.amount, fromCurrency: dto.sourceCurrency, toCurrency: 'USDC', reference: tx.id });
      tx.externalReference = r.id;
      tx.status = r.status === 'COMPLETE' ? TransactionStatus.SUCCESSFUL : TransactionStatus.PROCESSING;
    } else {
      const r = await this.wise.createTransfer({ amount: dto.amount, sourceCurrency: dto.sourceCurrency, targetCurrency: dto.targetCurrency, recipientReference: tx.id });
      tx.externalReference = r.id;
      tx.status = r.status === 'OUTGOING_PAYMENT_SENT' ? TransactionStatus.SUCCESSFUL : TransactionStatus.PROCESSING;
    }
    const saved = await this.repo.save(tx);
    return Object.assign(saved, { quote });
  }

  /** Ownership-enforced single lookup. */
  async getTransactionStatus(userId: string, transactionId: string): Promise<Transaction> {
    const tx = await this.repo.findOne({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.userId !== userId) throw new ForbiddenException('Not your transaction');
    return tx;
  }

  /** Only ever returns the caller's own transactions. */
  getUserTransactions(userId: string, filters: TransactionFilterDto): Promise<Transaction[]> {
    const qb = this.repo.createQueryBuilder('t').where('t.userId = :userId', { userId });
    if (filters.type) qb.andWhere('t.type = :type', { type: filters.type });
    if (filters.status) qb.andWhere('t.status = :status', { status: filters.status });
    return qb.orderBy('t.createdAt', 'DESC').take(filters.limit ?? 50).skip(filters.offset ?? 0).getMany();
  }
}
