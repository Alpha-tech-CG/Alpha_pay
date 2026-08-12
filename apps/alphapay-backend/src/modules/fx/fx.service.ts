import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS } from '../../redis/redis.module';
import { FX_CONNECTOR, FxConnector } from '../../connectors/fx/fx.interface';

export interface FxQuote {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  convertedAmount: number;
  fee: number;
  totalCost: number;
  expiresAt: string;
}

@Injectable()
export class FxService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(FX_CONNECTOR) private readonly fx: FxConnector,
    private readonly config: ConfigService,
  ) {}

  async getRate(from: string, to: string): Promise<number> {
    const key = `fx:${from}:${to}`;
    const cached = await this.redis.get(key);
    if (cached) return parseFloat(cached);

    const { rate } = await this.fx.getRate(from, to);
    const ttl = this.config.get<number>('fxCacheTtlSeconds') ?? 300;
    await this.redis.set(key, String(rate), 'EX', ttl);
    return rate;
  }

  async getQuote(amount: number, from: string, to: string): Promise<FxQuote> {
    const rate = await this.getRate(from, to);
    const convertedAmount = +(amount * rate).toFixed(6);
    const fee = +(amount * 0.008).toFixed(6); // 0.8% transfer fee
    return {
      amount,
      fromCurrency: from,
      toCurrency: to,
      rate,
      convertedAmount,
      fee,
      totalCost: +(amount + fee).toFixed(6),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  }
}
