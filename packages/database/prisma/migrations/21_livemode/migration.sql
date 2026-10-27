-- DropIndex
DROP INDEX "webhook_endpoints_merchant_id_idx";

-- DropIndex
DROP INDEX "transactions_merchant_id_external_id_key";

-- DropIndex
DROP INDEX "idempotency_records_merchant_id_idempotency_key_endpoint_key";

-- AlterTable
ALTER TABLE "webhook_endpoints" ADD COLUMN     "livemode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payment_links" ADD COLUMN     "livemode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "idempotency_records" ADD COLUMN     "livemode" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "webhook_endpoints_merchant_id_livemode_idx" ON "webhook_endpoints"("merchant_id", "livemode");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_merchant_id_livemode_external_id_key" ON "transactions"("merchant_id", "livemode", "external_id");

-- CreateIndex
CREATE INDEX "payment_links_merchant_id_livemode_created_at_idx" ON "payment_links"("merchant_id", "livemode", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_merchant_id_livemode_idempotency_key_en_key" ON "idempotency_records"("merchant_id", "livemode", "idempotency_key", "endpoint");

