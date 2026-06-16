const { pool } = require('../models/transaction');

async function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'X-API-Key manquant' });
  }

  const result = await pool.query(
    'SELECT id, name FROM merchants WHERE api_key = $1 AND is_active = true',
    [apiKey]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Cle API invalide ou compte inactif' });
  }

  req.merchant = result.rows[0];
  next();
}

module.exports = { requireApiKey };
