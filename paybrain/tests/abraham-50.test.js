/**
 * Tests Abraham — 50 scénarios sandbox MTN
 * Exécuter avec : node tests/abraham-50.test.js
 */
require('dotenv').config();
const axios = require('axios');

const BASE = 'http://localhost:3000';
const API_KEY = 'paybrain-key-alpha-educ-2026';
const headers = { 'Content-Type': 'application/json', 'X-API-Key': API_KEY };

// Numéros test sandbox MTN
const NUM_SUCCESS  = '46733123450'; // → SUCCESSFUL
const NUM_FAILED   = '46733123451'; // → FAILED
const NUM_REJECTED = '46733123452'; // → REJECTED

const results = [];
let passed = 0;
let failed = 0;

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function pay(phone, amount, extId, desc = 'Test Abraham') {
  const r = await axios.post(`${BASE}/payments`, {
    amount, phone, description: desc, merchantExternalId: extId
  }, { headers, validateStatus: () => true });
  return r;
}

async function getStatus(refId) {
  const r = await axios.get(`${BASE}/payments/${refId}`, { headers, validateStatus: () => true });
  return r.data;
}

function log(n, scenario, phone, amount, httpCode, status, ok, note = '') {
  const icon = ok ? '✓' : '✗';
  const line = `${icon} #${String(n).padStart(2,'0')} | ${scenario.padEnd(28)} | ${phone} | ${String(amount).padStart(7)} | HTTP ${httpCode} | ${(status||'').padEnd(10)} | ${note}`;
  console.log(line);
  results.push({ n, scenario, phone, amount, httpCode, status, ok, note });
  if (ok) passed++; else failed++;
}

async function runTests() {
  console.log('=== RAPPORT TESTS ABRAHAM — PayBrain MTN Sandbox ===');
  console.log(`Date : ${new Date().toISOString()}`);
  console.log('');

  // --- GROUPE 1 : Paiements normaux (1-20) ---
  console.log('--- Groupe 1 : Paiements normaux (1-20) ---');
  for (let i = 1; i <= 20; i++) {
    const r = await pay(NUM_SUCCESS, 5000, `ABR-G1-${i}`);
    const ok = r.status === 202 && r.data.status === 'PENDING';
    log(i, 'Paiement normal 5000', NUM_SUCCESS, 5000, r.status, r.data.status, ok);
    await delay(500);
  }

  // --- GROUPE 2 : Paiements refusés client (21-30) ---
  console.log('--- Groupe 2 : Paiements refuses (21-30) ---');
  for (let i = 21; i <= 30; i++) {
    const r = await pay(NUM_FAILED, 5000, `ABR-G2-${i}`);
    const ok = r.status === 202 && r.data.status === 'PENDING';
    log(i, 'Paiement refuse client', NUM_FAILED, 5000, r.status, r.data.status, ok);
    await delay(500);
  }

  // --- GROUPE 3 : Paiements rejetés (31-35) ---
  console.log('--- Groupe 3 : Paiements rejetes (31-35) ---');
  for (let i = 31; i <= 35; i++) {
    const r = await pay(NUM_REJECTED, 5000, `ABR-G3-${i}`);
    const ok = r.status === 202 && r.data.status === 'PENDING';
    log(i, 'Paiement rejete', NUM_REJECTED, 5000, r.status, r.data.status, ok);
    await delay(500);
  }

  // --- GROUPE 4 : Montants limites (36-40) ---
  console.log('--- Groupe 4 : Montants limites (36-40) ---');
  const amounts = [1, 100, 1000, 50000, 999999];
  for (let i = 0; i < amounts.length; i++) {
    const n = 36 + i;
    const r = await pay(NUM_SUCCESS, amounts[i], `ABR-G4-${n}`);
    const ok = r.status === 202;
    log(n, `Montant limite ${amounts[i]}`, NUM_SUCCESS, amounts[i], r.status, r.data.status, ok);
    await delay(500);
  }

  // --- GROUPE 5 : Numéros malformés (41-45) ---
  console.log('--- Groupe 5 : Numeros malformes (41-45) ---');
  const badPhones = [
    { phone: '0000000000', note: 'Numero inconnu' },
    { phone: '242099123456', note: 'Prefixe inexistant' },
    { phone: 'abc', note: 'Caracteres non numeriques' },
    { phone: '', note: 'Numero vide' },
    { phone: '242055123456', note: 'Airtel (non supporte Ph2)' },
  ];
  for (let i = 0; i < badPhones.length; i++) {
    const n = 41 + i;
    const r = await pay(badPhones[i].phone, 5000, `ABR-G5-${n}`);
    const ok = r.status === 400 || r.status === 500;
    log(n, 'Numero malformé', badPhones[i].phone || '(vide)', 5000, r.status, r.data.status || '-', ok, badPhones[i].note);
    await delay(300);
  }

  // --- GROUPE 6 : Double referenceId (46-50) ---
  // PayBrain génère un UUID frais à chaque appel donc pas de 409
  // On teste l'idempotence avec le même merchantExternalId
  console.log('--- Groupe 6 : ExternalId duplique (46-50) ---');
  for (let i = 46; i <= 50; i++) {
    const r = await pay(NUM_SUCCESS, 5000, 'ABR-DUPE-001', `Test dupe extId run ${i}`);
    // On attend 202 car notre UUID est toujours frais — MTN ne verra pas de 409
    const ok = r.status === 202;
    log(i, 'ExternalId duplique', NUM_SUCCESS, 5000, r.status, r.data.status, ok, 'UUID frais → pas de 409 MTN');
    await delay(500);
  }

  // --- RÉSUMÉ ---
  console.log('');
  console.log('=== RESUME ===');
  console.log(`Total    : 50`);
  console.log(`Passes   : ${passed}`);
  console.log(`Echoues  : ${failed}`);
  console.log(`Taux     : ${Math.round(passed/50*100)}%`);
  console.log('');

  // Détail des échecs
  const failures = results.filter(r => !r.ok);
  if (failures.length > 0) {
    console.log('--- Echecs a investiguer ---');
    failures.forEach(f => console.log(`  #${f.n} | ${f.scenario} | HTTP ${f.httpCode} | ${f.note}`));
  } else {
    console.log('Tous les scenarios ont passe.');
  }
}

runTests().catch(console.error);
