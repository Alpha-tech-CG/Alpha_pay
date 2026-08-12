export interface RequestToPayParams {
  amount: number;
  currency: string;
  phoneNumber: string;
  externalId: string;
  payerMessage: string;
  payeeNote: string;
}

export interface PaymentResult {
  referenceId: string;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
  message?: string;
}

export interface TransactionStatusResult {
  referenceId: string;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
}

export interface MobileMoneyConnector {
  requestToPay(params: RequestToPayParams): Promise<PaymentResult>;
  getTransactionStatus(referenceId: string): Promise<TransactionStatusResult>;
  getAccountBalance(): Promise<number>;
}

/** DI token for the resolved mobile-money connector set. */
export const MOBILE_MONEY_CONNECTORS = 'MOBILE_MONEY_CONNECTORS';
