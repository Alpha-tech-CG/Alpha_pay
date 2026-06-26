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

/** Reversement (disbursement / payout) vers le numéro mobile money d'un marchand. */
export interface DisburseInput {
  amount: number;
  currency: string;
  /** MSISDN du bénéficiaire (marchand). */
  phone: string;
  /** Référence unique (ex. numéro de batch settlement) — sert d'idempotence. */
  externalId: string;
  description?: string;
}

export interface DisburseResult {
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
