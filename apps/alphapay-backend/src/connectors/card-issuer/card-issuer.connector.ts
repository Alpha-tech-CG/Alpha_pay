import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Market } from '../../common/types/market.enum';

export interface IssueCardParams {
  userId: string;
  currency: string;
}
export interface IssuedCard {
  issuerCardId: string;
  lastFour: string;
  expiryMonth: string;
  expiryYear: string;
  network: 'VISA' | 'MASTERCARD';
}
export interface CardIssuerConnector {
  issueCard(params: IssueCardParams): Promise<IssuedCard>;
  topUp(issuerCardId: string, amountUsd: number): Promise<{ ok: boolean }>;
  revealPan(issuerCardId: string): Promise<{ pan: string; cvv: string }>;
}
export const CARD_ISSUER_CONNECTOR = 'CARD_ISSUER_CONNECTOR';

@Injectable()
export class Union54ConnectorStub implements CardIssuerConnector {
  private readonly logger = new Logger(Union54ConnectorStub.name);
  async issueCard(_p: IssueCardParams): Promise<IssuedCard> {
    this.logger.warn('[STUB] Union54 issueCard');
    return { issuerCardId: `stub-u54-${randomUUID()}`, lastFour: '4821', expiryMonth: '08', expiryYear: '28', network: 'VISA' };
  }
  async topUp(): Promise<{ ok: boolean }> { return { ok: true }; }
  async revealPan(): Promise<{ pan: string; cvv: string }> { return { pan: '4532 8814 2341 4821', cvv: '847' }; }
}

/** REAL — Union54 (émetteur cartes Congo/Afrique). Auth Bearer. Prêt : ne manque que UNION54_API_KEY. */
@Injectable()
export class Union54ConnectorReal implements CardIssuerConnector {
  constructor(private readonly config: ConfigService) {}

  private async call<T>(path: string, method: string, body?: unknown): Promise<T> {
    const base = this.config.get<string>('UNION54_BASE_URL');
    const key = this.config.get<string>('UNION54_API_KEY');
    if (!base || !key) throw new Error('UNION54_USE_STUB=false mais UNION54_BASE_URL/UNION54_API_KEY manquants');
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Union54 ${method} ${path} -> ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  async issueCard(params: IssueCardParams): Promise<IssuedCard> {
    // POST /v1/cards { currency, holder_ref }
    const d = await this.call<{ id: string; last4: string; exp_month: string; exp_year: string; brand: string }>(
      '/v1/cards', 'POST', { currency: params.currency, holder_ref: params.userId },
    );
    return { issuerCardId: d.id, lastFour: d.last4, expiryMonth: d.exp_month, expiryYear: d.exp_year, network: d.brand === 'mastercard' ? 'MASTERCARD' : 'VISA' };
  }

  async topUp(issuerCardId: string, amountUsd: number): Promise<{ ok: boolean }> {
    await this.call(`/v1/cards/${issuerCardId}/topups`, 'POST', { amount: amountUsd, currency: 'USD' });
    return { ok: true };
  }

  async revealPan(issuerCardId: string): Promise<{ pan: string; cvv: string }> {
    // PAN/CVV récupérés live à chaque appel — jamais stockés côté AlphaPay (PCI).
    const d = await this.call<{ pan: string; cvv: string }>(`/v1/cards/${issuerCardId}/secure-details`, 'GET');
    return { pan: d.pan, cvv: d.cvv };
  }
}

@Injectable()
export class UnlimintConnectorStub implements CardIssuerConnector {
  private readonly logger = new Logger(UnlimintConnectorStub.name);
  async issueCard(_p: IssueCardParams): Promise<IssuedCard> {
    this.logger.warn('[STUB] Unlimint issueCard');
    return { issuerCardId: `stub-unl-${randomUUID()}`, lastFour: '9032', expiryMonth: '11', expiryYear: '29', network: 'MASTERCARD' };
  }
  async topUp(): Promise<{ ok: boolean }> { return { ok: true }; }
  async revealPan(): Promise<{ pan: string; cvv: string }> { return { pan: '5232 0011 8890 9032', cvv: '221' }; }
}

/** REAL — Unlimint / Cardpay (émetteur cartes Libye). Auth token OAuth. Prêt : ne manque que UNLIMINT_API_KEY/SECRET. */
@Injectable()
export class UnlimintConnectorReal implements CardIssuerConnector {
  constructor(private readonly config: ConfigService) {}

  private async token(): Promise<string> {
    const base = this.config.get<string>('UNLIMINT_BASE_URL');
    const key = this.config.get<string>('UNLIMINT_API_KEY');
    const secret = this.config.get<string>('UNLIMINT_SECRET');
    if (!base || !key || !secret) throw new Error('UNLIMINT_USE_STUB=false mais UNLIMINT_API_KEY/SECRET/BASE_URL manquants');
    const res = await fetch(`${base}/v3/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: key, client_secret: secret }),
    });
    if (!res.ok) throw new Error(`Unlimint token -> ${res.status}`);
    return ((await res.json()) as { access_token: string }).access_token;
  }

  private async call<T>(path: string, method: string, body?: unknown): Promise<T> {
    const base = this.config.get<string>('UNLIMINT_BASE_URL');
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Unlimint ${method} ${path} -> ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  async issueCard(params: IssueCardParams): Promise<IssuedCard> {
    const d = await this.call<{ card_id: string; last_four: string; expiry: string; brand: string }>(
      '/v1/cards', 'POST', { currency: params.currency, customer_ref: params.userId, type: 'virtual' },
    );
    const [mm, yy] = (d.expiry ?? '00/00').split('/');
    return { issuerCardId: d.card_id, lastFour: d.last_four, expiryMonth: mm, expiryYear: yy, network: d.brand === 'visa' ? 'VISA' : 'MASTERCARD' };
  }

  async topUp(issuerCardId: string, amountUsd: number): Promise<{ ok: boolean }> {
    await this.call(`/v1/cards/${issuerCardId}/load`, 'POST', { amount: amountUsd, currency: 'USD' });
    return { ok: true };
  }

  async revealPan(issuerCardId: string): Promise<{ pan: string; cvv: string }> {
    const d = await this.call<{ pan: string; cvv2: string }>(`/v1/cards/${issuerCardId}/details`, 'GET');
    return { pan: d.pan, cvv: d.cvv2 };
  }
}

/** Congo → Union54, Libya → Unlimint. Each with stub/real by env flag. */
@Injectable()
export class CardIssuerFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly u54Stub: Union54ConnectorStub,
    private readonly u54Real: Union54ConnectorReal,
    private readonly unlStub: UnlimintConnectorStub,
    private readonly unlReal: UnlimintConnectorReal,
  ) {}
  getConnector(market: Market): CardIssuerConnector {
    if (market === Market.CONGO) {
      return this.config.get<boolean>('connectors.union54UseStub') ? this.u54Stub : this.u54Real;
    }
    return this.config.get<boolean>('connectors.unlimintUseStub') ? this.unlStub : this.unlReal;
  }
}
