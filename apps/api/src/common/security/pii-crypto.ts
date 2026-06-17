import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

/**
 * Chiffrement des PII au niveau colonne (ALP-164) — envelope encryption.
 *
 * Une DEK (clé de données) aléatoire par valeur chiffre le clair en AES-256-GCM ;
 * la DEK est elle-même chiffrée (wrap) par la KEK. En dev la KEK vient de
 * PII_ENCRYPTION_KEY ; en prod, remplacer wrap/unwrap par AWS KMS (le format
 * binaire le permet sans rechiffrer les données — rotation de KEK sûre).
 *
 * Format : version(1) | iv2(12) | tag2(16) | encDek(32) | iv1(12) | tag1(16) | ciphertext
 */
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
  // KEK de dev déterministe (non destinée à la prod).
  return Buffer.alloc(32, 7);
}

function getSearchKey(): Buffer {
  // Clé HMAC pour le hash déterministe recherchable (dérivée de la KEK).
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

export function decryptField(blob: Buffer): string {
  if (blob[0] !== VERSION) throw new Error(`pii-crypto: version inconnue ${blob[0]}`);
  let off = 1;
  const iv2 = blob.subarray(off, off + 12); off += 12;
  const tag2 = blob.subarray(off, off + 16); off += 16;
  const encDek = blob.subarray(off, off + 32); off += 32;
  const iv1 = blob.subarray(off, off + 12); off += 12;
  const tag1 = blob.subarray(off, off + 16); off += 16;
  const ct = blob.subarray(off);

  const d2 = createDecipheriv(ALGO, getKek(), iv2);
  d2.setAuthTag(tag2);
  const dek = Buffer.concat([d2.update(encDek), d2.final()]);

  const d1 = createDecipheriv(ALGO, dek, iv1);
  d1.setAuthTag(tag1);
  const pt = Buffer.concat([d1.update(ct), d1.final()]).toString('utf8');
  dek.fill(0);
  return pt;
}

/** Hash déterministe (HMAC) pour rechercher sans exposer la valeur. */
export function deterministicHash(value: string): Buffer {
  return createHmac('sha256', getSearchKey()).update(value, 'utf8').digest();
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length < 7) return '***';
  return d.slice(0, 3) + '*'.repeat(d.length - 7) + d.slice(-4);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const safe = local.length <= 2 ? '**' : local.slice(0, 2) + '***';
  return `${safe}@${domain}`;
}
