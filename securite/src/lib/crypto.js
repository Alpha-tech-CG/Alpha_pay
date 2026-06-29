/**
 * lib/crypto.js — Primitives cryptographiques sécurisées
 *
 * Règles dans ce fichier :
 *   - Argon2id pour hash (clés API, mots de passe)
 *   - HMAC-SHA-256 pour hash recherchable
 *   - AES-256-GCM (envelope) pour chiffrement PII
 *   - timingSafeEqual obligatoire pour toute comparaison sensible
 *   - Aucune clé en clair en mémoire au-delà du strict minimum
 */
const crypto = require('node:crypto');
const argon2 = require('argon2');

// =============================================================================
// Argon2id — pour clés API et mots de passe
// =============================================================================

const ARGON2_PARAMS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 64 * 1024,   // 64 MiB
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
});

/**
 * Hash une valeur sensible avec Argon2id.
 * Le pepper (charge applicative) est concaténé avant hash pour qu'une fuite
 * de DB seule ne suffise pas à attaquer hors-ligne.
 */
async function hashSecret(plaintext, pepper) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new TypeError('hashSecret: plaintext must be non-empty string');
  }
  if (typeof pepper !== 'string' || pepper.length < 32) {
    throw new TypeError('hashSecret: pepper must be ≥32 char string');
  }
  return argon2.hash(plaintext + pepper, ARGON2_PARAMS);
}

/**
 * Vérifie une valeur contre son hash Argon2.
 * Argon2 est intrinsèquement timing-safe.
 */
async function verifySecret(hash, plaintext, pepper) {
  if (typeof hash !== 'string' || !hash.startsWith('$argon2id$')) return false;
  try {
    return await argon2.verify(hash, plaintext + pepper);
  } catch {
    return false;
  }
}

// =============================================================================
// HMAC-SHA-256 — pour hash déterministe recherchable
// =============================================================================

/**
 * Hash déterministe pour permettre la recherche en SQL sans exposer la valeur.
 * Utiliser pour : email_hash, payer_phone_hash, etc.
 */
function deterministicHash(value, key) {
  if (!Buffer.isBuffer(key) || key.length < 32) {
    throw new TypeError('deterministicHash: key must be ≥32-byte Buffer');
  }
  return crypto.createHmac('sha256', key).update(String(value), 'utf8').digest();
}

// =============================================================================
// Comparaison à temps constant — OBLIGATOIRE pour tout secret/HMAC
// =============================================================================

/**
 * Comparaison à temps constant. Renvoie false si les longueurs diffèrent
 * (sans révéler la longueur exacte par timing).
 */
function safeEqual(a, b) {
  const ba = Buffer.isBuffer(a) ? a : Buffer.from(String(a), 'utf8');
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) {
    // Comparer quand même à une longueur fixe pour ne pas révéler la longueur
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

// =============================================================================
// Génération aléatoire — JAMAIS Math.random
// =============================================================================

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function randomUuid() {
  return crypto.randomUUID();
}

// =============================================================================
// AES-256-GCM — chiffrement de champs sensibles (envelope encryption)
// =============================================================================
//
// Format binaire de sortie :
//   version (1) || iv (12) || encDekLen (1) || encDek (encDekLen)
//   || tag (16) || ciphertext (..)
//
// Le KMS (AWS KMS / HashiCorp Vault) chiffre la DEK ;
// la rotation du KEK ne nécessite donc PAS de rechiffrer toute la base.

const VERSION = 0x01;
const IV_LEN = 12;
const TAG_LEN = 16;
const ALGO = 'aes-256-gcm';

/**
 * @param {Buffer|string} plaintext
 * @param {{encrypt: (dek: Buffer) => Promise<Buffer>}} kms
 */
async function encryptField(plaintext, kms) {
  const pt = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, dek, iv);
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encDek = await kms.encrypt(dek);
  if (encDek.length > 255) {
    throw new Error('encryptField: encDek longer than 255 bytes is not supported by this format');
  }
  // best effort wipe (Node ne garantit pas)
  dek.fill(0);

  return Buffer.concat([
    Buffer.from([VERSION]),
    iv,
    Buffer.from([encDek.length]),
    encDek,
    tag,
    ct,
  ]);
}

/**
 * @param {Buffer} blob
 * @param {{decrypt: (encDek: Buffer) => Promise<Buffer>}} kms
 */
async function decryptField(blob, kms) {
  if (!Buffer.isBuffer(blob) || blob.length < 1 + IV_LEN + 1 + TAG_LEN) {
    throw new Error('decryptField: invalid blob');
  }
  if (blob[0] !== VERSION) throw new Error(`decryptField: unsupported version ${blob[0]}`);

  let off = 1;
  const iv = blob.subarray(off, off + IV_LEN); off += IV_LEN;
  const encDekLen = blob[off]; off += 1;
  const encDek = blob.subarray(off, off + encDekLen); off += encDekLen;
  const tag = blob.subarray(off, off + TAG_LEN); off += TAG_LEN;
  const ct = blob.subarray(off);

  const dek = await kms.decrypt(encDek);
  const decipher = crypto.createDecipheriv(ALGO, dek, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  dek.fill(0);
  return pt;
}

// =============================================================================
// Génération de clés API marchand
// =============================================================================

/**
 * Format clé : pk_live_<8 hex prefix>_<32 random base64url>
 * Renvoie { full, prefix, secret } — full doit être renvoyé UNE SEULE FOIS au marchand.
 */
function generateApiKey(mode = 'live') {
  if (!['live', 'test'].includes(mode)) {
    throw new Error('generateApiKey: mode must be live|test');
  }
  const prefixId = crypto.randomBytes(4).toString('hex');
  const secret = randomToken(32);
  const prefix = `pk_${mode}_${prefixId}`;
  const full = `${prefix}_${secret}`;
  return { full, prefix, secret };
}

/**
 * Parse une clé API présentée par un client.
 * Renvoie null si format invalide.
 */
function parseApiKey(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^(pk_(?:live|test)_[0-9a-f]{8})_([A-Za-z0-9_-]{32,})$/);
  if (!m) return null;
  return { prefix: m[1], secret: m[2] };
}

// =============================================================================
// Hash de chaînage pour ledger / audit log
// =============================================================================

/**
 * @param {Buffer|null} prevHash hash de l'entrée précédente (null pour la 1re)
 * @param {object} entry payload canonique de l'écriture
 */
function chainHash(prevHash, entry) {
  // Canonicalisation : tri des clés pour stabilité
  const json = JSON.stringify(entry, Object.keys(entry).sort());
  const h = crypto.createHash('sha256');
  if (prevHash) h.update(prevHash);
  h.update(json, 'utf8');
  return h.digest();
}

// =============================================================================
// Masquage PII pour affichage et logs
// =============================================================================

function maskPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 7) return '***';
  return digits.slice(0, 3) + '*'.repeat(digits.length - 7) + digits.slice(-4);
}

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '***';
  const safeLocal = local.length <= 2 ? '**' : local.slice(0, 2) + '***';
  return `${safeLocal}@${domain}`;
}

module.exports = {
  hashSecret,
  verifySecret,
  deterministicHash,
  safeEqual,
  randomToken,
  randomUuid,
  encryptField,
  decryptField,
  generateApiKey,
  parseApiKey,
  chainHash,
  maskPhone,
  maskEmail,
};
