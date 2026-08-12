import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  MobileMoneyConnector,
  PaymentResult,
  RequestToPayParams,
  TransactionStatusResult,
} from '../mobile-money.interface';

/** STUB — used while AIRTEL_USE_STUB=true. */
@Injectable()
export class AirtelConnectorStub implements MobileMoneyConnector {
  private readonly logger = new Logger(AirtelConnectorStub.name);

  async requestToPay(params: RequestToPayParams): Promise<PaymentResult> {
    this.logger.warn('[STUB] Airtel Money requestToPay — returning mock success');
    await new Promise((r) => setTimeout(r, 800));
    return { referenceId: `stub-${randomUUID()}`, status: 'SUCCESSFUL', message: 'Stub: payment accepted' };
  }

  async getTransactionStatus(referenceId: string): Promise<TransactionStatusResult> {
    return { referenceId, status: 'SUCCESSFUL' };
  }

  async getAccountBalance(): Promise<number> {
    return 999999;
  }
}
