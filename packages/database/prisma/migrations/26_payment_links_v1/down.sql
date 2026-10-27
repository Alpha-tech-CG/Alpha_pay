-- Migration inverse de 26_payment_links_v1 (manuelle : psql -f down.sql).
-- Les liens à montant libre n'ont pas d'équivalent : ils sont supprimés avant de rétablir NOT NULL.
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_payment_link_id_fkey";
DROP INDEX "transactions_payment_link_id_idx";
ALTER TABLE "transactions" DROP COLUMN "payment_link_id";
DROP INDEX "payment_links_public_code_key";
DELETE FROM "payment_links" WHERE "amount" IS NULL;
ALTER TABLE "payment_links" DROP COLUMN "public_code",
DROP COLUMN "multi_use",
DROP COLUMN "active",
ALTER COLUMN "amount" SET NOT NULL;
