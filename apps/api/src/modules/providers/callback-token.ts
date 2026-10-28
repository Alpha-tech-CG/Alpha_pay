import { createHmac } from 'crypto';
import { safeEqual } from '@paybrain/providers';

/**
 * Jeton des URL de callback opérateur (D-041). MTN et Airtel ne signent pas
 * leurs callbacks : chaque connexion marchand reçoit une URL secrète
 * `/webhooks/operators/:operator/:connectionId/:token`, où le jeton est dérivé
 * (HMAC) du secret serveur et de l'id de connexion — rien à stocker, et un
 * jeton ne vaut que pour sa connexion. Le statut annoncé n'est jamais cru :
 * il déclenche une lecture auprès de l'opérateur (D-021).
 */
function secret(): string {
  const s = process.env.CALLBACK_SIGNING_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('CALLBACK_SIGNING_SECRET (≥32 caractères) requis en production');
  return 'dev-only-callback-secret-not-for-production-00';
}

/**
 * Jeton de suivi d'un paiement par la page hébergée (T-53) : seul le navigateur
 * qui a lancé le paiement peut en lire le statut.
 */
export function checkoutToken(transactionId: string): string {
  return createHmac('sha256', secret()).update(`checkout:${transactionId}`).digest('base64url');
}

export function isValidCheckoutToken(transactionId: string, token: unknown): boolean {
  return typeof token === 'string' && token.length > 0 && safeEqual(token, checkoutToken(transactionId));
}

/**
 * URL signée et temporaire d'un fichier (§M2) : `/v1/files/:id?expires=…&sig=…`.
 * Rien à stocker ; une URL ne vaut que pour ce fichier et jusqu'à son expiration.
 */
export function signedFileUrl(fileId: string, ttlSeconds = 300, now = Date.now()): { url: string; expiresAt: Date } {
  const expires = Math.floor(now / 1000) + ttlSeconds;
  const sig = createHmac('sha256', secret()).update(`file:${fileId}:${expires}`).digest('base64url');
  const base = (process.env.PUBLIC_API_URL ?? '').replace(/\/$/, '');
  return { url: `${base}/v1/files/${fileId}?expires=${expires}&sig=${sig}`, expiresAt: new Date(expires * 1000) };
}

export function isValidFileSignature(fileId: string, expires: unknown, sig: unknown, now = Date.now()): boolean {
  const exp = Number(expires);
  if (!Number.isInteger(exp) || exp < Math.floor(now / 1000) || typeof sig !== 'string' || !sig) return false;
  return safeEqual(sig, createHmac('sha256', secret()).update(`file:${fileId}:${exp}`).digest('base64url'));
}

export function callbackToken(connectionId: string): string {
  return createHmac('sha256', secret()).update(`operator-callback:${connectionId}`).digest('base64url');
}

export function isValidCallbackToken(connectionId: string, token: string): boolean {
  return typeof token === 'string' && token.length > 0 && safeEqual(token, callbackToken(connectionId));
}

export function callbackUrl(operator: string, connectionId: string): string | undefined {
  const base = process.env.PUBLIC_API_URL;
  if (!base) return undefined;
  return `${base.replace(/\/$/, '')}/webhooks/operators/${operator.toLowerCase()}/${connectionId}/${callbackToken(connectionId)}`;
}
