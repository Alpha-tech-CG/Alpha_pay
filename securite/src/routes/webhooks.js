/**
 * routes/webhooks.js — Endpoint POST /v1/webhooks/mtn durci.
 *
 * Sécurité :
 *   - express.raw() conservé pour HMAC
 *   - verifyHmac (timingSafeEqual + skew temporel)
 *   - dedupEvent (idempotence par provider_event_id)
 *   - traitement en transaction SERIALIZABLE
 *   - machine d'état stricte côté transactions
 *   - jamais 200 si vérif échoue
 */
const express = require('express');
const { verifyHmac, dedupEvent } = require('../middleware/webhook-verify');
const { asyncHandler } = require('../middleware/security');
const { findByProviderRef, transitionStatus } = require('../models/transaction');
const { postEntries, paymentCollectionEntries } = require('../lib/ledger');
const { writeAudit } = require('./payments');
const { withRequest } = require('../lib/logger');

function createWebhooksRouter({ db, secrets, accounts, broadcast }) {
  const router = express.Router();

  router.post(
    '/mtn',
    // body brut requis pour HMAC
    express.raw({ type: 'application/json', limit: '32kb' }),
    verifyHmac({ secret: secrets.mtn.webhookSecret, skewSec: 300 }),
    dedupEvent(db, 'mtn', (e) => e.referenceId || e.financialTransactionId || e.externalId),
    asyncHandler(async (req, res) => {
      const log = withRequest(req);
      const event = req.event;
      const { status, externalId, financialTransactionId, reason, referenceId } = event;

      // Statut MTN normalisé
      const normalized = mapMtnStatus(status);
      if (!normalized) {
        log.warn({ status }, 'webhook_unknown_status');
        return res.status(400).end();
      }

      // Lookup transaction interne par provider_ref
      const providerRef = referenceId || financialTransactionId;
      const tx = await findByProviderRef(db, { provider: 'mtn', providerRef });
      if (!tx) {
        log.warn({ provider_ref: providerRef }, 'webhook_tx_not_found');
        // 200 quand même pour ne pas faire boucler MTN sur une tx fantôme
        return res.status(200).end();
      }

      // Traitement transactionnel
      const client = await db.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 1. Transition d'état (refuse si illégale)
        try {
          await transitionStatus(client, {
            transactionId: tx.id,
            expectedFrom: tx.status,
            to: normalized,
            failureReason: normalized === 'failed' ? sanitize(reason, 200) : null,
          });
        } catch (err) {
          if (err.publicCode === 'illegal_state_transition') {
            log.warn({
              tx_id: tx.id, from: tx.status, to: normalized,
            }, 'webhook_illegal_transition');
            // On marque l'événement comme traité (rien à faire)
            await markEventProcessed(client, req.webhookRecordId);
            await client.query('COMMIT');
            return res.status(200).end();
          }
          throw err;
        }

        // 2. Écritures comptables si succès
        if (normalized === 'succeeded') {
          const fee = computeFee(tx);  // calcul de commission
          const entries = paymentCollectionEntries({
            transactionId: tx.id,
            merchantAccountId: await accounts.getMerchantAccount(client, tx.merchant_id),
            operatorAccountId: await accounts.getOperatorAccount(client, 'mtn'),
            feeAccountId: await accounts.getFeeAccount(client),
            amount: tx.amount_cents || tx.amount,
            fee,
            currency: tx.currency || 'XAF',
          });
          await postEntries({ client, transactionId: tx.id, entries });
        }

        // 3. Marquer event traité
        await markEventProcessed(client, req.webhookRecordId);

        // 4. Audit
        await writeAudit(client, {
          actorType: 'provider',
          actorId: null,
          action: `webhook.${normalized}`,
          resourceType: 'transaction',
          resourceId: tx.id,
          requestId: req.id,
          afterState: { status: normalized, provider_ref: providerRef },
        });

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        log.error({ err, tx_id: tx.id }, 'webhook_processing_failed');
        // 500 pour que MTN réessaie
        return res.status(500).end();
      } finally {
        client.release();
      }

      // 5. Broadcast WebSocket (best effort)
      if (broadcast) {
        try {
          broadcast('transaction_update', {
            id: tx.id, status: normalized, payer_mask: tx.payer_phone_mask,
          });
        } catch { /* ignore */ }
      }

      log.info({ tx_id: tx.id, status: normalized }, 'webhook_processed');
      return res.status(200).end();
    })
  );

  return router;
}

function mapMtnStatus(s) {
  switch (s) {
    case 'SUCCESSFUL': return 'succeeded';
    case 'FAILED':     return 'failed';
    case 'REJECTED':   return 'failed';
    case 'PENDING':    return null; // on garde l'état actuel
    default:           return null;
  }
}

function computeFee(tx) {
  // Exemple : 2 % du montant, plafonné à 5 000 XAF (500 000 centimes)
  const amount = BigInt(tx.amount_cents || tx.amount);
  const calc = (amount * 2n) / 100n;
  const cap = 500_000n;
  return calc > cap ? cap : calc;
}

function sanitize(str, max) {
  if (!str) return null;
  return String(str).replace(/[\x00-\x1F]/g, '').slice(0, max);
}

async function markEventProcessed(client, id) {
  await client.query(
    `UPDATE webhook_events_inbound
       SET status = 'processed', processed_at = NOW()
     WHERE id = $1`,
    [id]
  );
}

module.exports = { createWebhooksRouter };
