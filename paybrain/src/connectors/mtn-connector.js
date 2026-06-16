const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const BASE_URL = process.env.MTN_BASE_URL;
const SUBSCRIPTION_KEY = process.env.MTN_SUBSCRIPTION_KEY;
const API_USER_ID = process.env.MTN_API_USER_ID;
const API_KEY = process.env.MTN_API_KEY;
const ENVIRONMENT = process.env.MTN_ENVIRONMENT;
const CURRENCY = process.env.MTN_CURRENCY;

// Cache token en mémoire (Redis en production)
let cachedToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const credentials = Buffer
    .from(`${API_USER_ID}:${API_KEY}`)
    .toString('base64');

  const response = await axios.post(
    `${BASE_URL}/collection/token/`,
    {},
    {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      }
    }
  );

  cachedToken = response.data.access_token;
  tokenExpiry = Date.now() + (3500 * 1000); // 3500s (marge sécurité)
  return cachedToken;
}

async function requestToPay({ amount, payerPhone, externalId, description }) {
  const token = await getAccessToken();
  const referenceId = uuidv4();

  await axios.post(
    `${BASE_URL}/collection/v1_0/requesttopay`,
    {
      amount: String(amount),
      currency: CURRENCY,
      externalId: externalId || uuidv4(),
      payer: {
        partyIdType: 'MSISDN',
        partyId: payerPhone,
      },
      payerMessage: description || 'Paiement PayBrain',
      payeeNote: 'PayBrain',
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Reference-Id': referenceId,
        'X-Target-Environment': ENVIRONMENT,
        'X-Callback-Url': process.env.PAYBRAIN_WEBHOOK_URL,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
        'Content-Type': 'application/json',
      }
    }
  );

  return { referenceId, status: 'PENDING' };
}

async function getPaymentStatus(referenceId) {
  const token = await getAccessToken();

  const response = await axios.get(
    `${BASE_URL}/collection/v1_0/requesttopay/${referenceId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Target-Environment': ENVIRONMENT,
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      }
    }
  );

  return {
    referenceId,
    status: response.data.status,
    amount: response.data.amount,
    currency: response.data.currency,
    payer: response.data.payer,
    reason: response.data.reason || null,
  };
}

module.exports = { requestToPay, getPaymentStatus, getAccessToken };
