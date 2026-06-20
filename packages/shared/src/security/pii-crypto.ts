import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const VERSION = 0x01;
const ALGO = 'aes-256-gcm';

function getKek(): Buffer {
  const b64 = process.env.PII_ENCRYPTION_KEY;
  if (b64) {
    const key = Buffer.from(b64, 'base64');
    if (key.length === 32) return key;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PII_ENCRYPTION_KEY (base64 32 octets) requis en production');
  }
  return Buffer.alloc(32, 7);
}

function getSearchKey(): Buffer {
  return createHmac('sha256', getKek()).update('pii-search-key').digest();
}

export function encryptField(plaintext: string): Buffer {
  const kek = getKek();
  const dek = randomBytes(32);
  const iv1 = randomBytes(12);
  const c1 = createCipheriv(ALGO, dek, iv1);
  const ct = Buffer.concat([c1.update(plaintext, 'utf8'), c1.final()]);
  const tag1 = c1.getAuthTag();
  const iv2 = randomBytes(12);
  const c2 = createCipheriv(ALGO, kek, iv2);
  const encDek = Buffer.concat([c2.update(dek), c2.final()]);
  const tag2 = c2.getAuthTag();

  dek.fill(0);
  return Buffer.concat([Buffer.from([VERSION]), iv2, tag2, encDek, iv1, tag1, ct]);
}

export function decryptField(blob: Uint8Array): string {
  const data = Buffer.from(blob);
  if (data[0] !== VERSION) throw new Error(`pii-crypto: version inconnue ${data[0]}`);
  let off = 1;
  const iv2 = data.subarray(off, off + 12); off += 12;
  const tag2 = data.subarray(off, off + 16); off += 16;
  const encDek = data.subarray(off, off + 32); off += 32;
  const iv1 = data.subarray(off, off + 12); off += 12;
  const tag1 = data.subarray(off, off + 16); off += 16;
  const ct = data.subarray(off);
  const d2 = createDecipheriv(ALGO, getKek(), iv2);
  d2.setAuthTag(tag2);
  const dek = Buffer.concat([d2.update(encDek), d2.final()]);
  const d1 = createDecipheriv(ALGO, dek, iv1);
  d1.setAuthTag(tag1);
  const plaintext = Buffer.concat([d1.update(ct), d1.final()]).toString('utf8');

  dek.fill(0);
  return plaintext;
}

export function deterministicHash(value: string): Buffer {
  return createHmac('sha256', getSearchKey()).update(value, 'utf8').digest();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '***';
  return digits.slice(0, 3) + '*'.repeat(digits.length - 7) + digits.slice(-4);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const safe = local.length <= 2 ? '**' : local.slice(0, 2) + '***';
  return `${safe}@${domain}`;
}
