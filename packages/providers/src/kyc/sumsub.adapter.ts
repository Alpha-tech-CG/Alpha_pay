import { ProviderError, errorFromHttpStatus } from '../core/errors';
import { createFetchHttpClient, HttpClient } from '../core/http';
import { headerValue, safeEqual } from '../core/validation';
import type { IncomingRequest } from '../mobile-money/types';
import { createHmac } from 'crypto';
import type { CreateApplicantInput, KycProvider, KycResult, KycWebhookEvent } from './types';

const PROVIDER = 'sumsub';

export interface SumsubConfig {
  appToken: string;
  secretKey: string;
  /** Secret des webhooks (en-tête X-Payload-Digest). */
  webhookSecret: string;
  /** Niveau de vérification configuré chez Sumsub (ex. « dirigeant-kyb »). */
  levelName: string;
  baseUrl?: string;
}

const DIGEST_ALGOS: Record<string, string> = { HMAC_SHA1_HEX: 'sha1', HMAC_SHA256_HEX: 'sha256', HMAC_SHA512_HEX: 'sha512' };

/**
 * Sumsub (§M2, T-60). Requêtes signées : X-App-Access-Sig = HMAC-SHA256(secret,
 * horodatage + méthode + chemin + corps). Le webhook n'est qu'un déclencheur :
 * l'appelant relit le résultat par `getResult` (D-021).
 * Chemins et formats d'après la documentation publique Sumsub : à valider sur
 * le compte réel (dépendance « contrat Sumsub », §13).
 */
export class SumsubKycProvider implements KycProvider {
  readonly name = PROVIDER;
  private readonly http: HttpClient;
  private readonly baseUrl: string;

  constructor(
    private readonly config: SumsubConfig,
    deps: { http?: HttpClient; now?: () => number } = {},
  ) {
    this.http = deps.http ?? createFetchHttpClient(PROVIDER);
    this.baseUrl = (config.baseUrl ?? 'https://api.sumsub.com').replace(/\/$/, '');
    this.now = deps.now ?? Date.now;
  }

  private readonly now: () => number;

  private async call(method: 'GET' | 'POST', path: string, body?: unknown) {
    const ts = Math.floor(this.now() / 1000).toString();
    const raw = body === undefined ? '' : JSON.stringify(body);
    const sig = createHmac('sha256', this.config.secretKey).update(ts + method + path + raw).digest('hex');
    const res = await this.http.request({
      method,
      url: this.baseUrl + path,
      headers: { 'X-App-Token': this.config.appToken, 'X-App-Access-Ts': ts, 'X-App-Access-Sig': sig, Accept: 'application/json' },
      body: body === undefined ? undefined : raw,
    });
    if (res.status >= 400) throw errorFromHttpStatus(PROVIDER, res.status, `${method} ${path.split('?')[0]}`);
    return res.data;
  }

  async createApplicant(input: CreateApplicantInput): Promise<{ applicantId: string }> {
    if (!input.externalId) throw new ProviderError('invalid_request', 'externalId requis', { provider: PROVIDER });
    const data = await this.call('POST', `/resources/applicants?levelName=${encodeURIComponent(this.config.levelName)}`, {
      externalUserId: input.externalId,
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      fixedInfo: { firstName: input.firstName, lastName: input.lastName, country: 'COG' },
    });
    if (!data?.id) throw new ProviderError('unknown', 'Réponse Sumsub sans identifiant de demandeur', { provider: PROVIDER });
    return { applicantId: data.id };
  }

  async createVerificationLink(applicantId: string, opts: { ttlSeconds?: number; locale?: string } = {}) {
    const ttl = opts.ttlSeconds ?? 1800;
    const applicant = await this.call('GET', `/resources/applicants/${encodeURIComponent(applicantId)}/one`);
    const externalUserId = applicant?.externalUserId;
    if (!externalUserId) throw new ProviderError('not_found', 'Demandeur Sumsub inconnu', { provider: PROVIDER });
    const path =
      `/resources/sdkIntegrations/levels/${encodeURIComponent(this.config.levelName)}/websdkLink` +
      `?ttlInSecs=${ttl}&externalUserId=${encodeURIComponent(externalUserId)}&lang=${opts.locale ?? 'fr'}`;
    const data = await this.call('POST', path);
    if (!data?.url) throw new ProviderError('unknown', 'Réponse Sumsub sans lien de vérification', { provider: PROVIDER });
    return { url: data.url as string, expiresAt: new Date(this.now() + ttl * 1000) };
  }

  async getResult(applicantId: string): Promise<KycResult> {
    const data = await this.call('GET', `/resources/applicants/${encodeURIComponent(applicantId)}/one`);
    return toResult(data?.review);
  }

  parseWebhook(req: IncomingRequest): KycWebhookEvent | null {
    const digest = headerValue(req.headers, 'x-payload-digest');
    const algo = DIGEST_ALGOS[headerValue(req.headers, 'x-payload-digest-alg') ?? 'HMAC_SHA256_HEX'];
    if (!req.rawBody || !digest || !algo) throw new ProviderError('invalid_signature', 'Webhook Sumsub non signé', { provider: PROVIDER });
    const expected = createHmac(algo, this.config.webhookSecret).update(req.rawBody).digest('hex');
    if (!safeEqual(digest.toLowerCase(), expected)) throw new ProviderError('invalid_signature', 'Signature du webhook Sumsub invalide', { provider: PROVIDER });

    const body = JSON.parse(req.rawBody);
    if (typeof body.applicantId !== 'string' || typeof body.externalUserId !== 'string') return null;
    return { applicantId: body.applicantId, externalId: body.externalUserId, ...toResult({ reviewStatus: body.reviewStatus, reviewResult: body.reviewResult }) };
  }
}

/** Traduction du statut de revue Sumsub vers la décision commune. */
function toResult(review: any): KycResult {
  if (!review || review.reviewStatus !== 'completed' || !review.reviewResult) return { decision: 'pending' };
  const r = review.reviewResult;
  if (r.reviewAnswer === 'GREEN') return { decision: 'approved' };
  const reasons: string[] = Array.isArray(r.rejectLabels) ? r.rejectLabels.map(String) : [];
  return { decision: r.reviewRejectType === 'RETRY' ? 'retry' : 'rejected', reasons };
}
