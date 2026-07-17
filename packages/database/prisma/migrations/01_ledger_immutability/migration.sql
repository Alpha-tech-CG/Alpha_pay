-- Immuabilité du grand livre (ALP) : journal_entries est append-only.
-- Toute tentative d'UPDATE/DELETE lève une exception au niveau base.

CREATE OR REPLACE FUNCTION journal_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'journal_entries est append-only : % interdit', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_no_update ON journal_entries;
CREATE TRIGGER journal_no_update BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION journal_block_mutation();

DROP TRIGGER IF EXISTS journal_no_delete ON journal_entries;
CREATE TRIGGER journal_no_delete BEFORE DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION journal_block_mutation();

-- Vue de solde par compte/devise (somme signée crédit - débit).
CREATE OR REPLACE VIEW account_balances AS
  SELECT account_id, currency,
         SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END) AS balance
  FROM journal_entries GROUP BY account_id, currency;
