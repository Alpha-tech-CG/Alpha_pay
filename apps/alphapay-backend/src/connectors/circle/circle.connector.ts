import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export interface UsdcConversionParams {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  reference: string;
}
export interface UsdcConversionResult {
  id: string;
  status: 'PENDING' | 'COMPLETE' | 'FAILED';
  usdcAmount: number;
}
export interface CircleConnector {
  convertToUsdc(params: UsdcConversionParams): Promise<UsdcConversionResult>;
  getConversionStatus(id: string): Promise<UsdcConversionResult>;
}
export const CIRCLE_CONNECTOR = 'CIRCLE_CONNECTOR';

/** STUB — used while CIRCLE_USE_STUB=true. */
@Injectable()
export class CircleConnectorStub implements CircleConnector {
  private readonly logger = new Logger(CircleConnectorStub.name);
  async convertToUsdc(p: UsdcConversionParams): Promise<UsdcConversionResult> {
    this.logger.warn('[STUB] Circle convertToUsdc — mock USDC conversion');
    await new Promise((r) => setTimeout(r, 600));
    // rough mock: treat 1 unit source as its stub USD value
    return { id: `stub-usdc-${randomUUID()}`, status: 'COMPLETE', usdcAmount: p.amount };
  }
  async getConversionStatus(id: string): Promise<UsdcConversionResult> {
    return { id, status: 'COMPLETE', usdcAmount: 0 };
  }
}

/** REAL — Circle API. Needs CIRCLE_API_KEY. */
@Injectable()
export class CircleConnectorReal implements CircleConnector {
  constructor(private readonly config: ConfigService) {}
  async convertToUsdc(_p: UsdcConversionParams): Promise<UsdcConversionResult> {
    throw new Error('CIRCLE_USE_STUB=false but real implementation not wired. Set CIRCLE_API_KEY in .env');
  }
  async getConversionStatus(_id: string): Promise<UsdcConversionResult> {
    throw new Error('Circle real getConversionStatus not implemented');
  }
}
