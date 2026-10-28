import { createHmac, randomBytes } from 'crypto';

/**
 * TOTP (RFC 6238, HMAC-SHA1, 6 chiffres, pas de 30 s), compatible Google
 * Authenticator, Microsoft Authenticator, 1Password… Implémenté ici plutôt que
 * via une bibliothèque : quelques lignes, aucune dépendance, vecteurs de test RFC.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Secret TOTP invalide');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Secret de 160 bits (recommandation RFC 4226), encodé en base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Code à 6 chiffres pour un compteur de pas donné. */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totpStep(now = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

/**
 * Vérifie un code avec une tolérance d'un pas avant/après (décalage d'horloge).
 * Renvoie le pas reconnu (à mémoriser pour refuser un rejeu du même code), ou null.
 */
export function verifyTotp(secretBase32: string, code: string, now = Date.now()): number | null {
  const token = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(token)) return null;
  const secret = base32Decode(secretBase32);
  const current = totpStep(now);
  for (const step of [current, current - 1, current + 1]) {
    if (hotp(secret, step) === token) return step;
  }
  return null;
}

export function totpUri(secretBase32: string, account: string, issuer = 'AlphaPay Back-office'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}
