/**
 * lib/ledger.js — Grand livre en double-entrée immuable.
 *
 * Règles inviolables :
 *   1. Toute écriture dans une transaction `SERIALIZABLE`
 *   2. somme(debit) === somme(credit) AVANT commit, sinon rollback
 *   3. Chaque entry est chaînée par hash à la précédente
 *   4. Aucune méthode UPDATE/DELETE n'est exposée
 *   5. Corrections par contre-écriture uniquement
 */
const { chainHash } = require('./crypto');

class LedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'LedgerError';
  }
}

/**
 * Poste une transaction comptable.
 *
 * @param {object} options
 * @param {Pool|Client} options.client client pg connecté (idéalement déjà en transaction)
 * @param {string} options.transactionId UUID de la transaction logique
 * @param {Array<{accountId: string, debit?: bigint, credit?: bigint, currency: string, description?: string}>} options.entries
 */
async function postEntries({ client, transactionId, entries }) {
  if (!entries || entries.length < 2) {
    throw new LedgerError('invalid_entries', 'At least 2 entries required (double-entry).');
  }

  // 1. Vérifier l'équilibre par devise
  const totals = new Map();
  for (const e of entries) {
    const debit = BigInt(e.debit || 0);
    const credit = BigInt(e.credit || 0);
    if (debit < 0n || credit < 0n) {
      throw new LedgerError('negative_amount', 'Amounts must be non-negative integers (cents).');
    }
    if ((debit === 0n) === (credit === 0n)) {
      throw new LedgerError('invalid_entry', 'Exactly one of debit/credit must be non-zero per entry.');
    }
    const t = totals.get(e.currency) || { debit: 0n, credit: 0n };
    t.debit += debit;
    t.credit += credit;
    totals.set(e.currency, t);
  }
  for (const [currency, t] of totals.entries()) {
    if (t.debit !== t.credit) {
      throw new LedgerError(
        'unbalanced',
        `Debit (${t.debit}) ≠ Credit (${t.credit}) for ${currency}.`
      );
    }
  }

  // 2. Verrouiller la dernière entrée pour récupérer prev_hash (sérialise les inserts)
  const lastRes = await client.query(
    `SELECT hash FROM journal_entries ORDER BY id DESC LIMIT 1 FOR UPDATE`
  );
  let prevHash = lastRes.rows[0] ? lastRes.rows[0].hash : null;

  // 3. Insérer les entries en chaînant les hashes
  const inserted = [];
  for (const e of entries) {
    const debit = String(e.debit || 0);
    const credit = String(e.credit || 0);
    const payload = {
      transaction_id: transactionId,
      account_id: e.accountId,
      debit, credit,
      currency: e.currency,
      description: e.description || null,
    };
    const hash = chainHash(prevHash, payload);

    const insertRes = await client.query(
      `INSERT INTO journal_entries
         (transaction_id, account_id, debit_cents, credit_cents, currency,
          prev_hash, hash, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, hash`,
      [transactionId, e.accountId, debit, credit, e.currency, prevHash, hash, e.description || null]
    );
    inserted.push(insertRes.rows[0]);
    prevHash = hash;
  }

  return inserted;
}

/**
 * Lit le solde d'un compte (depuis le journal, pas un cache).
 * Pour les comptes très actifs, prévoir snapshots horaires.
 */
async function getBalance(client, accountId) {
  const r = await client.query(
    `SELECT COALESCE(SUM(credit_cents - debit_cents), 0)::TEXT AS balance
     FROM journal_entries WHERE account_id = $1`,
    [accountId]
  );
  return BigInt(r.rows[0].balance);
}

/**
 * Vérification d'intégrité de la chaîne. Renvoie le rang de la première rupture
 * ou null si tout est cohérent.
 */
async function verifyChain(client, { limit = 10000 } = {}) {
  const r = await client.query(
    `SELECT id, transaction_id, account_id, debit_cents, credit_cents, currency,
            prev_hash, hash, description
     FROM journal_entries ORDER BY id ASC LIMIT $1`,
    [limit]
  );

  let prevHash = null;
  for (const row of r.rows) {
    const payload = {
      transaction_id: row.transaction_id,
      account_id: row.account_id,
      debit: row.debit_cents,
      credit: row.credit_cents,
      currency: row.currency,
      description: row.description,
    };
    const expected = chainHash(prevHash, payload);
    if (!expected.equals(row.hash)) {
      return { broken: true, atId: row.id };
    }
    prevHash = row.hash;
  }
  return { broken: false };
}

/**
 * Helpers pour construire les écritures classiques.
 */
function paymentCollectionEntries({ transactionId, merchantAccountId, operatorAccountId, feeAccountId, amount, fee, currency = 'XAF' }) {
  const amt = BigInt(amount);
  const f = BigInt(fee || 0);
  if (amt <= 0n) throw new LedgerError('invalid_amount', 'Amount must be > 0.');
  if (f < 0n || f >= amt) throw new LedgerError('invalid_fee', 'Fee must be in [0, amount).');

  // Encaissement : opérateur reçoit l'argent ⇒ on lui crédite (compte externe)
  // Et on débite le compte de transit interne. Une fois la confirmation,
  // on transfère vers le marchand (net) + frais.
  return [
    { accountId: operatorAccountId, credit: amt, currency, description: 'Encaissement opérateur' },
    { accountId: merchantAccountId, debit: amt - f, currency, description: 'Crédit marchand (net)' },
    { accountId: feeAccountId,      debit: f,         currency, description: 'Commission PayBrain' },
  ];
}

module.exports = {
  postEntries,
  getBalance,
  verifyChain,
  paymentCollectionEntries,
  LedgerError,
};
