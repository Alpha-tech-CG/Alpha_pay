import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const SCRYPT_KEYLEN = 32;

export interface GeneratedApiKey {
  /** Clé complète, à montrer UNE SEULE FOIS au marchand. */
  full: string;
  /** Préfixe public, stocké en clair pour le lookup. */
  prefix: string;
  /** Secret en clair (uniquement à la génération, jamais persisté). */
  secret: string;
}

/**
 * Génère une clé API au format `pk_<mode>_<prefixId>_<secret>` (ALP-136).
 * Le prefixId (8 hex) est public et sert au lookup ; le secret (haute entropie)
 * n'est jamais stocké en clair.
 */
export function generateApiKey(mode: 'test' | 'live'): GeneratedApiKey {
  const prefixId = randomBytes(4).toString('hex');
  const secret = randomBytes(24).toString('base64url');
  const prefix = `pk_${mode}_${prefixId}`;
  return { full: `${prefix}_${secret}`, prefix, secret };
}

/** Hash scrypt salé du secret : format `salt_hex:hash_hex`. */
export function hashApiKeySecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, SCRYPT_KEYLEN);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Vérifie un secret présenté contre le hash stocké (timing-safe). */
export function verifyApiKeySecret(secret: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(secret, Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** Découpe une clé présentée en { prefix, secret }. Renvoie null si format invalide. */
export function parseApiKey(raw: string): { prefix: string; secret: string } | null {
  const m = /^(pk_(?:test|live)_[0-9a-f]{8})_([A-Za-z0-9_-]{20,})$/.exec(raw);
  if (!m) return null;
  return { prefix: m[1], secret: m[2] };
}
