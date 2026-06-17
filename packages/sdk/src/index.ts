import { createHmac, timingSafeEqual, randomUUID } from 'crypto';

export interface PayBrainOptions {
  apiKey: string;
  /** Base URL de l'API. Défaut : https://api.paybrain.cg */
  baseUrl?: string;
  /** Implémentation fetch (injectable pour Node < 18 ou les tests). */
  fetch?: typeof fetch;
}

export interface CreatePaymentInput {
  amount: number;
  currency: 'XAF' | 'EUR' | 'USD';
  phone: string;
  externalId: string;
  description?: string;
}

export interface PaymentResult {
  referenceId: string | null;
  transactionId: string;
  operator: 'MTN' | 'AIRTEL';
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REJECTED';
  error?: string;
}

export class PayBrainError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'PayBrainError';
  }
}

/**
 * Client TypeScript de l'API PayBrain.
 *
 * ```ts
 * const pb = new PayBrain({ apiKey: process.env.PAYBRAIN_KEY! });
 * const payment = await pb.createPayment({
 *   amount: 1000, currency: 'XAF', phone: '+242066123456', externalId: 'cmd-1',
 * });
 * ```
 */
export class PayBrain {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PayBrainOptions) {
    if (!options.apiKey) throw new Error('PayBrain: apiKey requis');
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.paybrain.cg').replace(/\/$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  /** Initie un paiement. Une `Idempotency-Key` est générée si non fournie. */
  createPayment(input: CreatePaymentInput, idempotencyKey: string = randomUUID()): Promise<PaymentResult> {
    return this.request('POST', '/payments', input, { 'Idempotency-Key': idempotencyKey });
  }

  getPayment(referenceId: string): Promise<PaymentResult> {
    return this.request('GET', `/payments/${encodeURIComponent(referenceId)}`);
  }

  createPaylink(input: { amount: number; currency: string; description: string; expiresInMinutes?: number }) {
    return this.request('POST', '/paylinks', input);
  }

  listApiKeys() {
    return this.request('GET', '/v1/api-keys');
  }

  listWebhookEndpoints() {
    return this.request('GET', '/v1/webhook-endpoints');
  }

  private async request<T = any>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const headers: Record<string, string> = { 'X-API-Key': this.apiKey, ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const parsed = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      throw new PayBrainError(`PayBrain ${method} ${path} -> ${res.status}`, res.status, parsed);
    }
    return parsed as T;
  }
}

/**
 * Vérifie la signature d'un webhook entrant PayBrain (HMAC SHA-256 sur
 * `${timestamp}.${rawBody}`), avec contrôle anti-replay du timestamp.
 */
export function verifyWebhookSignature(opts: {
  secret: string;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  rawBody: string | Buffer;
  toleranceSec?: number;
}): boolean {
  const { secret, signatureHeader, timestampHeader, rawBody } = opts;
  const tolerance = opts.toleranceSec ?? 300;
  if (!signatureHeader || !timestampHeader) return false;

  const ts = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > tolerance) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const signed = Buffer.concat([Buffer.from(`${ts}.`, 'utf8'), body]);
  const expected = 'sha256=' + createHmac('sha256', secret).update(signed).digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}
