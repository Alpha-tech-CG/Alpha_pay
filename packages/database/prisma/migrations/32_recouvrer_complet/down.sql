-- Migration inverse de 32_recouvrer_complet (manuelle : psql -f down.sql).
CREATE TABLE "invoice_counters" (
    "merchant_id" TEXT NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,
CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("merchant_id")
);
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "invoice_counters" ("merchant_id", "last_seq")
SELECT "merchant_id", MAX("last_seq") FROM "document_counters" WHERE "kind" = 'invoice' GROUP BY "merchant_id";

DROP TABLE IF EXISTS "document_counters";
DROP TABLE IF EXISTS "recovery_settings";

ALTER TABLE "student_fee_schedules" DROP CONSTRAINT IF EXISTS "student_fee_schedules_installment_id_fkey";
ALTER TABLE "guardians" DROP CONSTRAINT IF EXISTS "guardians_customer_id_fkey";
ALTER TABLE "receipts" DROP CONSTRAINT IF EXISTS "receipts_installment_id_fkey";
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_student_id_fkey";

DROP INDEX IF EXISTS "student_fee_schedules_student_id_fee_grid_line_id_key";
DROP INDEX IF EXISTS "students_merchant_id_registration_no_key";
DROP INDEX IF EXISTS "receipts_merchant_id_livemode_number_key";
DROP INDEX IF EXISTS "receipts_merchant_id_livemode_created_at_idx";
DROP INDEX IF EXISTS "receipts_transaction_id_key";
DROP INDEX IF EXISTS "invoice_reminders_invoice_id_status_idx";
DROP INDEX IF EXISTS "invoice_reminders_status_scheduled_for_idx";
DROP INDEX IF EXISTS "invoice_installments_payment_link_id_key";
DROP INDEX IF EXISTS "invoices_merchant_id_livemode_number_key";
DROP INDEX IF EXISTS "invoices_student_id_idx";
DROP INDEX IF EXISTS "invoices_merchant_id_livemode_status_idx";
DROP INDEX IF EXISTS "invoices_merchant_id_livemode_created_at_idx";
DROP INDEX IF EXISTS "invoices_payment_link_id_key";
DROP INDEX IF EXISTS "customers_merchant_id_livemode_created_at_idx";

ALTER TABLE "student_fee_schedules" DROP COLUMN IF EXISTS "installment_id";
ALTER TABLE "guardians" DROP COLUMN IF EXISTS "customer_id";
ALTER TABLE "receipts" DROP COLUMN IF EXISTS "description", DROP COLUMN IF EXISTS "installment_id", DROP COLUMN IF EXISTS "payer_name";
ALTER TABLE "invoice_installments" DROP COLUMN IF EXISTS "label", DROP COLUMN IF EXISTS "paid_at", DROP COLUMN IF EXISTS "position";
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "paid_at", DROP COLUMN IF EXISTS "sent_at", DROP COLUMN IF EXISTS "student_id";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "livemode", DROP COLUMN IF EXISTS "notes", DROP COLUMN IF EXISTS "preferred_channels";

CREATE INDEX "student_fee_schedules_student_id_idx" ON "student_fee_schedules"("student_id");
CREATE INDEX "receipts_merchant_id_created_at_idx" ON "receipts"("merchant_id", "created_at" DESC);
CREATE INDEX "invoice_reminders_scheduled_for_idx" ON "invoice_reminders"("scheduled_for");
CREATE INDEX "invoices_merchant_id_status_idx" ON "invoices"("merchant_id", "status");
CREATE INDEX "invoices_merchant_id_created_at_idx" ON "invoices"("merchant_id", "created_at" DESC);
CREATE INDEX "customers_merchant_id_created_at_idx" ON "customers"("merchant_id", "created_at" DESC);
