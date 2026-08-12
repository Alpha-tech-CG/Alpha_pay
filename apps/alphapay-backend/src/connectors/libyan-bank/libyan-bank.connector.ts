import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export interface BankDebitParams {
  amount: number;
  currency: string;
  accountRef: string;
  externalId: string;
}
export interface BankDebitResult {
  referenceId: string;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
}
export interface LibyanBankConnector {
  debit(params: BankDebitParams): Promise<BankDebitResult>;
  getStatus(referenceId: string): Promise<BankDebitResult>;
}
export const LIBYAN_BANK_CONNECTOR = 'LIBYAN_BANK_CONNECTOR';

/** STUB (Wahda) — used while LIBYAN_BANK_USE_STUB=true. */
@Injectable()
export class WahdaConnectorStub implements LibyanBankConnector {
  private readonly logger = new Logger(WahdaConnectorStub.name);
  async debit(_p: BankDebitParams): Promise<BankDebitResult> {
    this.logger.warn('[STUB] Wahda Bank debit');
    return { referenceId: `stub-wahda-${randomUUID()}`, status: 'SUCCESSFUL' };
  }
  async getStatus(id: string): Promise<BankDebitResult> { return { referenceId: id, status: 'SUCCESSFUL' }; }
}

/** STUB (BCD) — alternate Libyan bank. */
@Injectable()
export class BcdConnectorStub implements LibyanBankConnector {
  private readonly logger = new Logger(BcdConnectorStub.name);
  async debit(_p: BankDebitParams): Promise<BankDebitResult> {
    this.logger.warn('[STUB] BCD Bank debit');
    return { referenceId: `stub-bcd-${randomUUID()}`, status: 'SUCCESSFUL' };
  }
  async getStatus(id: string): Promise<BankDebitResult> { return { referenceId: id, status: 'SUCCESSFUL' }; }
}

/** Defaults to Wahda; real impls plug in when LIBYAN_BANK_USE_STUB=false. */
@Injectable()
export class LibyanBankFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly wahda: WahdaConnectorStub,
    private readonly bcd: BcdConnectorStub,
  ) {}
  getConnector(bank: 'WAHDA' | 'BCD' = 'WAHDA'): LibyanBankConnector {
    if (!this.config.get<boolean>('connectors.libyanBankUseStub')) {
      throw new Error('LIBYAN_BANK_USE_STUB=false but no real Libyan-bank connector wired yet.');
    }
    return bank === 'BCD' ? this.bcd : this.wahda;
  }
}
