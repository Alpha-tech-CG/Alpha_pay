// Applique l'immutabilité du grand livre (triggers + vue) hors `prisma db push`,
// car Prisma ne gère pas les triggers/vues (ALP-166).
//   Usage : node packages/database/sql/apply-triggers.mjs
import { prisma } from '../dist/index.js';

const STATEMENTS = [
  `CREATE OR REPLACE FUNCTION journal_block_mutation() RETURNS trigger AS $$
   BEGIN RAISE EXCEPTION 'journal_entries est append-only : % interdit', TG_OP; END;
   $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS journal_no_update ON journal_entries`,
  `CREATE TRIGGER journal_no_update BEFORE UPDATE ON journal_entries
     FOR EACH ROW EXECUTE FUNCTION journal_block_mutation()`,
  `DROP TRIGGER IF EXISTS journal_no_delete ON journal_entries`,
  `CREATE TRIGGER journal_no_delete BEFORE DELETE ON journal_entries
     FOR EACH ROW EXECUTE FUNCTION journal_block_mutation()`,
  `CREATE OR REPLACE VIEW account_balances AS
     SELECT account_id, currency,
            SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END) AS balance
     FROM journal_entries GROUP BY account_id, currency`,
];

for (const stmt of STATEMENTS) {
  await prisma.$executeRawUnsafe(stmt);
}
console.log('Ledger immutability appliquée (triggers anti-UPDATE/DELETE + vue account_balances)');
await prisma.$disconnect();
