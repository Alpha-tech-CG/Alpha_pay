import { randomUUID } from 'crypto';
import { ProviderError } from '../core/errors';
import { assertAmount, headerValue, hmacSha256Hex, safeEqual } from '../core/validation';
import type { CallbackResult, IncomingRequest, PaymentStatus, PaymentStatusResult } from '../mobile-money/types';
import type { CardAcquirer, CardSession, CreateCardSessionInput } from './types';

const PROVIDER = 'mock-card';
export const MOCK_CARD_SIGNATURE_HEADER = 'x-mock-card-signature';

/**
 * Acquéreur carte factice : la « page partenaire » est servie par AlphaPay en
 * local (`/mock/card/:sessionId`) et propose Payer / Refuser / Annuler, qui
 * appellent `complete()`. Aucune donnée de carte n'est demandée.
 */
export class MockCardAcquirer implements CardAcquirer {
  readonly name = PROVIDER;
  private readonly sessions = new Map<string, { status: PaymentStatus; expiresAt: number; failureReason?: string }>();

  constructor(
    private readonly opts: { webhookSecret: string; baseUrl?: string; now?: () => number; ttlSeconds?: number } = {
      webhookSecret: 'mock-card-secret',
    },
  ) {}

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  async createSession(input: CreateCardSessionInput): Promise<CardSession> {
    assertAmount(PROVIDER, input.amount, input.currency);
    const sessionId = `mockcs_${randomUUID()}`;
    const expiresAt = this.now() + (this.opts.ttlSeconds ?? 900) * 1000;
    this.sessions.set(sessionId, { status: 'pending', expiresAt });
    return {
      sessionId,
      redirectUrl: `${this.opts.baseUrl ?? 'http://localhost:3000'}/mock/card/${sessionId}`,
      expiresAt: new Date(expiresAt),
    };
  }

  /** Issue choisie par le client sur la page factice. */
  complete(sessionId: string, outcome: 'succeeded' | 'failed' | 'canceled'): IncomingRequest {
    const s = this.get(sessionId);
    s.status = outcome;
    if (outcome === 'failed') s.failureReason = 'CARD_DECLINED';
    const rawBody = JSON.stringify({ sessionId, status: outcome, failureReason: s.failureReason });
    return { headers: { [MOCK_CARD_SIGNATURE_HEADER]: hmacSha256Hex(this.opts.webhookSecret, rawBody) }, body: JSON.parse(rawBody), rawBody };
  }

  async getSessionStatus(sessionId: string): Promise<PaymentStatusResult> {
    const s = this.get(sessionId);
    if (s.status === 'pending' && this.now() >= s.expiresAt) return { status: 'expired', failureReason: 'SESSION_EXPIRED' };
    return { status: s.status, ...(s.failureReason ? { failureReason: s.failureReason } : {}) };
  }

  parseWebhook(req: IncomingRequest): CallbackResult | null {
    const signature = headerValue(req.headers, MOCK_CARD_SIGNATURE_HEADER);
    if (!req.rawBody || !signature || !safeEqual(signature, hmacSha256Hex(this.opts.webhookSecret, req.rawBody))) {
      throw new ProviderError('invalid_signature', 'Signature du webhook carte invalide', { provider: PROVIDER });
    }
    const body = JSON.parse(req.rawBody) as { sessionId?: unknown; status?: unknown; failureReason?: unknown };
    const statuses: PaymentStatus[] = ['succeeded', 'failed', 'canceled', 'expired'];
    if (typeof body.sessionId !== 'string' || !statuses.includes(body.status as PaymentStatus)) return null;
    return {
      providerRef: body.sessionId,
      status: body.status as PaymentStatus,
      ...(typeof body.failureReason === 'string' ? { failureReason: body.failureReason } : {}),
    };
  }

  private get(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s) throw new ProviderError('not_found', 'Session carte inconnue', { provider: PROVIDER });
    return s;
  }
}
