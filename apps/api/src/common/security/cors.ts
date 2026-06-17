import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

// Origines de dev par défaut (dashboard Vite + API) quand ALLOWED_ORIGINS est absent.
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];

/**
 * Parse la liste d'origines autorisées depuis ALLOWED_ORIGINS (séparées par
 * virgules). En l'absence de variable, retombe sur les origines de dev locales.
 * Ne renvoie JAMAIS '*'.
 */
export function parseAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.ALLOWED_ORIGINS;
  if (!raw || raw.trim().length === 0) return [...DEV_ORIGINS];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0 && o !== '*');
}

/**
 * Construit les options CORS avec allowlist stricte (ALP-155).
 *
 * - Une origine absente (appels serveur-à-serveur / curl) est autorisée : CORS
 *   ne protège que les navigateurs, et nos clients API n'envoient pas d'Origin.
 * - Une origine présente mais hors allowlist → refus (pas d'en-tête ACAO, donc
 *   le navigateur bloque). Jamais de wildcard.
 * - credentials non activé : l'auth se fait par X-API-Key/Authorization, pas par
 *   cookie ; éviter credentials:true réduit la surface CSRF.
 */
export function buildCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const allowlist = new Set(parseAllowedOrigins(env));
  return {
    origin(origin, callback) {
      if (!origin || allowlist.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization', 'Idempotency-Key'],
    methods: ['GET', 'POST', 'OPTIONS'],
    maxAge: 600,
  };
}
