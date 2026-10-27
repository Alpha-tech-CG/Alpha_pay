export type MobileMoneyOperator = 'MTN' | 'AIRTEL';
export type Operator = MobileMoneyOperator;

export type TransactionStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REJECTED';

export interface WebhookPayload {
  financialTransactionId?: string;
  externalId?: string;
  status: string;
  reason?: string;
  amount?: string;
  currency?: string;
  payer?: {
    partyIdType: string;
    partyId: string;
  };
}

export interface CreatePaymentLinkDto {
  amount: number;
  currency: string;
  description: string;
  expiresInMinutes?: number;
  merchantId: string;
}
