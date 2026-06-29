/**
 * middleware/auth.js — Authentification par clé API (Argon2id) avec scopes.
 *
 * Modifie req.merchant et req.apiKey.
 * Refuse tout : pas de header, format invalide, clé inconnue, révoquée, expirée,
 * scope manquant, IP hors allowlist.
 */
const { parseApiKey, verifySecret } = require('../lib/crypto');

/**
 * @param {Pool} db pg Pool
 * @param {Object} secrets résultat de loadSecrets()
 * @param {string[]} requiredScopes scopes nécessaires (toutes les valeurs requises)
 */
function requireApiKey(db, secrets, requiredScopes = []) {
  return async function authMiddleware(req, res, next) {
    try {
      const raw = req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
      if (!raw) return deny(res, 401, 'missing_api_key');

      const parsed = parseApiKey(raw);
      if (!parsed) return deny(res, 401, 'invalid_api_key_format');

      // 1. Lookup par préfixe (constant : un seul row)
      const result = await db.query(
        `SELECT id, merchant_id, hash, scopes, mode, ip_allowlist,
                revoked_at, expires_at
         FROM api_keys WHERE prefix = $1`,
        [parsed.prefix]
      );
      const key = result.rows[0];

      // Si pas trouvé : on tente quand même un verify dummy pour
      // ne pas révéler par timing l'existence du préfixe.
      const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$' +
        'AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const hashToCheck = key ? key.hash : dummyHash;

      const isValid = await verifySecret(hashToCheck, parsed.secret, secrets.apiKeyPepper);
      if (!key || !isValid) return deny(res, 401, 'invalid_api_key');

      // 2. Révocation / expiration
      if (key.revoked_at) return deny(res, 401, 'api_key_revoked');
      if (key.expires_at && new Date(key.expires_at) < new Date()) {
        return deny(res, 401, 'api_key_expired');
      }

      // 3. Scopes
      for (const required of requiredScopes) {
        if (!key.scopes.includes(required)) return deny(res, 403, 'insufficient_scope');
      }

      // 4. IP allowlist (si configurée)
      if (key.ip_allowlist && key.ip_allowlist.length) {
        const remoteIp = req.ip;
        const allowed = key.ip_allowlist.some((cidr) => ipInCidr(remoteIp, cidr));
        if (!allowed) return deny(res, 403, 'ip_not_allowed');
      }

      // 5. Charger le marchand (sans email/PII)
      const m = await db.query(
        `SELECT id, name, status FROM merchants WHERE id = $1`,
        [key.merchant_id]
      );
      if (!m.rows[0] || m.rows[0].status !== 'active') {
        return deny(res, 403, 'merchant_not_active');
      }

      req.merchant = m.rows[0];
      req.apiKey = { id: key.id, mode: key.mode, scopes: key.scopes };

      // 6. Mise à jour last_used (best effort, async, non bloquant)
      db.query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [key.id])
        .catch(() => { /* ignore */ });

      next();
    } catch (err) {
      next(err);
    }
  };
}

function deny(res, status, code) {
  // Header pour faciliter l'audit
  res.setHeader('WWW-Authenticate', `Bearer error="${code}"`);
  return res.status(status).json({ error: { code } });
}

/**
 * Implémentation minimaliste IPv4 CIDR check.
 * En production, utiliser `ip-address` ou `cidr-matcher`.
 */
function ipInCidr(ip, cidr) {
  const [network, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const ipToInt = (s) => s.split('.').reduce((acc, o) => (acc << 8) | parseInt(o, 10), 0) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
}

module.exports = { requireApiKey };
