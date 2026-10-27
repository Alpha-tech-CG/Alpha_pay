import { decryptField, encryptField } from '../../common/security/pii-crypto';

/**
 * Clé maîtresse des identifiants opérateur (§4.3) : distincte de la clé PII,
 * fournie par l'environnement, jamais stockée en base.
 */
function credentialsKey(): Buffer {
  const b64 = process.env.PROVIDER_CREDENTIALS_KEY;
  if (b64) {
    const key = Buffer.from(b64, 'base64');
    if (key.length === 32) return key;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PROVIDER_CREDENTIALS_KEY (base64 32 octets) requis en production');
  }
  return Buffer.alloc(32, 11);
}

export function encryptCredentials(credentials: Record<string, string>): Uint8Array<ArrayBuffer> {
  return new Uint8Array(encryptField(JSON.stringify(credentials), credentialsKey()));
}

export function decryptCredentials(blob: Uint8Array): Record<string, string> {
  return JSON.parse(decryptField(blob, credentialsKey())) as Record<string, string>;
}
