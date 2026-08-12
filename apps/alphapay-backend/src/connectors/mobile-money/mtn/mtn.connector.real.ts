import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MobileMoneyConnector,
  PaymentResult,
  RequestToPayParams,
  TransactionStatusResult,
} from '../mobile-money.interface';

/**
 * REAL — wired to MTN MoMo Collections API. Skeleton ready; throws until keys
 * are provided so a misconfiguration (USE_STUB=false without keys) fails loudly.
 */
@Injectable()
export class MtnConnectorReal implements MobileMoneyConnector {
  constructor(private readonly config: ConfigService) {}

  async requestToPay(_params: RequestToPayParams): Promise<PaymentResult> {
    // POST {MTN_BASE_URL}/collection/v1_0/requesttopay
    // Headers: Authorization: Bearer {token}, X-Reference-Id, X-Target-Environment, Ocp-Apim-Subscription-Key
    // Body: { amount, currency, externalId, payer: { partyIdType: 'MSISDN', partyId: phoneNumber }, payerMessage, payeeNote }
    await this.getAccessToken();
    throw new Error('MTN_USE_STUB=false but real implementation not wired. Set MTN_API_KEY in .env');
  }

  async getTransactionStatus(_referenceId: string): Promise<TransactionStatusResult> {
    throw new Error('MTN real getTransactionStatus not implemented — waiting for MTN_API_KEY');
  }

  async getAccountBalance(): Promise<number> {
    throw new Error('MTN real getAccountBalance not implemented — waiting for MTN_API_KEY');
  }

  private async getAccessToken(): Promise<string> {
    // POST {MTN_BASE_URL}/collection/token/ with Basic auth (apiUser:apiKey) + subscription key header
    this.config.get('MTN_API_USER');
    throw new Error('MTN token exchange not implemented — waiting for MTN_API_KEY');
  }
}
