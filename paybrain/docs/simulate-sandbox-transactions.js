/**
 * Plan de travail Phase 2, tâche 2.6 :
 * Simule 50 transactions via l'API PayBrain (NestJS) avec de faux numéros MTN sandbox,
 * puis génère un rapport de tests (livrable : Rapport de tests).
 *
 * Respecte la limite de débit /payments (20 req/min) en espaçant les appels.
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'paybrain-key-alpha-educ-2026';
const TOTAL = 50;
const DELAY_MS = 3200; // ~18.75 req/min, sous la limite de 20/min

// Numéros sandbox MTN MoMo whitelistés côté connecteur (cf. packages/shared/src/utils/phone.ts).
const MTN_SANDBOX_NUMBERS = ['46733123450', '46733123451', '46733123452'];
const MTN_PREFIXES = ['066', '067', '068'];
const AIRTEL_PREFIXES = ['055', '056', '057', '058', '074', '075', '076', '077'];

// Alterne entre numéros sandbox MTN dédiés et numéros 242 avec préfixes MTN/Airtel valides,
// pour exercer la détection d'opérateur sur les deux réseaux.
function sandboxPhone(i) {
  if (i % 3 === 0) return MTN_SANDBOX_NUMBERS[i % MTN_SANDBOX_NUMBERS.length];
  const prefixes = i % 2 === 0 ? MTN_PREFIXES : AIRTEL_PREFIXES;
  const prefix = prefixes[i % prefixes.length];
  const suffix = String(100000 + (i * 37) % 900000).padStart(6, '0');
  return `242${prefix}${suffix}`;
}

async function run() {
  const results = [];
  console.log(`Simulation de ${TOTAL} transactions sandbox vers ${API}/payments...`);

  for (let i = 1; i <= TOTAL; i++) {
    const phone = sandboxPhone(i);
    const externalId = `sandbox-test-${Date.now()}-${i}`;
    const start = Date.now();
    try {
      const r = await axios.post(`${API}/payments`, {
        amount: 1000 + i,
        currency: 'EUR',
        phone,
        externalId,
        description: `Transaction simulée #${i}`,
      }, { headers: { 'X-API-Key': API_KEY } });

      results.push({
        index: i, phone, externalId, ok: true,
        status: r.data.status, operator: r.data.operator,
        referenceId: r.data.referenceId, durationMs: Date.now() - start,
      });
      console.log(`[${i}/${TOTAL}] OK — ${r.data.operator} — ${r.data.status} — ${r.data.referenceId}`);
    } catch (err) {
      results.push({
        index: i, phone, externalId, ok: false,
        error: err.response?.data?.message || err.message,
        durationMs: Date.now() - start,
      });
      console.log(`[${i}/${TOTAL}] ÉCHEC — ${err.response?.data?.message || err.message}`);
    }

    if (i < TOTAL) await new Promise(res => setTimeout(res, DELAY_MS));
  }

  const succeeded = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  const avgDuration = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length);

  const report = `# Rapport de tests sandbox — PayBrain
Plan de travail, Phase 2, tâche 2.6 — Tests d'intégration sandbox

**Date** : ${new Date().toISOString()}
**Total transactions simulées** : ${TOTAL}
**Réussies** : ${succeeded.length}
**Échouées** : ${failed.length}
**Taux de succès** : ${((succeeded.length / TOTAL) * 100).toFixed(1)}%
**Durée moyenne par requête** : ${avgDuration} ms

## Détail des échecs
${failed.length === 0 ? 'Aucun échec.' : failed.map(f => `- #${f.index} (${f.phone}) : ${f.error}`).join('\n')}

## Échantillon des transactions réussies (10 premières)
${succeeded.slice(0, 10).map(s => `- #${s.index} — ${s.operator} — ${s.status} — réf. ${s.referenceId}`).join('\n')}

---
Critère de passage Phase 3 (extrait du plan) : *50 transactions sandbox réussies documentées + dashboard fonctionnel + zéro erreur sur les callbacks.*
`;

  fs.writeFileSync(path.join(__dirname, 'rapport-tests-sandbox.md'), report);
  fs.writeFileSync(path.join(__dirname, 'rapport-tests-sandbox.json'), JSON.stringify(results, null, 2));
  console.log('\nRapport écrit : paybrain/docs/rapport-tests-sandbox.md');
  console.log(`Résultat : ${succeeded.length}/${TOTAL} réussies`);
}

run();
