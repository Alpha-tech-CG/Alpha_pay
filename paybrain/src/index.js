require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Diffuser un événement à tous les clients dashboard connectés
function broadcast(event, data) {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

wss.on('connection', ws => {
  console.log('[WS] Client dashboard connecte');
  ws.send(JSON.stringify({ event: 'connected', data: { service: 'PayBrain' } }));
  ws.on('close', () => console.log('[WS] Client dashboard deconnecte'));
});

// Rendre broadcast accessible aux routes
app.locals.broadcast = broadcast;

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use('/payments', require('./routes/payments'));
app.use('/paylinks', require('./routes/paylinks'));
app.use('/webhooks', require('./routes/webhooks'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'PayBrain API', version: '1.0.0' });
});

// Stats pour le dashboard
const { pool } = require('./models/transaction');
app.get('/stats', async (req, res) => {
  const [totals, recent] = await Promise.all([
    pool.query(`SELECT status, COUNT(*) as count, COALESCE(SUM(amount),0) as volume
                FROM transactions GROUP BY status`),
    pool.query(`SELECT t.*, m.name as merchant_name
                FROM transactions t
                LEFT JOIN merchants m ON m.id = t.merchant_id
                ORDER BY t.created_at DESC LIMIT 20`),
  ]);
  res.json({ totals: totals.rows, recent: recent.rows });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`PayBrain API demarree sur le port ${PORT}`);
});

module.exports = { broadcast };
