import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';

// Argon2id — paramètres recommandés (mémoire 64 Mio, time 3, parallélisme 4).
const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 4,
};

// Hash factice (d'un secret aléatoire) pour égaliser le temps de réponse quand
// le préfixe est inconnu (anti-timing : ne pas révéler l'existence d'une clé).
let dummyHashPromise: Promise<string> | null = null;

export interface GeneratedApiKey {
  /** Clé complète, à montrer UNE SEULE FOIS au marchand. */
  full: string;
  /** Préfixe public, stocké en clair pour le lookup O(1). */
  prefix: string;
  /** Secret en clair (uniquement à la génération, jamais persisté). */
  secret: string;
}

/**
 * Pepper applicatif (≥32 chars), chargé depuis Secrets Manager en prod
 * (API_KEY_PEPPER). Concaténé au secret avant hash : une fuite de la base seule
 * ne suffit pas pour attaquer les hashs hors-ligne.
 */
function getPepper(): string {
  const pepper = process.env.API_KEY_PEPPER;
  if (pepper && pepper.length >= 32) return pepper;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('API_KEY_PEPPER (≥32 chars) requis en production');
  }
  return 'dev-only-pepper-not-for-production-0000000000';
}

export function generateApiKey(mode: 'test' | 'live'): GeneratedApiKey {
  const prefixId = randomBytes(4).toString('hex');
  const secret = randomBytes(24).toString('base64url');
  const prefix = `pk_${mode}_${prefixId}`;
  return { full: `${prefix}_${secret}`, prefix, secret };
}

/** Hash Argon2id du secret peppered. */
export function hashApiKeySecret(secret: string): Promise<string> {
  return argon2.hash(secret + getPepper(), ARGON2_OPTS);
}

/** Vérifie un secret présenté contre le hash stocké (Argon2 est timing-safe). */
export async function verifyApiKeySecret(secret: string, stored: string): Promise<boolean> {
  try {
    return await argon2.verify(stored, secret + getPepper());
  } catch {
    return false;
  }
}

/**
 * Vérification anti-timing pour préfixe inconnu : on effectue quand même un
 * argon2.verify contre un hash factice, pour que le temps de réponse ne
 * dépende pas de l'existence du préfixe.
 */
export async function verifyAgainstDummy(secret: string): Promise<false> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash(randomBytes(32).toString('hex'), ARGON2_OPTS);
  }
  const dummy = await dummyHashPromise;
  await verifyApiKeySecret(secret, dummy);
  return false;
}

/** Découpe une clé présentée en { prefix, secret }. Renvoie null si format invalide. */
export function parseApiKey(raw: string): { prefix: string; secret: string } | null {
  const m = /^(pk_(?:test|live)_[0-9a-f]{8})_([A-Za-z0-9_-]{20,})$/.exec(raw);
  if (!m) return null;
  return { prefix: m[1], secret: m[2] };
}
