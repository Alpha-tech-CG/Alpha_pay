/**
 * models/transaction.js — Accès aux transactions avec machine d'état stricte.
 *
 * Toute écriture passe par les fonctions de ce module, jamais en SQL inline.
 * La machine d'état refuse les transitions illégales.
 */
const { Pool } = require('pg');

/**
 * Machine d'état : transitions autorisées.
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  pending:    new Set(['processing', 'cancelled', 'failed']),
  processing: new Set(['succeeded', 'failed']),
  succeeded:  new Set(['refunded']),
  failed:     new Set([]),
  cancelled:  new Set([]),
  refunded:   new Set([]),
});

function assertValidTransition(current, next) {
  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed || !allowed.has(next)) {
    const err = new Error(`Illegal transition ${current} → ${next}`);
    err.code = 'illegal_transition';
    err.status = 409;
    err.publicCode = 'illegal_state_transition';
    throw err;
  }
}

/**
 * Construit un Pool TLS-only.
 */
function buildPool(databaseUrl) {
  const ssl = process.env.NODE_ENV === 'development'
    ? false
    : { rejectUnauthorized: true };
  return new Pool({ connectionString: databaseUrl, ssl, max: 20 });
}

/**
 * Insère une transaction en pending — appelé depuis l'orchestrateur.
 */
async function createTransaction(client, {
  id, merchantId, idempotencyKey, externalId,
  amountCents, currency, provider,
  payerPhoneEnc, payerPhoneHash, payerPhoneMask,
  description,
}) {
  const r = await client.query(
    `INSERT INTO transactions
       (id, merchant_id, idempotency_key, external_id, amount_cents, currency,
        provider, payer_phone_enc, payer_phone_hash, payer_phone_mask, description, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
     RETURNING *`,
    [id, merchantId, idempotencyKey, externalId, amountCents, currency, provider,
     payerPhoneEnc, payerPhoneHash, payerPhoneMask, description || null]
  );
  return r.rows[0];
}

/**
 * Transition d'état avec verrouillage + version (optimistic + pessimistic).
 * Doit être appelée à l'intérieur d'une transaction SERIALIZABLE.
 */
async function transitionStatus(client, { transactionId, expectedFrom, to, providerRef, failureReason }) {
  // 1. Verrou pessimiste
  const cur = await client.query(
    `SELECT id, status, version FROM transactions WHERE id = $1 FOR UPDATE`,
    [transactionId]
  );
  if (cur.rows.length === 0) {
    const err = new Error('transaction not found');
    err.status = 404; err.publicCode = 'not_found';
    throw err;
  }
  const tx = cur.rows[0];

  // 2. Machine d'état
  if (expectedFrom && tx.status !== expectedFrom) {
    const err = new Error(`Expected status ${expectedFrom}, got ${tx.status}`);
    err.status = 409; err.publicCode = 'unexpected_state';
    throw err;
  }
  assertValidTransition(tx.status, to);

  // 3. Update avec incrément de version
  const succeededAt = to === 'succeeded' ? 'NOW()' : 'NULL';
  const failedAt = to === 'failed' ? 'NOW()' : 'NULL';

  const r = await client.query(
    `UPDATE transactions
       SET status = $1,
           failure_reason = COALESCE($2, failure_reason),
           provider_ref = COALESCE($3, provider_ref),
           succeeded_at = CASE WHEN $1 = 'succeeded' THEN NOW() ELSE succeeded_at END,
           failed_at = CASE WHEN $1 = 'failed' THEN NOW() ELSE failed_at END,
           version = version + 1,
           updated_at = NOW()
     WHERE id = $4 AND version = $5
     RETURNING *`,
    [to, failureReason || null, providerRef || null, transactionId, tx.version]
  );

  if (r.rows.length === 0) {
    // version a changé entre SELECT et UPDATE (très rare en SERIALIZABLE)
    const err = new Error('concurrent modification');
    err.status = 409; err.publicCode = 'concurrent_modification';
    throw err;
  }

  return r.rows[0];
}

/**
 * Récupération d'une transaction (lecture seule).
 * Ne renvoie PAS le numéro chiffré sauf besoin explicite.
 */
async function getById(client, { id, merchantId }) {
  const r = await client.query(
    `SELECT id, merchant_id, idempotency_key, external_id, amount_cents,
            currency, status, provider, provider_ref, payer_phone_mask,
            description, failure_reason, created_at, updated_at,
            succeeded_at, failed_at
     FROM transactions
     WHERE id = $1 AND merchant_id = $2`,
    [id, merchantId]
  );
  return r.rows[0] || null;
}

/**
 * Recherche par provider_ref (utilisé par le webhook).
 * Renvoie aussi merchant_id pour permettre les vérifications.
 */
async function findByProviderRef(client, { provider, providerRef }) {
  const r = await client.query(
    `SELECT id, merchant_id, status, version
     FROM transactions
     WHERE provider = $1 AND provider_ref = $2`,
    [provider, providerRef]
  );
  return r.rows[0] || null;
}

module.exports = {
  buildPool,
  createTransaction,
  transitionStatus,
  getById,
  findByProviderRef,
  ALLOWED_TRANSITIONS,
  assertValidTransition,
};
