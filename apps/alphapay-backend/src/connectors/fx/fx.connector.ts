import { Injectable, Logger } from '@nestjs/common';
import { FxConnector, FxRateResult } from './fx.interface';

/** STUB — hardcoded dev rates. Used while FX_USE_STUB=true. */
@Injectable()
export class FxConnectorStub implements FxConnector {
  private readonly logger = new Logger(FxConnectorStub.name);

  private static readonly RATES: Record<string, number> = {
    XAF_USD: 0.00162,
    XAF_EUR: 0.00152,
    XAF_USDC: 0.00162,
    LYD_USD: 0.2065,
    LYD_USDC: 0.2065,
    USDC_XAF: 617,
    USDC_LYD: 4.84,
    // convenience inverses / same-currency
    USD_XAF: 617,
    EUR_XAF: 658,
  };

  async getRate(from: string, to: string): Promise<FxRateResult> {
    if (from === to) return { from, to, rate: 1 };
    const direct = FxConnectorStub.RATES[`${from}_${to}`];
    if (direct !== undefined) return { from, to, rate: direct };
    const inverse = FxConnectorStub.RATES[`${to}_${from}`];
    if (inverse !== undefined) return { from, to, rate: 1 / inverse };
    this.logger.warn(`[STUB] FX no rate for ${from}->${to}, defaulting to 1`);
    return { from, to, rate: 1 };
  }
}
