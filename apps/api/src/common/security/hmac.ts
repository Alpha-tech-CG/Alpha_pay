import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Comparaison à temps constant. Renvoie false si les longueurs diffèrent,
 * sans révéler la longueur exacte par timing.
 */
export function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    // Comparer quand même à longueur fixe pour ne pas créer de canal temporel.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export interface HmacVerificationInput {
  secret: string;
  /** Valeur brute de l'en-tête X-Signature-256 (ex. "sha256=ab12…"). */
  signatureHeader: string | undefined;
  /** Valeur brute de l'en-tête X-Timestamp (epoch secondes). */
  timestampHeader: string | undefined;
  /** Corps brut de la requête, tel que reçu sur le réseau. */
  rawBody: Buffer;
  /** Fenêtre anti-replay autorisée, en secondes (défaut 300). */
  skewSec?: number;
  /** Horloge injectable pour les tests (epoch secondes). */
  nowSec?: () => number;
}

export type HmacVerificationResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: 'missing_headers' | 'bad_timestamp' | 'skew_exceeded' | 'bad_signature_format' | 'signature_mismatch' };

/**
 * Vérifie une signature HMAC SHA-256 façon Stripe : le message signé est
 * `${timestamp}.${rawBody}`. Toute comparaison passe par timingSafeEqual.
 *
 * Ne lève jamais : renvoie un résultat discriminé pour que l'appelant décide
 * du code HTTP (toujours 401 côté webhook, jamais 200 sur échec).
 */
export function verifyWebhookHmac(input: HmacVerificationInput): HmacVerificationResult {
  const { secret, signatureHeader, timestampHeader, rawBody } = input;
  const skewSec = input.skewSec ?? 300;
  const nowSec = input.nowSec ?? (() => Math.floor(Date.now() / 1000));

  if (!signatureHeader || !timestampHeader) {
    return { ok: false, reason: 'missing_headers' };
  }

  const ts = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(ts) || String(ts) !== timestampHeader.trim()) {
    return { ok: false, reason: 'bad_timestamp' };
  }

  const ageSec = Math.abs(nowSec() - ts);
  if (ageSec > skewSec) {
    return { ok: false, reason: 'skew_exceeded' };
  }

  const signed = Buffer.concat([Buffer.from(`${ts}.`, 'utf8'), rawBody]);
  const expected = createHmac('sha256', secret).update(signed).digest();

  const providedHex = String(signatureHeader).replace(/^sha256=/i, '');
  // Validation stricte du format hex AVANT Buffer.from(.., 'hex') : une chaîne
  // non-hex serait silencieusement tronquée et fausserait la comparaison.
  if (!/^[0-9a-f]+$/i.test(providedHex) || providedHex.length !== expected.length * 2) {
    return { ok: false, reason: 'bad_signature_format' };
  }

  const provided = Buffer.from(providedHex, 'hex');
  if (!safeEqual(expected, provided)) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  return { ok: true, timestamp: ts };
}

/**
 * Calcule la signature attendue pour un corps donné. Utilisé par les tests et
 * par l'endpoint de test marchand pour produire des requêtes signées valides.
 */
export function signWebhookPayload(secret: string, timestamp: number, rawBody: Buffer | string): string {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const signed = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), body]);
  const hex = createHmac('sha256', secret).update(signed).digest('hex');
  return `sha256=${hex}`;
}
