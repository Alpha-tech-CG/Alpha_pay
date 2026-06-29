/**
 * middleware/idempotency.js — Garantit qu'une requête mutante peut être rejouée
 * sans effet secondaire.
 *
 * Header `Idempotency-Key` obligatoire (UUID v4 recommandé).
 *
 * Comportement :
 *   - Première requête : verrouille + exécute + stocke réponse + déverrouille
 *   - Rejouée avec même hash de body : renvoie réponse mémorisée
 *   - Rejouée avec body différent : 422 idempotency_collision
 *   - Rejouée pendant qu'une autre est en cours : 409 in_progress
 *
 * Stockage : table `idempotency_records` (TTL 24h).
 */
const crypto = require('node:crypto');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCK_MS = 30_000;
const TTL_HOURS = 24;

/**
 * Hash canonique du body (clés triées, JSON stable).
 */
function hashCanonical(body) {
  const canonical = stableStringify(body || {});
  return crypto.createHash('sha256').update(canonical, 'utf8').digest();
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

/**
 * @param {Pool} db
 */
function idempotent(db) {
  return async function idempotencyMiddleware(req, res, next) {
    try {
      const key = req.headers['idempotency-key'];
      if (!key || !UUID_RE.test(key)) {
        return res.status(400).json({
          error: { code: 'idempotency_key_required',
                   message: 'Header Idempotency-Key (UUID v4) is required.' },
        });
      }

      const merchantId = req.merchant.id;
      const endpoint = `${req.method} ${req.route ? req.route.path : req.path}`;
      const reqHash = hashCanonical(req.body);

      // 1. Tentative d'insertion (atomique grâce à UNIQUE)
      const ins = await db.query(
        `INSERT INTO idempotency_records
           (merchant_id, idempotency_key, endpoint, request_hash, locked_until, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 millisecond'), NOW() + ($6 * INTERVAL '1 hour'))
         ON CONFLICT (merchant_id, idempotency_key, endpoint) DO NOTHING
         RETURNING id`,
        [merchantId, key, endpoint, reqHash, LOCK_MS, TTL_HOURS]
      );

      if (ins.rows.length) {
        // C'est une première requête ; on l'exécute en interceptant la réponse
        const recordId = ins.rows[0].id;
        interceptResponse(res, async (status, body) => {
          await db.query(
            `UPDATE idempotency_records
             SET response_status = $1, response_body = $2, locked_until = NULL
             WHERE id = $3`,
            [status, body, recordId]
          );
        });
        return next();
      }

      // 2. Conflit : on lit la ligne existante
      const existing = await db.query(
        `SELECT request_hash, response_status, response_body, locked_until
         FROM idempotency_records
         WHERE merchant_id = $1 AND idempotency_key = $2 AND endpoint = $3`,
        [merchantId, key, endpoint]
      );
      const row = existing.rows[0];

      // 2a. Hash de body différent => l'utilisateur réutilise la clé pour autre chose
      if (!row.request_hash.equals(reqHash)) {
        return res.status(422).json({
          error: { code: 'idempotency_collision',
                   message: 'Idempotency-Key reused with different request body.' },
        });
      }

      // 2b. Encore en cours d'exécution
      if (row.locked_until && new Date(row.locked_until) > new Date()) {
        return res.status(409).json({
          error: { code: 'request_in_progress',
                   message: 'A request with this Idempotency-Key is already in progress.' },
        });
      }

      // 2c. Réponse déjà calculée : on la rejoue
      if (row.response_status) {
        res.setHeader('Idempotency-Replayed', 'true');
        return res.status(row.response_status).json(row.response_body);
      }

      // Sinon (cas rare : record sans response et lock expiré), on rejette
      return res.status(409).json({
        error: { code: 'idempotency_record_inconsistent' },
      });
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Intercepte la prochaine res.json pour persister le status + body.
 */
function interceptResponse(res, store) {
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    Promise.resolve(store(res.statusCode || 200, body)).catch(() => { /* ignore */ });
    return originalJson(body);
  };
}

module.exports = { idempotent };
