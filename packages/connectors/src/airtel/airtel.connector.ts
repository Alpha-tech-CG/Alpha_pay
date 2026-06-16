import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { InitiatePaymentDto, PaymentResult, TransactionStatus } from '@paybrain/shared';
import { withRetry } from '../retry';

interface AirtelConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  environment: string;
  webhookUrl: string;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class AirtelConnector {
  private tokenCache: TokenCache | null = null;

  constructor(private readonly config: AirtelConfig) {}

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    const response = await withRetry(() =>
      axios.post(
        `${this.config.baseUrl}/auth/oauth2/token`,
        {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'client_credentials',
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    this.tokenCache = {
      token: response.data.access_token,
      expiresAt: Date.now() + (response.data.expires_in - 60) * 1000,
    };

    return this.tokenCache.token;
  }

  async requestToPay(dto: InitiatePaymentDto): Promise<PaymentResult> {
    const token = await this.getAccessToken();
    const referenceId = uuidv4();

    await withRetry(() =>
      axios.post(
        `${this.config.baseUrl}/merchant/v2/payments/`,
        {
          reference: dto.externalId,
          subscriber: {
            country: 'CG',
            currency: 'XAF',
            msisdn: dto.phone,
          },
          transaction: {
            amount: dto.amount,
            country: 'CG',
            currency: 'XAF',
            id: referenceId,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Country': 'CG',
            'X-Currency': 'XAF',
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    return { referenceId, status: 'PENDING', operator: 'AIRTEL' };
  }

  async getStatus(referenceId: string): Promise<TransactionStatus> {
    const token = await this.getAccessToken();

    const response = await withRetry(() =>
      axios.get(
        `${this.config.baseUrl}/standard/v1/payments/${referenceId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Country': 'CG',
            'X-Currency': 'XAF',
          },
        },
      ),
    );

    const s = response.data.data?.transaction?.status as string;
    if (s === 'TS') return 'SUCCESSFUL';
    if (s === 'TF') return 'FAILED';
    return 'PENDING';
  }
}

export function createAirtelConnector(): AirtelConnector {
  return new AirtelConnector({
    clientId: process.env.AIRTEL_CLIENT_ID!,
    clientSecret: process.env.AIRTEL_CLIENT_SECRET!,
    baseUrl: process.env.AIRTEL_BASE_URL ?? 'https://openapiuat.airtel.africa',
    environment: process.env.AIRTEL_ENVIRONMENT ?? 'sandbox',
    webhookUrl: process.env.PAYBRAIN_WEBHOOK_URL!,
  });
}
