/**
 * src/index.js — Point d'entrée de l'API PayBrain durcie.
 *
 * Toutes les couches de sécurité sont montées dans le bon ordre.
 */
const express = require('express');
const http = require('node:http');
const { WebSocketServer } = require('ws');
const { Pool } = require('pg');

const { loadSecrets } = require('./lib/secrets');
const { logger } = require('./lib/logger');
const {
  securityHeaders, corsAllowlist, bodyLimit, requestId,
  requireJson, rateLimitByApiKey, errorHandler,
} = require('./middleware/security');
const { createMtnConnector } = require('./connectors/mtn-connector');
const { createPaymentsRouter } = require('./routes/payments');
const { createWebhooksRouter } = require('./routes/webhooks');

// =============================================================================
// Bootstrap async
// =============================================================================

async function bootstrap() {
  const secrets = await loadSecrets();

  const db = new Pool({
    connectionString: secrets.databaseUrl,
    ssl: process.env.NODE_ENV === 'development' ? false : { rejectUnauthorized: true },
    max: 20,
  });

  const mtnConnector = createMtnConnector({ mtn: secrets.mtn });

  // KMS stub (à remplacer par AWS KMS / Vault en prod)
  const kms = createKmsStub(secrets);

  // Accounts helpers (chargent les UUID des comptes système)
  const accounts = createAccountsHelpers(db);

  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // -------------------------------------------------------------------------
  // Middlewares globaux
  // -------------------------------------------------------------------------
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(securityHeaders());
  app.use(requestId());
  app.use(corsAllowlist((process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)));

  // Webhooks DOIVENT être montés AVANT express.json() (pour body raw)
  app.use('/v1/webhooks', createWebhooksRouter({
    db, secrets, accounts,
    broadcast: (event, data) => wssBroadcast(wss, event, data),
  }));

  // JSON parsing pour le reste
  app.use(bodyLimit('8kb'));
  app.use(requireJson());
  app.use(express.json({ limit: '8kb', strict: true }));

  app.use('/v1/payments', createPaymentsRouter({
    db, secrets, mtnConnector, kms, accounts,
  }));

  // Health / readiness
  app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', asyncReady(db));

  // 404
  app.use((req, res) => res.status(404).json({ error: { code: 'not_found' } }));

  // Error handler (DOIT être le dernier)
  app.use(errorHandler(logger));

  // -------------------------------------------------------------------------
  // WebSocket dashboard (auth simple par token query, à durcir avec Clerk)
  // -------------------------------------------------------------------------
  wss.on('connection', (ws, req) => {
    // En production : vérifier un token signé court ici
    ws.send(JSON.stringify({ event: 'connected', service: 'PayBrain' }));
  });

  // -------------------------------------------------------------------------
  // Start
  // -------------------------------------------------------------------------
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, () => {
    logger.info({ port }, 'paybrain_api_started');
  });

  // Shutdown propre
  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting_down');
    server.close(() => process.exit(0));
    await db.end();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  logger.fatal({ err: { message: err.message, stack: err.stack } }, 'bootstrap_failed');
  process.exit(1);
});

// =============================================================================
// Helpers
// =============================================================================

function wssBroadcast(wss, event, data) {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  wss.clients.forEach((c) => { if (c.readyState === 1) c.send(msg); });
}

function asyncReady(db) {
  return async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not_ready' });
    }
  };
}

/**
 * KMS stub : utilise une clé symétrique locale en dev.
 * En prod, remplacer par AWS KMS via @aws-sdk/client-kms.
 */
function createKmsStub(secrets) {
  const crypto = require('node:crypto');
  // Dev only : dérive une clé depuis le pepper
  const devKek = crypto.createHash('sha256').update(secrets.apiKeyPepper).digest();
  return {
    async encrypt(dek) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', devKek, iv);
      const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([iv, tag, ct]);
    },
    async decrypt(encDek) {
      const iv = encDek.subarray(0, 12);
      const tag = encDek.subarray(12, 28);
      const ct = encDek.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', devKek, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]);
    },
  };
}

/**
 * Helpers pour les comptes système (charge UUID au démarrage).
 */
function createAccountsHelpers(db) {
  const cache = new Map();
  return {
    async getMerchantAccount(client, merchantId) {
      const cacheKey = `m:${merchantId}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      const r = await client.query(
        `SELECT id FROM accounts
         WHERE type = 'merchant' AND owner_id = $1 AND currency = 'XAF'`,
        [merchantId]
      );
      if (!r.rows[0]) throw new Error(`No merchant account for ${merchantId}`);
      cache.set(cacheKey, r.rows[0].id);
      return r.rows[0].id;
    },
    async getOperatorAccount(client, op) {
      const cacheKey = `op:${op}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      const r = await client.query(
        `SELECT id FROM accounts WHERE type = 'operator' AND label = $1 AND currency = 'XAF'`,
        [op]
      );
      if (!r.rows[0]) throw new Error(`No operator account for ${op}`);
      cache.set(cacheKey, r.rows[0].id);
      return r.rows[0].id;
    },
    async getFeeAccount(client) {
      if (cache.has('fee')) return cache.get('fee');
      const r = await client.query(
        `SELECT id FROM accounts WHERE type = 'fee' AND currency = 'XAF' LIMIT 1`
      );
      if (!r.rows[0]) throw new Error('No fee account');
      cache.set('fee', r.rows[0].id);
      return r.rows[0].id;
    },
  };
}
