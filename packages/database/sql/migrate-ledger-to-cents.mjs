// Convertit une base existante du format DECIMAL en centimes BIGINT.
// Sans effet sur une base neuve ou deja migree.
import { createHash } from 'node:crypto';
import { prisma } from '../dist/index.js';

const GENESIS_HASH = '0'.repeat(64);

const columns = await prisma.$queryRawUnsafe(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND (table_name, column_name) IN (
      ('journal_entries', 'amount'),
      ('ledger_balance_snapshots', 'balance')
    )
`);

const typeOf = (table, column) =>
  columns.find((row) => row.table_name === table && row.column_name === column)?.data_type;

await prisma.$transaction(async (tx) => {
  if (typeOf('journal_entries', 'amount') === 'numeric') {
    await tx.$executeRawUnsafe('DROP VIEW IF EXISTS account_balances');
    await tx.$executeRawUnsafe('DROP TRIGGER IF EXISTS journal_no_update ON journal_entries');
    await tx.$executeRawUnsafe(`
      ALTER TABLE journal_entries
      ALTER COLUMN amount TYPE BIGINT USING ROUND(amount * 100)::BIGINT
    `);

    const entries = await tx.$queryRawUnsafe(`
      SELECT id, transaction_id, account_id, direction, amount, currency, description
      FROM journal_entries
      ORDER BY sequence ASC
    `);
    let prevHash = GENESIS_HASH;
    for (const entry of entries) {
      const content = [
        entry.transaction_id,
        entry.account_id,
        entry.direction,
        entry.amount.toString(),
        entry.currency,
        entry.description ?? '',
      ].join('|');
      const hash = createHash('sha256').update(prevHash + content).digest('hex');
      await tx.$executeRawUnsafe(
        'UPDATE journal_entries SET prev_hash = $1, hash = $2 WHERE id = $3',
        prevHash,
        hash,
        entry.id,
      );
      prevHash = hash;
    }

    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION journal_block_mutation() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'journal_entries est append-only : % interdit', TG_OP; END;
      $$ LANGUAGE plpgsql
    `);
    await tx.$executeRawUnsafe(`
      CREATE TRIGGER journal_no_update BEFORE UPDATE ON journal_entries
      FOR EACH ROW EXECUTE FUNCTION journal_block_mutation()
    `);
    await tx.$executeRawUnsafe(`
      CREATE VIEW account_balances AS
      SELECT account_id, currency,
             SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END) AS balance
      FROM journal_entries GROUP BY account_id, currency
    `);
  }

  if (typeOf('ledger_balance_snapshots', 'balance') === 'numeric') {
    await tx.$executeRawUnsafe(`
      ALTER TABLE ledger_balance_snapshots
      ALTER COLUMN balance TYPE BIGINT USING ROUND(balance * 100)::BIGINT
    `);
  }
}, { timeout: 120_000 });

console.log('Ledger en centimes BIGINT (conversion appliquee ou deja a jour)');
await prisma.$disconnect();
