const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requestToPay, getPaymentStatus } = require('../connectors/mtn-connector');
const { detectOperator, normalizePhone } = require('../utils/router');
const { saveTransaction, getTransactionByRef } = require('../models/transaction');
const { requireApiKey } = require('../middleware/auth');
const router = express.Router();

router.post('/', requireApiKey, async (req, res) => {
  try {
    const { amount, phone, description, merchantExternalId } = req.body;

    if (!amount || !phone) {
      return res.status(400).json({ error: 'amount et phone sont requis' });
    }
    if (Number(amount) <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    const normalizedPhone = normalizePhone(phone);
    const operator = detectOperator(normalizedPhone);

    if (operator !== 'MTN') {
      return res.status(400).json({
        error: 'Airtel Money sera disponible prochainement. Utilisez un numéro MTN.'
      });
    }

    const extId = merchantExternalId || uuidv4();
    const { referenceId } = await requestToPay({
      amount,
      payerPhone: normalizedPhone,
      externalId: extId,
      description,
    });

    // Persister en base
    await saveTransaction({
      merchantId: req.merchant.id,
      mtnReferenceId: referenceId,
      externalId: extId,
      amount,
      currency: process.env.MTN_CURRENCY,
      payerPhone: normalizedPhone,
      payerMessage: description,
    });

    res.status(202).json({
      success: true,
      referenceId,
      status: 'PENDING',
      message: 'Demande de paiement envoyée. Le client doit confirmer sur son téléphone.',
      operator,
    });

  } catch (error) {
    console.error('[PayBrain] Erreur paiement:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:referenceId', requireApiKey, async (req, res) => {
  try {
    const result = await getPaymentStatus(req.params.referenceId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
