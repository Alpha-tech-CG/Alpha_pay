-- Migration inverse de 20_amounts_minor_units (manuelle : psql -f down.sql).
UPDATE "transactions" SET "amount" = "amount" * 100 WHERE "currency" = 'XAF';
UPDATE "payment_links" SET "amount" = "amount" * 100 WHERE "currency" = 'XAF';
UPDATE "reconciliation_runs"
   SET "total_statement" = "total_statement" * 100,
       "total_ledger" = "total_ledger" * 100,
       "max_discrepancy" = "max_discrepancy" * 100;
UPDATE "reconciliation_discrepancies"
   SET "ledger_amount" = "ledger_amount" * 100,
       "statement_amount" = "statement_amount" * 100;
