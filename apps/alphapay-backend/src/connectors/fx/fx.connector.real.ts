import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FxConnector, FxRateResult } from './fx.interface';

/** REAL — CurrencyLayer. Skeleton ready; needs CURRENCYLAYER_API_KEY. */
@Injectable()
export class FxConnectorReal implements FxConnector {
  constructor(private readonly config: ConfigService) {}

  async getRate(_from: string, _to: string): Promise<FxRateResult> {
    // GET http://apilayer.net/api/live?access_key={key}&currencies=...&source=...
    this.config.get('CURRENCYLAYER_API_KEY');
    throw new Error('FX_USE_STUB=false but real implementation not wired. Set CURRENCYLAYER_API_KEY in .env');
  }
}
