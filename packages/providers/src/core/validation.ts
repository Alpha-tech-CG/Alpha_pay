import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { currencyDecimals, isSupportedCurrency } from '@paybrain/shared';
import { ProviderError } from './errors';

const E164 = /^\+[1-9]\d{7,14}$/;

export function assertE164(provider: string, phone: string, field = 'phone'): void {
  if (typeof phone !== 'string' || !E164.test(phone)) {
    throw new ProviderError('invalid_request', `${field} doit être au format E.164`, { provider });
  }
}

/** Numéro E.164 sans le « + » (format MSISDN attendu par les opérateurs). */
export function toMsisdn(phone: string): string {
  return phone.slice(1);
}

/** Montant entier en unités mineures (D-007), strictement positif. */
export function assertAmount(provider: string, amount: number, currency: string): void {
  if (!isSupportedCurrency(currency)) {
    throw new ProviderError('invalid_request', `Devise non supportée : ${currency}`, { provider });
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new ProviderError('invalid_request', 'Le montant doit être un entier strictement positif (unités mineures)', { provider });
  }
}

/** Unités mineures → chaîne en unités majeures : XAF 15000 → "15000", EUR 150 → "1.50". */
export function toMajorString(amountMinor: number, currency: string): string {
  const decimals = currencyDecimals(currency);
  if (decimals === 0) return String(amountMinor);
  const factor = 10 ** decimals;
  const major = Math.floor(amountMinor / factor);
  const minor = String(amountMinor % factor).padStart(decimals, '0');
  return `${major}.${minor}`;
}

/**
 * Identifiant UUID (format v4-compatible) dérivé de manière déterministe d'une
 * référence AlphaPay. Rejouer la même demande après une coupure réseau produit
 * le même identifiant chez l'opérateur, qui la refuse comme doublon au lieu
 * de débiter deux fois le client (§M3 : ni doublon ni paiement bloqué).
 */
export function deterministicUuid(namespace: string, reference: string): string {
  const h = createHash('sha256').update(`${namespace}:${reference}`).digest();
  h[6] = (h[6] & 0x0f) | 0x40;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Comparaison de chaînes en temps constant (signatures). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  const v = key ? headers[key] : undefined;
  return Array.isArray(v) ? v[0] : v;
}
