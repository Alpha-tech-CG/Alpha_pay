-- Immutabilité du grand livre au niveau DB (ALP-166 / PAY-VULN-015).
--
-- Prisma ne gère pas les triggers : ce script est appliqué hors `prisma db push`
-- (idempotent). Il garantit qu'AUCUN UPDATE/DELETE ne peut altérer le journal,
-- même via un accès SQL direct (défense en profondeur au-delà du service).

CREATE OR REPLACE FUNCTION journal_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'journal_entries est append-only : % interdit', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_no_update ON journal_entries;
CREATE TRIGGER journal_no_update
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION journal_block_mutation();

DROP TRIGGER IF EXISTS journal_no_delete ON journal_entries;
CREATE TRIGGER journal_no_delete
  BEFORE DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION journal_block_mutation();

-- Vue des soldes calculés en direct (debit négatif / credit positif selon la
-- direction), par compte et par devise.
CREATE OR REPLACE VIEW account_balances AS
SELECT
  account_id,
  currency,
  SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END) AS balance
FROM journal_entries
GROUP BY account_id, currency;
