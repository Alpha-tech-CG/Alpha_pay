export type Operator = 'MTN' | 'AIRTEL';

export type TransactionStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REJECTED';

export interface InitiatePaymentDto {
  amount: number;
  currency: string;
  phone: string;
  externalId: string;
  description?: string;
}

export interface PaymentResult {
  referenceId: string;
  status: TransactionStatus;
  operator: Operator;
}

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
