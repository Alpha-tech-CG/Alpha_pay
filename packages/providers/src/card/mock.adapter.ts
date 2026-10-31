import { randomUUID } from 'crypto';
import { ProviderError } from '../core/errors';
import { assertAmount, headerValue, hmacSha256Hex, safeEqual } from '../core/validation';
import type { IncomingRequest, PaymentStatus } from '../mobile-money/types';
import type {
  CardAcquirer,
  CardDisputeEvent,
  CardRefundInput,
  CardRefundResult,
  CardSession,
  CardStateStore,
  CardStatusResult,
  CardWebhookEvent,
  CreateCardSessionInput,
} from './types';

const PROVIDER = 'mock-card';
export const MOCK_CARD_SIGNATURE_HEADER = 'x-mock-card-signature';
/** Cartes de test : la marque suit le premier chiffre ; ce numéro est toujours refusé. */
export const MOCK_DECLINED_CARD = '4000000000000002';
const STATE_TTL_SECONDS = 90 * 86_400;

interface SessionState {
  status: PaymentStatus;
  expiresAt: number;
  amount: number;
  currency: string;
  refunded: number;
  returnUrl: string;
  cancelUrl: string;
  failureReason?: string;
  card?: { brand: string; last4: string };
}

class MemoryState implements CardStateStore {
  private readonly map = new Map<string, string>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.map.set(key, value);
  }
}

function brandOf(pan: string): string {
  if (pan.startsWith('4')) return 'visa';
  if (/^5[1-5]|^2[2-7]/.test(pan)) return 'mastercard';
  return 'carte';
}

/**
 * Acquéreur carte factice : la « page partenaire » est servie par AlphaPay en
 * test (`/mock/card/:sessionId`). L'état vit dans un `CardStateStore` (Redis
 * en fonctionnement) pour être lu aussi bien par l'API que par le worker. Le
 * numéro saisi sur la page factice ne sert qu'à choisir la marque et l'issue :
 * il n'est jamais conservé, seuls la marque et les 4 derniers chiffres le sont.
 */
export class MockCardAcquirer implements CardAcquirer {
  readonly name = PROVIDER;
  private readonly store: CardStateStore;

  constructor(
    private readonly opts: { webhookSecret: string; baseUrl?: string; now?: () => number; ttlSeconds?: number; store?: CardStateStore } = {
      webhookSecret: 'mock-card-secret',
    },
  ) {
    this.store = opts.store ?? new MemoryState();
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  async createSession(input: CreateCardSessionInput): Promise<CardSession> {
    assertAmount(PROVIDER, input.amount, input.currency);
    const sessionId = `mockcs_${randomUUID().replace(/-/g, '')}`;
    const expiresAt = this.now() + (this.opts.ttlSeconds ?? 900) * 1000;
    await this.save(sessionId, { status: 'pending', expiresAt, amount: input.amount, currency: input.currency, refunded: 0, returnUrl: input.returnUrl, cancelUrl: input.cancelUrl });
    return {
      sessionId,
      redirectUrl: `${this.opts.baseUrl ?? 'http://localhost:3000'}/mock/card/${sessionId}`,
      expiresAt: new Date(expiresAt),
    };
  }

  /** Montant et devise d'une session, pour l'affichage de la page factice. */
  async describe(sessionId: string): Promise<{ amount: number; currency: string; status: PaymentStatus; returnUrl: string; cancelUrl: string }> {
    const s = await this.load(sessionId);
    return { amount: s.amount, currency: s.currency, status: s.status, returnUrl: s.returnUrl, cancelUrl: s.cancelUrl };
  }

  /** Issue choisie sur la page factice ; renvoie le webhook signé que le partenaire enverrait. */
  async complete(sessionId: string, outcome: 'succeeded' | 'failed' | 'canceled', pan = '4242424242424242'): Promise<IncomingRequest> {
    const s = await this.load(sessionId);
    if (s.status !== 'pending') throw new ProviderError('invalid_request', 'Session déjà terminée', { provider: PROVIDER });
    const digits = pan.replace(/\D/g, '');
    const final = outcome === 'succeeded' && digits === MOCK_DECLINED_CARD ? 'failed' : outcome;
    s.status = final;
    if (final === 'failed') s.failureReason = 'CARD_DECLINED';
    if (final !== 'canceled' && digits.length >= 12) s.card = { brand: brandOf(digits), last4: digits.slice(-4) };
    await this.save(sessionId, s);
    return this.signed({ type: 'payment', sessionId, status: final, failureReason: s.failureReason });
  }

  /** Simule l'ouverture d'un litige par la banque du porteur. */
  async openDispute(sessionId: string, reason = 'fraude_suspectee'): Promise<IncomingRequest> {
    const s = await this.load(sessionId);
    const disputeRef = `mockdp_${randomUUID().replace(/-/g, '')}`;
    const evidenceDueAt = new Date(this.now() + 7 * 86_400_000).toISOString();
    return this.signed({ type: 'dispute', disputeRef, sessionId, amount: s.amount, currency: s.currency, reason, status: 'open', evidenceDueAt });
  }

  /** Simule la décision de l'acquéreur sur un litige. */
  async closeDispute(disputeRef: string, sessionId: string, won: boolean): Promise<IncomingRequest> {
    const s = await this.load(sessionId);
    return this.signed({ type: 'dispute', disputeRef, sessionId, amount: s.amount, currency: s.currency, reason: 'decision', status: won ? 'won' : 'lost' });
  }

  async getSessionStatus(sessionId: string): Promise<CardStatusResult> {
    const s = await this.load(sessionId);
    if (s.status === 'pending' && this.now() >= s.expiresAt) return { status: 'expired', failureReason: 'SESSION_EXPIRED' };
    return { status: s.status, ...(s.failureReason ? { failureReason: s.failureReason } : {}), ...(s.card ? { card: s.card } : {}) };
  }

  async refund(input: CardRefundInput): Promise<CardRefundResult> {
    const s = await this.load(input.sessionId);
    const done = await this.store.get(`refund:${input.reference}`);
    if (done) return JSON.parse(done) as CardRefundResult;
    let result: CardRefundResult;
    if (s.status !== 'succeeded') result = { refundRef: `mockrf_${randomUUID()}`, status: 'failed', failureReason: 'PAYMENT_NOT_CAPTURED' };
    else if (input.amount <= 0 || s.refunded + input.amount > s.amount) result = { refundRef: `mockrf_${randomUUID()}`, status: 'failed', failureReason: 'AMOUNT_EXCEEDS_CAPTURE' };
    else {
      s.refunded += input.amount;
      await this.save(input.sessionId, s);
      result = { refundRef: `mockrf_${randomUUID()}`, status: 'succeeded' };
    }
    await this.store.set(`refund:${input.reference}`, JSON.stringify(result), STATE_TTL_SECONDS);
    return result;
  }

  async submitDisputeEvidence(disputeRef: string, text: string): Promise<void> {
    if (!disputeRef || !text.trim()) throw new ProviderError('invalid_request', 'Preuves vides', { provider: PROVIDER });
  }

  parseWebhook(req: IncomingRequest): CardWebhookEvent | null {
    const signature = headerValue(req.headers, MOCK_CARD_SIGNATURE_HEADER);
    if (!req.rawBody || !signature || !safeEqual(signature, hmacSha256Hex(this.opts.webhookSecret, req.rawBody))) {
      throw new ProviderError('invalid_signature', 'Signature du webhook carte invalide', { provider: PROVIDER });
    }
    const body = JSON.parse(req.rawBody) as Record<string, unknown>;
    if (body.type === 'dispute' && typeof body.disputeRef === 'string' && typeof body.sessionId === 'string') {
      const dispute: CardDisputeEvent = {
        disputeRef: body.disputeRef,
        sessionId: body.sessionId,
        amount: Number(body.amount),
        currency: String(body.currency),
        reason: String(body.reason ?? ''),
        status: body.status as CardDisputeEvent['status'],
        ...(typeof body.evidenceDueAt === 'string' ? { evidenceDueAt: new Date(body.evidenceDueAt) } : {}),
      };
      return { type: 'dispute', dispute };
    }
    const statuses: PaymentStatus[] = ['succeeded', 'failed', 'canceled', 'expired'];
    if (typeof body.sessionId !== 'string' || !statuses.includes(body.status as PaymentStatus)) return null;
    return {
      type: 'payment',
      payment: {
        providerRef: body.sessionId,
        status: body.status as PaymentStatus,
        ...(typeof body.failureReason === 'string' ? { failureReason: body.failureReason } : {}),
      },
    };
  }

  private signed(payload: Record<string, unknown>): IncomingRequest {
    const rawBody = JSON.stringify(payload);
    return { headers: { [MOCK_CARD_SIGNATURE_HEADER]: hmacSha256Hex(this.opts.webhookSecret, rawBody) }, body: JSON.parse(rawBody), rawBody };
  }

  private async load(sessionId: string): Promise<SessionState> {
    const raw = await this.store.get(`session:${sessionId}`);
    if (!raw) throw new ProviderError('not_found', 'Session carte inconnue', { provider: PROVIDER });
    return JSON.parse(raw) as SessionState;
  }

  private save(sessionId: string, s: SessionState) {
    return this.store.set(`session:${sessionId}`, JSON.stringify(s), STATE_TTL_SECONDS);
  }
}
