const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const MTN_API_USER_ID = '604c51ad-e956-4de7-a699-3e0f404a2d83';
const MTN_API_KEY = 'b067e739354e42c79f04bf6590547253';
const MTN_SUBSCRIPTION_KEY = '4d952767ab594fe096641ac90598f7bd';
const MTN_BASE_URL = 'https://sandbox.momodeveloper.mtn.com';

async function getToken() {
  const credentials = Buffer.from(`${MTN_API_USER_ID}:${MTN_API_KEY}`).toString('base64');
  const response = await axios.post(`${MTN_BASE_URL}/collection/token/`, {}, {
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Ocp-Apim-Subscription-Key': MTN_SUBSCRIPTION_KEY,
    }
  });
  return response.data.access_token;
}

async function testRequestToPay() {
  try {
    const token = await getToken();
    const referenceId = uuidv4();

    console.log('📤 Envoi paiement sandbox...');
    console.log('🔑 Reference ID:', referenceId);

    await axios.post(`${MTN_BASE_URL}/collection/v1_0/requesttopay`, {
      amount: '1000',
      currency: 'EUR',
      externalId: uuidv4(),
      payer: {
        partyIdType: 'MSISDN',
        partyId: '46733123450',
      },
      payerMessage: 'Test frais scolaires Alpha-Educ',
      payeeNote: 'PayBrain Test',
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Reference-Id': referenceId,
        'X-Target-Environment': 'sandbox',
        'Ocp-Apim-Subscription-Key': MTN_SUBSCRIPTION_KEY,
        'Content-Type': 'application/json',
      }
    });

    console.log('✅ 202 Accepté — paiement EN ATTENTE');
    console.log('⏳ Vérification statut dans 5 secondes...');

    await new Promise(r => setTimeout(r, 5000));

    const status = await axios.get(`${MTN_BASE_URL}/collection/v1_0/requesttopay/${referenceId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Target-Environment': 'sandbox',
        'Ocp-Apim-Subscription-Key': MTN_SUBSCRIPTION_KEY,
      }
    });

    console.log('📊 Statut final:', status.data.status);
    console.log('💰 Montant:', status.data.amount, status.data.currency);
    console.log('📱 Payeur:', status.data.payer.partyId);

  } catch (error) {
    console.log('❌ Erreur:', error.response?.status, JSON.stringify(error.response?.data));
  }
}

testRequestToPay();