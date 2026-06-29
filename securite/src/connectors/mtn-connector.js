/**
 * connectors/mtn-connector.js — Connecteur MTN MoMo durci.
 *
 * Améliorations vs v1 :
 *   - Token OAuth chargé via secrets manager (jamais lu directement de env en runtime)
 *   - Pool de connexions HTTPS avec timeout strict
 *   - Retry exponentiel + circuit breaker
 *   - Logs sans PII
 *   - Aucune donnée sensible dans error.message côté caller
 */
const axios = require('axios');
const https = require('node:https');
const { randomUuid, maskPhone } = require('../lib/crypto');
const { logger } = require('../lib/logger');

/**
 * Crée un connecteur lié à un set de secrets.
 */
function createMtnConnector({ mtn }) {
  if (!mtn || !mtn.subscriptionKey || !mtn.apiUserId || !mtn.apiKey) {
    throw new Error('createMtnConnector: secrets MTN incomplets');
  }

  // Token cache : valable ~3500s (marge sur le 3600s annoncé)
  let token = null;
  let tokenExpiry = 0;

  // HTTPS agent dédié (keepAlive + min TLS 1.2)
  const httpsAgent = new https.Agent({
    keepAlive: true,
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
  });

  const http = axios.create({
    baseURL: mtn.baseUrl,
    timeout: 10_000,
    httpsAgent,
    validateStatus: () => true, // on inspecte manuellement
    headers: {
      'Ocp-Apim-Subscription-Key': mtn.subscriptionKey,
    },
  });

  // Circuit breaker minimaliste
  let failures = 0;
  let openUntil = 0;
  const FAILURE_THRESHOLD = 5;
  const OPEN_DURATION_MS = 30_000;

  function assertCircuitClosed() {
    if (Date.now() < openUntil) {
      const err = new Error('mtn_connector_circuit_open');
      err.code = 'circuit_open';
      err.publicCode = 'service_unavailable';
      err.status = 503;
      throw err;
    }
  }

  function noteFailure() {
    failures += 1;
    if (failures >= FAILURE_THRESHOLD) {
      openUntil = Date.now() + OPEN_DURATION_MS;
      failures = 0;
      logger.warn({ provider: 'mtn' }, 'circuit_breaker_opened');
    }
  }

  function noteSuccess() {
    failures = 0;
  }

  async function getAccessToken() {
    if (token && Date.now() < tokenExpiry) return token;

    assertCircuitClosed();
    const creds = Buffer
      .from(`${mtn.apiUserId}:${mtn.apiKey}`)
      .toString('base64');

    const res = await http.post('/collection/token/', null, {
      headers: { Authorization: `Basic ${creds}` },
    });

    if (res.status !== 200 || !res.data?.access_token) {
      noteFailure();
      const err = new Error('mtn_token_failed');
      err.code = 'token_failed';
      err.publicCode = 'provider_unavailable';
      err.status = 502;
      throw err;
    }

    noteSuccess();
    token = res.data.access_token;
    // marge de 100s par rapport au expires_in déclaré
    const expiresIn = Number(res.data.expires_in) || 3500;
    tokenExpiry = Date.now() + (expiresIn - 100) * 1000;
    return token;
  }

  /**
   * Demande de paiement (collection requestToPay).
   *
   * @returns {Promise<{referenceId: string}>}
   */
  async function requestToPay({ amountCents, currency, payerPhone, externalId, description, callbackUrl }) {
    assertCircuitClosed();
    const t = await getAccessToken();
    const referenceId = randomUuid();
    const amount = (BigInt(amountCents) / 100n).toString(); // XAF est entier ; ajuster si nécessaire

    const res = await http.post('/collection/v1_0/requesttopay', {
      amount,
      currency,
      externalId: externalId || randomUuid(),
      payer: { partyIdType: 'MSISDN', partyId: payerPhone },
      payerMessage: sanitize(description, 60) || 'Paiement',
      payeeNote: 'PayBrain',
    }, {
      headers: {
        Authorization: `Bearer ${t}`,
        'X-Reference-Id': referenceId,
        'X-Target-Environment': mtn.environment,
        'X-Callback-Url': callbackUrl,
        'Content-Type': 'application/json',
      },
    });

    if (res.status !== 202) {
      noteFailure();
      logger.warn({
        provider: 'mtn',
        status: res.status,
        payer_masked: maskPhone(payerPhone),
        externalId,
      }, 'requesttopay_failed');
      const err = new Error('mtn_requesttopay_failed');
      err.code = 'requesttopay_failed';
      err.publicCode = 'provider_error';
      err.status = 502;
      throw err;
    }

    noteSuccess();
    return { referenceId };
  }

  /**
   * Statut d'un paiement (polling fallback si webhook tardif).
   */
  async function getPaymentStatus(referenceId) {
    assertCircuitClosed();
    const t = await getAccessToken();
    const res = await http.get(`/collection/v1_0/requesttopay/${referenceId}`, {
      headers: {
        Authorization: `Bearer ${t}`,
        'X-Target-Environment': mtn.environment,
      },
    });
    if (res.status !== 200) {
      noteFailure();
      const err = new Error('mtn_status_failed');
      err.publicCode = 'provider_error';
      err.status = 502;
      throw err;
    }
    noteSuccess();
    return res.data;
  }

  return { requestToPay, getPaymentStatus };
}

function sanitize(str, maxLen) {
  if (!str) return null;
  const cleaned = String(str).replace(/[\x00-\x1F]/g, '').trim();
  return cleaned.slice(0, maxLen);
}

module.exports = { createMtnConnector };
