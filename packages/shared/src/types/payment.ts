export type MobileMoneyOperator = 'MTN' | 'AIRTEL';
export type Operator = MobileMoneyOperator;

export type TransactionStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'CANCELED';

/** Libellés publics des statuts unifiés (§M3, D-016), exposés par l'API et les webhooks. */
export const PUBLIC_PAYMENT_STATUS: Record<TransactionStatus, string> = {
  PENDING: 'en_attente',
  SUCCEEDED: 'réussi',
  FAILED: 'échoué',
  EXPIRED: 'expiré',
  CANCELED: 'annulé',
};

export function publicPaymentStatus(status: TransactionStatus | string): string {
  return PUBLIC_PAYMENT_STATUS[status as TransactionStatus] ?? String(status);
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
