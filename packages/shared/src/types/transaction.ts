import { TransactionStatus } from './payment';

export interface Transaction {
  id: string;
  merchantId: string;
  merchantName?: string;
  mtnReferenceId?: string;
  externalId: string;
  amount: number;
  currency: string;
  payerPhone: string;
  status: TransactionStatus;
  payerMessage?: string;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatsResponse {
  totals: { status: TransactionStatus; count: number; volume: number }[];
  recent: Transaction[];
}
