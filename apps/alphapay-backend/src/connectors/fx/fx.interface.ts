export interface FxRateResult {
  from: string;
  to: string;
  rate: number;
}

export interface FxConnector {
  getRate(from: string, to: string): Promise<FxRateResult>;
}

export const FX_CONNECTOR = 'FX_CONNECTOR';
