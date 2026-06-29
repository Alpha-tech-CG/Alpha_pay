/**
 * middleware/security.js — Couches de sécurité réseau et HTTP.
 *
 * À monter en tête de la pile Express :
 *   app.use(securityHeaders());
 *   app.use(corsAllowlist(allowedOrigins));
 *   app.use(bodyLimit('8kb'));
 *   app.use(requestId());
 */
const crypto = require('node:crypto');

/**
 * En-têtes de sécurité de base (équivalent helmet, sans la dépendance).
 */
function securityHeaders() {
  return (req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    // Anti-fingerprinting
    res.removeHeader('X-Powered-By');
    next();
  };
}

/**
 * CORS avec allowlist explicite (pas de '*').
 */
function corsAllowlist(allowedOrigins) {
  const set = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && set.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Idempotency-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}

/**
 * Limite la taille du body JSON parsé (anti-DoS sur le parser JSON).
 * À utiliser avec `express.json({ limit, strict: true })`.
 */
function bodyLimit(limit = '8kb') {
  // Wrapper express.json déjà géré ailleurs ; ici on rejette aussi via Content-Length
  return (req, res, next) => {
    const len = parseInt(req.headers['content-length'] || '0', 10);
    const maxBytes = parseLimit(limit);
    if (len > maxBytes) {
      return res.status(413).json({ error: { code: 'payload_too_large' } });
    }
    next();
  };
}

function parseLimit(s) {
  const m = String(s).match(/^(\d+)\s*(kb|mb|b)?$/i);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  switch ((m[2] || 'b').toLowerCase()) {
    case 'mb': return n * 1024 * 1024;
    case 'kb': return n * 1024;
    default: return n;
  }
}

/**
 * Ajoute un `req.id` UUID (utilisé par les logs et l'audit).
 */
function requestId() {
  return (req, res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  };
}

/**
 * Content-Type JSON strict.
 */
function requireJson() {
  return (req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const ct = (req.headers['content-type'] || '').split(';')[0].trim();
      if (ct !== 'application/json') {
        return res.status(415).json({ error: { code: 'unsupported_media_type' } });
      }
    }
    next();
  };
}

/**
 * Rate limit par clé API (basé Redis pour distribué, fallback mémoire pour dev).
 */
function rateLimitByApiKey({ redis, max = 100, windowSec = 60 }) {
  const memMap = new Map();
  return async (req, res, next) => {
    const id = req.merchant ? req.merchant.id : req.ip;
    const key = `rl:${id}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    let count;
    if (redis) {
      count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSec);
    } else {
      count = (memMap.get(key) || 0) + 1;
      memMap.set(key, count);
      setTimeout(() => memMap.delete(key), windowSec * 1000).unref();
    }
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
    if (count > max) {
      return res.status(429).json({ error: { code: 'rate_limited' } });
    }
    next();
  };
}

/**
 * Wrapper pour transformer une fonction async en middleware Express sans try/catch.
 */
function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

/**
 * Error handler central. Ne JAMAIS renvoyer error.message au client.
 */
function errorHandler(logger) {
  return (err, req, res, next) => {
    const errorId = req.id || 'unknown';
    logger.error({
      err: { message: err.message, stack: err.stack, code: err.code },
      error_id: errorId,
      path: req.path,
    }, 'unhandled_error');

    if (res.headersSent) return next(err);

    const status = err.status || err.statusCode || 500;
    const safeCode = err.publicCode || (status >= 500 ? 'internal_error' : 'request_error');
    res.status(status).json({ error: { code: safeCode, request_id: errorId } });
  };
}

module.exports = {
  securityHeaders,
  corsAllowlist,
  bodyLimit,
  requestId,
  requireJson,
  rateLimitByApiKey,
  asyncHandler,
  errorHandler,
};
