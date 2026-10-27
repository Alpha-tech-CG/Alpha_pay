import { randomUUID } from 'crypto';
import { ProviderError } from '../core/errors';
import { headerValue, hmacSha256Hex, safeEqual } from '../core/validation';
import type { IncomingRequest } from '../mobile-money/types';
import type { CreateApplicantInput, KycDecision, KycProvider, KycResult, KycWebhookEvent } from './types';

const PROVIDER = 'mock-kyc';
export const MOCK_KYC_SIGNATURE_HEADER = 'x-mock-kyc-signature';

/**
 * KYC factice. Règle de décision documentée : un nom de famille contenant
 * « REJET » est refusé, « REPRISE » demande une nouvelle tentative, tout autre
 * dossier est approuvé dès qu'il est soumis par le lien de vérification.
 */
export class MockKycProvider implements KycProvider {
  readonly name = PROVIDER;
  private readonly applicants = new Map<string, { externalId: string; lastName?: string; submitted: boolean }>();

  constructor(
    private readonly opts: { webhookSecret: string; baseUrl?: string; now?: () => number } = { webhookSecret: 'mock-kyc-secret' },
  ) {}

  async createApplicant(input: CreateApplicantInput): Promise<{ applicantId: string }> {
    if (!input.externalId) throw new ProviderError('invalid_request', 'externalId requis', { provider: PROVIDER });
    const applicantId = `mockapp_${randomUUID()}`;
    this.applicants.set(applicantId, { externalId: input.externalId, lastName: input.lastName, submitted: false });
    return { applicantId };
  }

  async createVerificationLink(applicantId: string, opts: { ttlSeconds?: number } = {}) {
    this.get(applicantId);
    const now = this.opts.now?.() ?? Date.now();
    return {
      url: `${this.opts.baseUrl ?? 'http://localhost:3000'}/mock/kyc/${applicantId}`,
      expiresAt: new Date(now + (opts.ttlSeconds ?? 1800) * 1000),
    };
  }

  /** Simule la soumission des pièces par le dirigeant (utilisé par la page factice et les tests). */
  submit(applicantId: string): KycWebhookEvent {
    const a = this.get(applicantId);
    a.submitted = true;
    return { applicantId, externalId: a.externalId, ...this.decide(a) };
  }

  async getResult(applicantId: string): Promise<KycResult> {
    const a = this.get(applicantId);
    return a.submitted ? this.decide(a) : { decision: 'pending' };
  }

  /** Construit un webhook signé, tel que le mock l'enverrait à AlphaPay. */
  signWebhook(event: KycWebhookEvent): IncomingRequest {
    const rawBody = JSON.stringify(event);
    return {
      headers: { [MOCK_KYC_SIGNATURE_HEADER]: hmacSha256Hex(this.opts.webhookSecret, rawBody) },
      body: event,
      rawBody,
    };
  }

  parseWebhook(req: IncomingRequest): KycWebhookEvent | null {
    const signature = headerValue(req.headers, MOCK_KYC_SIGNATURE_HEADER);
    if (!req.rawBody || !signature || !safeEqual(signature, hmacSha256Hex(this.opts.webhookSecret, req.rawBody))) {
      throw new ProviderError('invalid_signature', 'Signature du webhook KYC invalide', { provider: PROVIDER });
    }
    const body = JSON.parse(req.rawBody) as Partial<KycWebhookEvent>;
    const decisions: KycDecision[] = ['pending', 'approved', 'rejected', 'retry'];
    if (typeof body.applicantId !== 'string' || typeof body.externalId !== 'string' || !decisions.includes(body.decision!)) {
      return null;
    }
    return { applicantId: body.applicantId, externalId: body.externalId, decision: body.decision!, reasons: body.reasons };
  }

  private get(applicantId: string) {
    const a = this.applicants.get(applicantId);
    if (!a) throw new ProviderError('not_found', 'Demandeur KYC inconnu', { provider: PROVIDER });
    return a;
  }

  private decide(a: { lastName?: string }): KycResult {
    const name = (a.lastName ?? '').toUpperCase();
    if (name.includes('REJET')) return { decision: 'rejected', reasons: ['DOCUMENT_INVALID'] };
    if (name.includes('REPRISE')) return { decision: 'retry', reasons: ['BAD_PHOTO'] };
    return { decision: 'approved' };
  }
}
