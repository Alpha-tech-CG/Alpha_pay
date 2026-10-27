-- Migration inverse de 21_livemode (manuelle : psql -f down.sql).
-- DropIndex
DROP INDEX "webhook_endpoints_merchant_id_livemode_idx";

-- DropIndex
DROP INDEX "transactions_merchant_id_livemode_external_id_key";

-- DropIndex
DROP INDEX "payment_links_merchant_id_livemode_created_at_idx";

-- DropIndex
DROP INDEX "idempotency_records_merchant_id_livemode_idempotency_key_en_key";

-- AlterTable
ALTER TABLE "webhook_endpoints" DROP COLUMN "livemode";

-- AlterTable
ALTER TABLE "payment_links" DROP COLUMN "livemode";

-- AlterTable
ALTER TABLE "idempotency_records" DROP COLUMN "livemode";

-- CreateIndex
CREATE INDEX "webhook_endpoints_merchant_id_idx" ON "webhook_endpoints"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_merchant_id_external_id_key" ON "transactions"("merchant_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_merchant_id_idempotency_key_endpoint_key" ON "idempotency_records"("merchant_id", "idempotency_key", "endpoint");

