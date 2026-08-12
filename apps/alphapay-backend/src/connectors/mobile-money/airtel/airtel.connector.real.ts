import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MobileMoneyConnector,
  PaymentResult,
  RequestToPayParams,
  TransactionStatusResult,
} from '../mobile-money.interface';

/** REAL — Airtel Money Open API. Skeleton ready; needs AIRTEL_CLIENT_ID/SECRET. */
@Injectable()
export class AirtelConnectorReal implements MobileMoneyConnector {
  constructor(private readonly config: ConfigService) {}

  async requestToPay(_params: RequestToPayParams): Promise<PaymentResult> {
    // POST {AIRTEL_BASE_URL}/merchant/v1/payments/ with OAuth2 client-credentials token
    throw new Error('AIRTEL_USE_STUB=false but real implementation not wired. Set AIRTEL_CLIENT_SECRET in .env');
  }

  async getTransactionStatus(_referenceId: string): Promise<TransactionStatusResult> {
    throw new Error('Airtel real getTransactionStatus not implemented');
  }

  async getAccountBalance(): Promise<number> {
    throw new Error('Airtel real getAccountBalance not implemented');
  }
}
