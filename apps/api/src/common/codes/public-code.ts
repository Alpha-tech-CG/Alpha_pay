import { randomInt } from 'crypto';

// Codes publics (QR de caisse, liens de paiement) : sans caractères ambigus (0/O, 1/l/I).
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function newPublicCode(length = 8): string {
  return Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

/** URL publique de la page hébergée : `/l/<code>` (lien) ou `/c/<code>` (caisse). */
export function checkoutUrl(kind: 'l' | 'c', code: string): string {
  const base = process.env.CHECKOUT_URL ?? process.env.PUBLIC_API_URL ?? 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/${kind}/${code}`;
}
