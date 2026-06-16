const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../models/transaction');
const { requireApiKey } = require('../middleware/auth');
const router = express.Router();

// POST /paylinks — créer un lien de paiement
router.post('/', requireApiKey, async (req, res) => {
  try {
    const { amount, description, expiresInMinutes = 60 } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    const linkId = uuidv4();
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    await pool.query(
      `INSERT INTO payment_links (id, merchant_id, amount, currency, description, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [linkId, req.merchant.id, amount, process.env.MTN_CURRENCY, description || null, expiresAt]
    );

    const baseUrl = process.env.PAYBRAIN_WEBHOOK_URL.replace('/webhooks/mtn', '');
    const payUrl = `${baseUrl}/pay/${linkId}`;

    res.status(201).json({
      success: true,
      linkId,
      url: payUrl,
      amount,
      currency: process.env.MTN_CURRENCY,
      description,
      expiresAt,
    });
  } catch (error) {
    console.error('[PayLink] Erreur:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /paylinks/:linkId — infos du lien
router.get('/:linkId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pl.*, m.name as merchant_name
       FROM payment_links pl
       JOIN merchants m ON m.id = pl.merchant_id
       WHERE pl.id = $1`,
      [req.params.linkId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Lien introuvable' });

    const link = result.rows[0];
    if (new Date() > new Date(link.expires_at)) {
      return res.status(410).json({ error: 'Lien expire' });
    }

    res.json(link);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
