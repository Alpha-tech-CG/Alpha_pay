/**
 * lib/secrets.js — Chargement des secrets depuis AWS Secrets Manager.
 *
 * En développement local : utilise process.env via dotenv.
 * En staging/prod : exige AWS Secrets Manager. Aucun fallback vers env en prod.
 */
const crypto = require('node:crypto');

const NODE_ENV = process.env.NODE_ENV || 'development';
const PROD_LIKE = ['production', 'staging'].includes(NODE_ENV);

let cache = null;

/**
 * Charge tous les secrets nécessaires au démarrage.
 * À appeler une seule fois avant de servir des requêtes.
 */
async function loadSecrets() {
  if (cache) return cache;

  if (PROD_LIKE) {
    cache = await loadFromAwsSecretsManager();
  } else {
    cache = loadFromEnv();
  }

  // Validation : les secrets critiques DOIVENT être présents et de bonne taille
  validate(cache);

  // Immutabilité : empêche les modifications ultérieures
  return Object.freeze(cache);
}

async function loadFromAwsSecretsManager() {
  const { SecretsManagerClient, GetSecretValueCommand } =
    require('@aws-sdk/client-secrets-manager');
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION || 'af-south-1',
  });

  async function get(name) {
    const out = await client.send(new GetSecretValueCommand({ SecretId: name }));
    return out.SecretString ? JSON.parse(out.SecretString) : null;
  }

  const env = process.env.NODE_ENV;
  const db = await get(`paybrain/${env}/db`);
  const app = await get(`paybrain/${env}/app`);
  const mtn = await get(`paybrain/${env}/mtn`);
  const webhooks = await get(`paybrain/${env}/webhook-secrets`);

  return {
    databaseUrl: db.url,
    redisUrl: app.redis_url,
    // peppers
    apiKeyPepper: app.api_key_pepper,
    deterministicHmacKey: Buffer.from(app.deterministic_hmac_key_b64, 'base64'),
    // MTN
    mtn: {
      subscriptionKey: mtn.subscription_key,
      apiUserId: mtn.api_user_id,
      apiKey: mtn.api_key,
      baseUrl: mtn.base_url,
      environment: mtn.environment,
      webhookSecret: webhooks.mtn,
    },
    // KMS
    kmsKeyId: app.kms_key_id,
  };
}

function loadFromEnv() {
  require('dotenv').config();
  return {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    apiKeyPepper: process.env.API_KEY_PEPPER,
    deterministicHmacKey: process.env.DETERMINISTIC_HMAC_KEY_B64
      ? Buffer.from(process.env.DETERMINISTIC_HMAC_KEY_B64, 'base64')
      : crypto.randomBytes(32), // ⚠ dev only
    mtn: {
      subscriptionKey: process.env.MTN_SUBSCRIPTION_KEY,
      apiUserId: process.env.MTN_API_USER_ID,
      apiKey: process.env.MTN_API_KEY,
      baseUrl: process.env.MTN_BASE_URL,
      environment: process.env.MTN_ENVIRONMENT,
      webhookSecret: process.env.MTN_WEBHOOK_SECRET,
    },
    kmsKeyId: process.env.KMS_KEY_ID,
  };
}

function validate(s) {
  const missing = [];
  if (!s.databaseUrl) missing.push('databaseUrl');
  if (!s.apiKeyPepper || s.apiKeyPepper.length < 32) missing.push('apiKeyPepper (≥32 chars)');
  if (!Buffer.isBuffer(s.deterministicHmacKey) || s.deterministicHmacKey.length < 32)
    missing.push('deterministicHmacKey (≥32 bytes)');
  if (PROD_LIKE && !s.mtn.webhookSecret) missing.push('mtn.webhookSecret');
  if (PROD_LIKE && !s.kmsKeyId) missing.push('kmsKeyId');

  if (missing.length) {
    throw new Error(`Secrets manquants au démarrage : ${missing.join(', ')}`);
  }
}

module.exports = { loadSecrets };
