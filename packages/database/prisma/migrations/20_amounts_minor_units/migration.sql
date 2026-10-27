-- T-09 / D-007 : montants en unités mineures selon l'exposant ISO 4217.
-- Jusqu'ici tous les montants étaient stockés ×100 (« centimes »), y compris
-- en XAF qui n'a pas de sous-unité. On ramène le XAF en francs entiers.
-- EUR/USD (exposant 2) restent en centimes : inchangés.

UPDATE "transactions" SET "amount" = "amount" / 100 WHERE "currency" = 'XAF';
UPDATE "payment_links" SET "amount" = "amount" / 100 WHERE "currency" = 'XAF';

-- Rapprochement : relevés opérateur en XAF.
UPDATE "reconciliation_runs"
   SET "total_statement" = "total_statement" / 100,
       "total_ledger" = "total_ledger" / 100,
       "max_discrepancy" = "max_discrepancy" / 100;
UPDATE "reconciliation_discrepancies"
   SET "ledger_amount" = "ledger_amount" / 100,
       "statement_amount" = "statement_amount" / 100;
