import { createHmac, randomUUID } from 'crypto';
import type { HttpClient, HttpRequest } from '../core/http';
import type { IncomingRequest } from '../mobile-money/types';

/**
 * Faux serveur Sumsub (tests de contrat) : vérifie la signature des requêtes
 * comme le vrai service, garde les demandeurs en mémoire et fabrique les
 * webhooks signés `applicantReviewed`.
 */
export class FakeSumsub implements HttpClient {
  readonly applicants = new Map<string, { externalUserId: string; lastName?: string; review?: any }>();

  constructor(private readonly cfg: { appToken: string; secretKey: string; webhookSecret: string }) {}

  async request(req: HttpRequest) {
    const url = new URL(req.url);
    const path = url.pathname + url.search;
    const raw = typeof req.body === 'string' ? req.body : req.body === undefined ? '' : JSON.stringify(req.body);
    const ts = req.headers?.['X-App-Access-Ts'] ?? '';
    const expected = createHmac('sha256', this.cfg.secretKey).update(ts + req.method + path + raw).digest('hex');
    if (req.headers?.['X-App-Token'] !== this.cfg.appToken || req.headers?.['X-App-Access-Sig'] !== expected) {
      return { status: 401, data: { description: 'Invalid signature' }, headers: {} };
    }
    if (req.method === 'POST' && url.pathname === '/resources/applicants') {
      const body = JSON.parse(raw);
      const id = randomUUID().replace(/-/g, '').slice(0, 24);
      this.applicants.set(id, { externalUserId: body.externalUserId, lastName: body.fixedInfo?.lastName });
      return { status: 201, data: { id, externalUserId: body.externalUserId, review: { reviewStatus: 'init' } }, headers: {} };
    }
    const one = /^\/resources\/applicants\/([^/]+)\/one$/.exec(url.pathname);
    if (req.method === 'GET' && one) {
      const a = this.applicants.get(one[1]);
      if (!a) return { status: 404, data: {}, headers: {} };
      return { status: 200, data: { id: one[1], externalUserId: a.externalUserId, review: a.review ?? { reviewStatus: 'init' } }, headers: {} };
    }
    if (req.method === 'POST' && /^\/resources\/sdkIntegrations\/levels\/[^/]+\/websdkLink$/.test(url.pathname)) {
      return { status: 200, data: { url: `https://in.sumsub.com/websdk/p/${randomUUID()}` }, headers: {} };
    }
    return { status: 404, data: {}, headers: {} };
  }

  /** Termine la revue (approuvée sauf nom contenant « REJET ») et renvoie le webhook signé. */
  complete(applicantId: string): IncomingRequest {
    const a = this.applicants.get(applicantId)!;
    const rejected = (a.lastName ?? '').toUpperCase().includes('REJET');
    a.review = {
      reviewStatus: 'completed',
      reviewResult: rejected ? { reviewAnswer: 'RED', reviewRejectType: 'FINAL', rejectLabels: ['FORGERY'] } : { reviewAnswer: 'GREEN' },
    };
    const rawBody = JSON.stringify({ applicantId, externalUserId: a.externalUserId, type: 'applicantReviewed', ...a.review });
    return {
      headers: { 'x-payload-digest': createHmac('sha256', this.cfg.webhookSecret).update(rawBody).digest('hex'), 'x-payload-digest-alg': 'HMAC_SHA256_HEX' },
      body: JSON.parse(rawBody),
      rawBody,
    };
  }
}
