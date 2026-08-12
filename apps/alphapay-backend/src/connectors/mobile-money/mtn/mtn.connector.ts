import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  MobileMoneyConnector,
  PaymentResult,
  RequestToPayParams,
  TransactionStatusResult,
} from '../mobile-money.interface';

/** STUB — used while MTN_USE_STUB=true. Returns deterministic mock success. */
@Injectable()
export class MtnConnectorStub implements MobileMoneyConnector {
  private readonly logger = new Logger(MtnConnectorStub.name);

  async requestToPay(params: RequestToPayParams): Promise<PaymentResult> {
    this.logger.warn('[STUB] MTN MoMo requestToPay — returning mock success');
    await this.delay(800);
    return { referenceId: `stub-${randomUUID()}`, status: 'SUCCESSFUL', message: 'Stub: payment accepted' };
  }

  async getTransactionStatus(referenceId: string): Promise<TransactionStatusResult> {
    this.logger.warn('[STUB] MTN getTransactionStatus');
    return { referenceId, status: 'SUCCESSFUL' };
  }

  async getAccountBalance(): Promise<number> {
    return 999999;
  }

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
