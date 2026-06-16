const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function saveTransaction({ merchantId, mtnReferenceId, externalId, amount, currency, payerPhone, payerMessage }) {
  const result = await pool.query(
    `INSERT INTO transactions
       (merchant_id, mtn_reference_id, external_id, amount, currency, payer_phone, payer_message, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
     RETURNING *`,
    [merchantId || null, mtnReferenceId, externalId, amount, currency, payerPhone, payerMessage || null]
  );
  return result.rows[0];
}

async function updateTransactionStatus(mtnReferenceId, status, failureReason) {
  const result = await pool.query(
    `UPDATE transactions
     SET status = $1, failure_reason = $2, updated_at = NOW()
     WHERE mtn_reference_id = $3
     RETURNING *`,
    [status, failureReason || null, mtnReferenceId]
  );
  return result.rows[0];
}

async function updateTransactionByExternalId(externalId, status, failureReason) {
  const result = await pool.query(
    `UPDATE transactions
     SET status = $1, failure_reason = $2, updated_at = NOW()
     WHERE external_id = $3
     RETURNING *`,
    [status, failureReason || null, externalId]
  );
  return result.rows[0];
}

async function getTransactionByRef(mtnReferenceId) {
  const result = await pool.query(
    'SELECT * FROM transactions WHERE mtn_reference_id = $1',
    [mtnReferenceId]
  );
  return result.rows[0] || null;
}

async function saveWebhookLog(mtnReferenceId, rawPayload) {
  // Requête non-préparée pour éviter le cache de type PostgreSQL après ALTER TABLE
  await pool.query({
    text: 'INSERT INTO webhooks_log (mtn_reference_id, raw_payload) VALUES ($1::text, $2::jsonb)',
    values: [mtnReferenceId || null, JSON.stringify(rawPayload)],
  });
}

module.exports = { saveTransaction, updateTransactionStatus, updateTransactionByExternalId, getTransactionByRef, saveWebhookLog, pool };
