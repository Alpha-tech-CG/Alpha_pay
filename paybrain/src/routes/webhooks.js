const express = require('express');
const { updateTransactionStatus, updateTransactionByExternalId, saveWebhookLog } = require('../models/transaction');
const router = express.Router();

router.post('/mtn', async (req, res) => {
  try {
    const payload = req.body;
    console.log('[Webhook MTN reçu]', JSON.stringify(payload, null, 2));

    const { status, externalId, financialTransactionId } = payload;

    // Persister le webhook brut
    await saveWebhookLog(financialTransactionId || externalId, payload);

    // TODO production : valider signature HMAC MTN avant traitement

    // Mettre à jour le statut en base
    // MTN envoie financialTransactionId (UUID) ou externalId selon le contexte
    let updated;
    if (financialTransactionId) {
      updated = await updateTransactionStatus(financialTransactionId, status, payload.reason || null);
    }
    if (!updated && externalId) {
      updated = await updateTransactionByExternalId(externalId, status, payload.reason || null);
    }

    if (status === 'SUCCESSFUL') {
      console.log(`[OK] Paiement confirmé : ${externalId}`);
    } else if (status === 'FAILED' || status === 'REJECTED') {
      console.log(`[KO] Paiement ${status} : ${externalId} — ${payload.reason}`);
    }

    // Notifier le dashboard en temps réel
    req.app.locals.broadcast('transaction_update', { externalId, status, reason: payload.reason || null });

    // Toujours répondre 200 à MTN pour accuser réception
    res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Webhook MTN] Erreur:', error.message);
    res.status(200).json({ received: true, error: error.message });
  }
});

module.exports = router;
