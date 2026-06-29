/**
 * middleware/webhook-verify.js — Vérification HMAC + anti-replay des webhooks.
 *
 * À monter AVANT express.json() pour conserver le body brut.
 * Usage :
 *   app.post('/v1/webhooks/mtn',
 *     express.raw({ type: 'application/json', limit: '32kb' }),
 *     verifyHmac({ secret: secrets.mtn.webhookSecret, skewSec: 300 }),
 *     dedupEvent(db, 'mtn'),
 *     handler,
 *   );
 */
const crypto = require('node:crypto');
const { safeEqual } = require('../lib/crypto');

/**
 * Vérification HMAC SHA-256.
 * Le payload signé est `${timestamp}.${rawBody}` (pattern Stripe).
 * Headers attendus :
 *   - X-Signature-256 : "sha256=<hex>"
 *   - X-Timestamp     : epoch seconds
 */
function verifyHmac({ secret, skewSec = 300 }) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('verifyHmac: secret is required');
  }

  return function verifyMiddleware(req, res, next) {
    try {
      const sigHeader = req.headers['x-signature-256'];
      const tsHeader = req.headers['x-timestamp'];

      if (!sigHeader || !tsHeader) {
        return res.status(401).end();
      }

      // Anti-replay : timestamp dans une fenêtre ±skew
      const ts = parseInt(tsHeader, 10);
      if (!Number.isFinite(ts)) return res.status(401).end();
      const ageSec = Math.abs(Math.floor(Date.now() / 1000) - ts);
      if (ageSec > skewSec) return res.status(401).end();

      // Le body doit être un Buffer (raw)
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(JSON.stringify(req.body));

      const signed = Buffer.concat([
        Buffer.from(String(ts), 'utf8'),
        Buffer.from('.', 'utf8'),
        rawBody,
      ]);

      const expected = crypto
        .createHmac('sha256', secret)
        .update(signed)
        .digest();

      const providedHex = String(sigHeader).replace(/^sha256=/, '');
      // Validation format hex (longueur paire, hex chars)
      if (!/^[0-9a-f]+$/i.test(providedHex) || providedHex.length !== expected.length * 2) {
        return res.status(401).end();
      }
      const provided = Buffer.from(providedHex, 'hex');

      if (!safeEqual(expected, provided)) {
        return res.status(401).end();
      }

      // Parse JSON en sécurité pour les middlewares suivants
      try {
        req.event = JSON.parse(rawBody.toString('utf8'));
        req.rawBody = rawBody;
        req.eventTimestamp = ts;
      } catch {
        return res.status(400).end();
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Déduplication par provider_event_id (anti-replay au-delà de la fenêtre temporelle).
 * Exige un identifiant d'événement dans le payload (ex. `eventId`, `id` ou `referenceId`).
 */
function dedupEvent(db, provider, extractEventId) {
  if (!extractEventId) {
    // Par défaut : prend ce qui ressemble à un identifiant
    extractEventId = (e) => e.eventId || e.event_id || e.id || e.referenceId;
  }
  return async function dedupMiddleware(req, res, next) {
    try {
      const eventId = extractEventId(req.event);
      if (!eventId) return res.status(400).end();

      const ins = await db.query(
        `INSERT INTO webhook_events_inbound
           (provider, provider_event_id, signature_hex, timestamp_header, raw_body, status)
         VALUES ($1, $2, $3, $4, $5, 'received')
         ON CONFLICT (provider, provider_event_id) DO NOTHING
         RETURNING id`,
        [
          provider,
          String(eventId),
          String(req.headers['x-signature-256']).replace(/^sha256=/, ''),
          req.eventTimestamp,
          req.event,
        ]
      );

      if (ins.rows.length === 0) {
        // Déjà reçu — on ACK 200 pour éviter les retries inutiles
        return res.status(200).json({ duplicate: true });
      }

      req.webhookRecordId = ins.rows[0].id;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { verifyHmac, dedupEvent };
