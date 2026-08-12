import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export interface WiseTransferParams {
  amount: number;
  sourceCurrency: string;
  targetCurrency: string;
  recipientReference: string;
}
export interface WiseTransferResult {
  id: string;
  status: 'PROCESSING' | 'OUTGOING_PAYMENT_SENT' | 'FAILED';
  targetAmount: number;
}
export interface WiseConnector {
  createTransfer(params: WiseTransferParams): Promise<WiseTransferResult>;
}
export const WISE_CONNECTOR = 'WISE_CONNECTOR';

/** STUB — used while WISE_USE_STUB=true. */
@Injectable()
export class WiseConnectorStub implements WiseConnector {
  private readonly logger = new Logger(WiseConnectorStub.name);
  async createTransfer(p: WiseTransferParams): Promise<WiseTransferResult> {
    this.logger.warn('[STUB] Wise createTransfer');
    return { id: `stub-wise-${randomUUID()}`, status: 'OUTGOING_PAYMENT_SENT', targetAmount: p.amount };
  }
}

/** REAL — Wise API. Needs WISE_API_TOKEN. */
@Injectable()
export class WiseConnectorReal implements WiseConnector {
  constructor(private readonly config: ConfigService) {}
  async createTransfer(): Promise<WiseTransferResult> {
    throw new Error('WISE_USE_STUB=false but not wired. Set WISE_API_TOKEN in .env');
  }
}
