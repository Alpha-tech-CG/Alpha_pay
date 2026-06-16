import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { InitiatePaymentDto, PaymentResult, TransactionStatus } from '@paybrain/shared';

interface MtnConfig {
  subscriptionKey: string;
  apiUserId: string;
  apiKey: string;
  baseUrl: string;
  environment: string;
  currency: string;
  webhookUrl: string;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class MtnConnector {
  private tokenCache: TokenCache | null = null;

  constructor(private readonly config: MtnConfig) {}

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    const credentials = Buffer.from(
      `${this.config.apiUserId}:${this.config.apiKey}`,
    ).toString('base64');

    const response = await axios.post(
      `${this.config.baseUrl}/collection/token/`,
      {},
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Ocp-Apim-Subscription-Key': this.config.subscriptionKey,
        },
      },
    );

    this.tokenCache = {
      token: response.data.access_token,
      expiresAt: Date.now() + 3500 * 1000,
    };

    return this.tokenCache.token;
  }

  async requestToPay(dto: InitiatePaymentDto): Promise<PaymentResult> {
    const token = await this.getAccessToken();
    const referenceId = uuidv4();

    await axios.post(
      `${this.config.baseUrl}/collection/v1_0/requesttopay`,
      {
        amount: String(dto.amount),
        currency: this.config.currency,
        externalId: dto.externalId,
        payer: { partyIdType: 'MSISDN', partyId: dto.phone },
        payerMessage: dto.description ?? 'Paiement PayBrain',
        payeeNote: dto.externalId,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Reference-Id': referenceId,
          'X-Target-Environment': this.config.environment,
          'X-Callback-Url': this.config.webhookUrl,
          'Ocp-Apim-Subscription-Key': this.config.subscriptionKey,
          'Content-Type': 'application/json',
        },
      },
    );

    return { referenceId, status: 'PENDING', operator: 'MTN' };
  }

  async getStatus(referenceId: string): Promise<TransactionStatus> {
    const token = await this.getAccessToken();

    const response = await axios.get(
      `${this.config.baseUrl}/collection/v1_0/requesttopay/${referenceId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Target-Environment': this.config.environment,
          'Ocp-Apim-Subscription-Key': this.config.subscriptionKey,
        },
      },
    );

    const s = response.data.status as string;
    if (s === 'SUCCESSFUL') return 'SUCCESSFUL';
    if (s === 'FAILED') return 'FAILED';
    if (s === 'REJECTED') return 'REJECTED';
    return 'PENDING';
  }
}

export function createMtnConnector(): MtnConnector {
  return new MtnConnector({
    subscriptionKey: process.env.MTN_SUBSCRIPTION_KEY!,
    apiUserId: process.env.MTN_API_USER_ID!,
    apiKey: process.env.MTN_API_KEY!,
    baseUrl: process.env.MTN_BASE_URL ?? 'https://sandbox.momodeveloper.mtn.com',
    environment: process.env.MTN_ENVIRONMENT ?? 'sandbox',
    currency: process.env.MTN_CURRENCY ?? 'EUR',
    webhookUrl: process.env.PAYBRAIN_WEBHOOK_URL!,
  });
}
