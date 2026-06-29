/**
 * lib/logger.js — Pino structuré avec redaction PII obligatoire
 *
 * Toute la journalisation passe par ce logger. Les anciens `console.log`
 * sont à supprimer du code.
 */
const pino = require('pino');

const REDACT_PATHS = [
  // Headers sensibles
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers["x-signature-256"]',
  'req.headers["cookie"]',
  // Champs de body sensibles
  '*.password',
  '*.secret',
  '*.pepper',
  '*.apiKey',
  '*.api_key',
  '*.access_token',
  '*.refresh_token',
  // PII : interdits en clair dans les logs
  '*.payer_phone',
  '*.payerPhone',
  '*.phone',
  '*.email',
  '*.tax_id',
  '*.niu',
  // Données carte (jamais stockées en théorie, mais ceinture & bretelles)
  '*.card_number',
  '*.cardNumber',
  '*.pan',
  '*.cvv',
  '*.cvc',
];

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: REDACT_PATHS,
    censor: '***REDACTED***',
    remove: false,
  },
  base: {
    service: 'paybrain-api',
    env: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || 'unknown',
  },
});

/**
 * Crée un child logger avec contexte trace/request.
 */
function withRequest(req) {
  return logger.child({
    request_id: req.id || req.headers['x-request-id'],
    trace_id: req.headers['traceparent'],
    merchant_id: req.merchant ? req.merchant.id : undefined,
    method: req.method,
    path: req.path,
  });
}

module.exports = { logger, withRequest };
