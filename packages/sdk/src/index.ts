import { createHmac, timingSafeEqual, randomUUID } from 'crypto';

export interface PayBrainOptions {
  apiKey: string;
  /** Base URL de l'API. Défaut : https://api.paybrain.cg */
  baseUrl?: string;
  /** Implémentation fetch (injectable pour Node < 18 ou les tests). */
  fetch?: typeof fetch;
}

export interface CreatePaymentInput {
  /** Unités majeures (XAF : francs entiers). */
  amount: number;
  currency?: 'XAF' | 'EUR' | 'USD';
  /** Mobile Money (défaut) ou carte : la réponse porte alors `redirect_url`, à ouvrir pour le payeur. */
  method?: 'mobile_money' | 'card';
  /** Obligatoire pour le Mobile Money. */
  phone?: string;
  /** Carte : page où revient le payeur après paiement (obligatoire) et après abandon. */
  return_url?: string;
  cancel_url?: string;
  /** Référence du marchand, unique par mode. */
  reference: string;
  operator?: 'mtn' | 'airtel';
  description?: string;
  till_id?: string;
}

/** Paiement tel que renvoyé par /v1/payments. */
export interface Payment {
  id: string;
  object: 'payment';
  livemode: boolean;
  status: 'en_attente' | 'réussi' | 'échoué' | 'expiré' | 'annulé';
  amount: number;
  currency: string;
  operator: 'mtn' | 'airtel' | 'card';
  payment_method: 'mobile_money' | 'card';
  payer_phone: string | null;
  /** Carte : marque et 4 derniers chiffres, jamais le numéro complet. */
  card: { brand: string | null; last4: string | null } | null;
  /** Carte en attente : page de l'acquéreur où envoyer le payeur. */
  redirect_url: string | null;
  amount_refunded: number;
  reference: string;
  description: string | null;
  failure_reason: string | null;
  store_id: string | null;
  till_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Refund {
  id: string;
  object: 'refund';
  payment_id: string;
  livemode: boolean;
  amount: number;
  currency: string;
  reason: string;
  method: 'provider' | 'manual';
  status: 'en_attente' | 'réussi' | 'échoué';
  failure_reason: string | null;
  created_at: string;
}

export interface Dispute {
  id: string;
  object: 'dispute';
  payment_id: string;
  livemode: boolean;
  amount: number;
  currency: string;
  reason: string;
  status: 'ouvert' | 'en_examen' | 'gagné' | 'perdu';
  evidence_due_at: string | null;
  created_at: string;
}

export interface List<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
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
 *   amount: 1000, phone: '+242066123456', reference: 'cmd-1',
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
  createPayment(input: CreatePaymentInput, idempotencyKey: string = randomUUID()): Promise<Payment> {
    return this.request('POST', '/v1/payments', input, { 'Idempotency-Key': idempotencyKey });
  }

  getPayment(id: string): Promise<Payment> {
    return this.request('GET', `/v1/payments/${encodeURIComponent(id)}`);
  }

  listPayments(params: { limit?: number; starting_after?: string; status?: Payment['status'] } = {}): Promise<List<Payment>> {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    return this.request('GET', `/v1/payments${qs.size ? `?${qs}` : ''}`);
  }

  /** Rembourse un paiement réussi ; sans `amount`, tout le montant restant. */
  createRefund(paymentId: string, input: { amount?: number; reason: string; manual?: boolean }, idempotencyKey: string = randomUUID()): Promise<Refund> {
    return this.request('POST', `/v1/payments/${encodeURIComponent(paymentId)}/refunds`, input, { 'Idempotency-Key': idempotencyKey });
  }

  listRefunds(paymentId: string): Promise<{ object: 'list'; data: Refund[] }> {
    return this.request('GET', `/v1/payments/${encodeURIComponent(paymentId)}/refunds`);
  }

  listDisputes(): Promise<{ object: 'list'; data: Dispute[] }> {
    return this.request('GET', '/v1/disputes');
  }

  submitDisputeEvidence(disputeId: string, evidence: string): Promise<Dispute> {
    return this.request('POST', `/v1/disputes/${encodeURIComponent(disputeId)}/evidence`, { evidence });
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
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}`, ...extraHeaders };
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
