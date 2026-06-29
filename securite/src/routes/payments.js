/**
 * routes/payments.js — Endpoint POST /v1/payments durci.
 *
 * Pile de middlewares :
 *   securityHeaders → corsAllowlist → requestId → requireJson → bodyLimit
 *   → requireApiKey(['payments:write'])
 *   → validate(PaymentSchema)
 *   → idempotent
 *   → handler (transaction SERIALIZABLE)
 *
 * Note : ce fichier exporte une factory pour bénéficier de l'injection de
 * dépendances (db, secrets, connectors) et faciliter les tests.
 */
const express = require('express');
const { z } = require('zod');
const { parsePhoneNumberWithError } = require('libphonenumber-js');
const { asyncHandler } = require('../middleware/security');
const { validate } = require('../middleware/validate');
const { requireApiKey } = require('../middleware/auth');
const { idempotent } = require('../middleware/idempotency');
const {
  randomUuid, deterministicHash, encryptField, maskPhone,
} = require('../lib/crypto');
const {
  createTransaction, transitionStatus, getById,
} = require('../models/transaction');
const { withRequest } = require('../lib/logger');

// =============================================================================
// Schémas Zod (strict — refuse les champs inconnus)
// =============================================================================

const CreatePaymentSchema = z.object({
  amount_cents: z.number().int().positive().max(500_000_000),  // ≤ 5 000 000 XAF
  currency: z.literal('XAF'),
  phone: z.string().min(8).max(20),
  external_id: z.string().regex(/^[A-Za-z0-9_\-]{1,64}$/).optional(),
  description: z.string().max(200).optional(),
}).strict();

// =============================================================================
// Factory
// =============================================================================

function createPaymentsRouter({ db, secrets, mtnConnector, kms, accounts }) {
  const router = express.Router();

  router.post(
    '/',
    requireApiKey(db, secrets, ['payments:write']),
    validate(CreatePaymentSchema),
    idempotent(db),
    asyncHandler(async (req, res) => {
      const log = withRequest(req);
      const { amount_cents, currency, phone, external_id, description } = req.body;
      const merchantId = req.merchant.id;

      // 1. Validation phone par libphonenumber (format Congo)
      let normalized;
      try {
        const parsed = parsePhoneNumberWithError(phone, 'CG');
        if (!parsed || !parsed.isValid()) throw new Error('invalid phone');
        normalized = parsed.number; // E.164
      } catch {
        return res.status(400).json({
          error: { code: 'invalid_phone', message: 'Numéro invalide pour le Congo.' },
        });
      }

      // 2. Détection de l'opérateur (MTN uniquement au MVP)
      const operator = detectOperator(normalized);
      if (operator !== 'MTN') {
        return res.status(400).json({
          error: { code: 'unsupported_operator',
                   message: 'Airtel sera supporté ultérieurement.' },
        });
      }

      // 3. Préparer les valeurs sensibles
      const payerPhoneEnc = await encryptField(normalized, kms);
      const payerPhoneHash = deterministicHash(normalized, secrets.deterministicHmacKey);
      const payerPhoneMask = maskPhone(normalized);

      const txId = randomUuid();
      const extId = external_id || randomUuid();

      // 4. Tout en une transaction SERIALIZABLE
      const client = await db.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        await createTransaction(client, {
          id: txId,
          merchantId,
          idempotencyKey: req.headers['idempotency-key'],
          externalId: extId,
          amountCents: String(amount_cents),
          currency,
          provider: 'mtn',
          payerPhoneEnc,
          payerPhoneHash,
          payerPhoneMask,
          description,
        });

        // Audit log (chaîné dans la même transaction)
        await writeAudit(client, {
          actorType: 'merchant',
          actorId: merchantId,
          action: 'payment.create',
          resourceType: 'transaction',
          resourceId: txId,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          requestId: req.id,
          afterState: { id: txId, status: 'pending', amount_cents, currency },
        });

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      // 5. Appel MTN (hors transaction DB)
      let providerRef;
      try {
        const callbackUrl = `${process.env.PUBLIC_BASE_URL}/v1/webhooks/mtn`;
        const r = await mtnConnector.requestToPay({
          amountCents: amount_cents,
          currency,
          payerPhone: normalized.replace('+', ''),
          externalId: extId,
          description,
          callbackUrl,
        });
        providerRef = r.referenceId;
      } catch (err) {
        // Si le call MTN échoue, on transitionne la tx vers failed (compensation Saga).
        const client2 = await db.connect();
        try {
          await client2.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
          await transitionStatus(client2, {
            transactionId: txId,
            expectedFrom: 'pending',
            to: 'failed',
            failureReason: err.publicCode || 'provider_error',
          });
          await client2.query('COMMIT');
        } catch (e2) {
          await client2.query('ROLLBACK').catch(() => {});
        } finally {
          client2.release();
        }
        log.warn({ tx_id: txId, error_code: err.code }, 'payment_provider_failed');
        return res.status(502).json({
          error: { code: 'provider_unavailable', request_id: req.id },
        });
      }

      // 6. Sauvegarder le provider_ref et passer en 'processing'
      const client3 = await db.connect();
      try {
        await client3.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        await transitionStatus(client3, {
          transactionId: txId,
          expectedFrom: 'pending',
          to: 'processing',
          providerRef,
        });
        await client3.query('COMMIT');
      } catch (err) {
        await client3.query('ROLLBACK').catch(() => {});
        log.error({ err, tx_id: txId }, 'failed_to_set_processing');
      } finally {
        client3.release();
      }

      log.info({ tx_id: txId, amount_cents, operator: 'MTN', payer_mask: payerPhoneMask },
               'payment_created');

      return res.status(202).json({
        id: txId,
        status: 'processing',
        amount_cents,
        currency,
        provider: 'mtn',
        provider_ref: providerRef,
        external_id: extId,
        payer_phone_mask: payerPhoneMask,
        created_at: new Date().toISOString(),
      });
    })
  );

  // ---------------------------------------------------------------------------
  // GET /v1/payments/:id
  // ---------------------------------------------------------------------------
  router.get(
    '/:id',
    requireApiKey(db, secrets, ['payments:read']),
    asyncHandler(async (req, res) => {
      if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
        return res.status(400).json({ error: { code: 'invalid_id' } });
      }
      const tx = await getById(db, { id: req.params.id, merchantId: req.merchant.id });
      if (!tx) return res.status(404).json({ error: { code: 'not_found' } });
      return res.json(tx);
    })
  );

  return router;
}

// =============================================================================
// Helpers
// =============================================================================

function detectOperator(e164) {
  // e164 = +242XXXXXXXXX
  const digits = e164.replace('+', '');
  if (!digits.startsWith('242')) return null;
  const prefix = digits.substring(3, 6);
  const MTN = ['066', '067', '068'];
  const AIRTEL = ['055', '056', '057', '058', '074', '075', '076', '077'];
  if (MTN.includes(prefix)) return 'MTN';
  if (AIRTEL.includes(prefix)) return 'AIRTEL';
  return null;
}

async function writeAudit(client, {
  actorType, actorId, action, resourceType, resourceId,
  ip, userAgent, requestId, beforeState, afterState,
}) {
  // Hash chain : récupère le dernier
  const last = await client.query(
    `SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1 FOR UPDATE`
  );
  const prevHash = last.rows[0] ? last.rows[0].hash : null;

  const { chainHash } = require('../lib/crypto');
  const payload = {
    actor_type: actorType, actor_id: actorId, action,
    resource_type: resourceType, resource_id: resourceId,
    ip, user_agent: userAgent, request_id: requestId,
    before_state: beforeState || null,
    after_state: afterState || null,
  };
  const hash = chainHash(prevHash, payload);

  await client.query(
    `INSERT INTO audit_log
       (actor_type, actor_id, action, resource_type, resource_id,
        ip, user_agent, request_id, before_state, after_state, prev_hash, hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [actorType, actorId, action, resourceType, resourceId,
     ip || null, userAgent || null, requestId || null,
     beforeState || null, afterState || null, prevHash, hash]
  );
}

module.exports = { createPaymentsRouter, writeAudit };
