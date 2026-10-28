import { PrismaClient } from '@paybrain/database';
import { KvStore } from '../kv/kv-store';
import { logger } from '../logging/logger';

const WINDOW_S = 60;

/** Limite par clé API et par minute (T-56) ; `API_KEY_RATE_LIMIT_PER_MIN` (défaut 100). */
export function apiKeyRateLimit(): number {
  const n = Number(process.env.API_KEY_RATE_LIMIT_PER_MIN ?? 100);
  return Number.isInteger(n) && n > 0 ? n : 100;
}

/**
 * Fenêtre fixe d'une minute par clé (compteur Redis, partagé entre instances).
 * Pose les en-têtes `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
 * (brouillon IETF « RateLimit header fields ») ; renvoie faux si la limite est atteinte.
 */
export async function consumeApiKeyQuota(kv: KvStore, keyId: string, res: { setHeader(name: string, value: string): void }): Promise<boolean> {
  const limit = apiKeyRateLimit();
  const window = Math.floor(Date.now() / 1000 / WINDOW_S);
  const count = await kv.incr(`ratelimit:apikey:${keyId}:${window}`, WINDOW_S + 5);
  const reset = (window + 1) * WINDOW_S - Math.floor(Date.now() / 1000);
  res.setHeader('RateLimit-Limit', String(limit));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - count)));
  res.setHeader('RateLimit-Reset', String(reset));
  if (count > limit) {
    res.setHeader('Retry-After', String(reset));
    return false;
  }
  return true;
}

/** Route normalisée (/v1/payments/:id) : jamais d'identifiant ni de query string. */
function routeOf(req: any): string {
  return req.route?.path ? `${req.baseUrl ?? ''}${req.route.path}` : String(req.path ?? '').replace(/[0-9a-f-]{36}/gi, ':id');
}

/** Journal des requêtes API (30 jours), écrit à la fin de la réponse, sans bloquer. */
export function trackApiRequest(prisma: PrismaClient, req: any, res: any): void {
  const started = Date.now();
  res.on('finish', () => {
    prisma.apiRequestLog
      .create({
        data: {
          merchantId: req.merchant.id,
          livemode: req.livemode === true,
          apiKeyId: req.apiKeyId ?? null,
          method: req.method,
          path: routeOf(req).slice(0, 200),
          status: res.statusCode,
          durationMs: Date.now() - started,
          errorCode: res.locals?.errorCode ?? null,
          requestId: req.id ?? null,
        },
      })
      .catch((err: Error) => logger.warn({ err: err.message }, 'Journal des requêtes API : écriture impossible'));
  });
}
