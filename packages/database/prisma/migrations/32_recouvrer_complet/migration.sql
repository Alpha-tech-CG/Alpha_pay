-- 32 : Recouvrer (M7) et Pack École (M8) complets.
-- Numérotation sans trou par type de document ET par mode (un reçu de test ne
-- crée jamais de trou dans la série live) ; un reçu par paiement ; canaux des
-- clients ; réglages de relance ; liens élève, responsable, versement.

-- DropForeignKey
ALTER TABLE "invoice_counters" DROP CONSTRAINT "invoice_counters_merchant_id_fkey";

-- DropIndex
DROP INDEX "customers_merchant_id_created_at_idx";

-- DropIndex
DROP INDEX "invoices_merchant_id_created_at_idx";

-- DropIndex
DROP INDEX "invoices_merchant_id_status_idx";

-- DropIndex
DROP INDEX "invoice_reminders_scheduled_for_idx";

-- DropIndex
DROP INDEX "receipts_merchant_id_created_at_idx";

-- DropIndex
DROP INDEX "student_fee_schedules_student_id_idx";

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "livemode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "preferred_channels" "ReminderChannel"[] NOT NULL DEFAULT ARRAY['SMS']::"ReminderChannel"[];

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "sent_at" TIMESTAMP(3),
ADD COLUMN     "student_id" TEXT;

-- AlterTable
ALTER TABLE "invoice_installments" ADD COLUMN     "label" TEXT,
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "description" TEXT,
ADD COLUMN     "installment_id" TEXT,
ADD COLUMN     "payer_name" TEXT;

-- AlterTable
ALTER TABLE "guardians" ADD COLUMN     "customer_id" TEXT;

-- AlterTable
ALTER TABLE "student_fee_schedules" ADD COLUMN     "installment_id" TEXT;

-- CreateTable
CREATE TABLE "document_counters" (
    "merchant_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("merchant_id","kind","livemode")
);

-- CreateTable
CREATE TABLE "recovery_settings" (
    "merchant_id" TEXT NOT NULL,
    "reminder_offsets" INTEGER[] NOT NULL DEFAULT ARRAY[-3, 0, 3, 7]::INTEGER[],
    "reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "send_from_hour" INTEGER NOT NULL DEFAULT 8,
    "send_until_hour" INTEGER NOT NULL DEFAULT 19,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recovery_settings_pkey" PRIMARY KEY ("merchant_id")
);

-- Reprise des compteurs de factures existants (mode test : seul mode utilisé jusqu'ici).
INSERT INTO "document_counters" ("merchant_id", "kind", "livemode", "last_seq")
SELECT "merchant_id", 'invoice', false, "last_seq" FROM "invoice_counters";

-- DropTable
DROP TABLE "invoice_counters";

-- CreateIndex
CREATE INDEX "customers_merchant_id_livemode_created_at_idx" ON "customers"("merchant_id", "livemode", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_payment_link_id_key" ON "invoices"("payment_link_id");

-- CreateIndex
CREATE INDEX "invoices_merchant_id_livemode_created_at_idx" ON "invoices"("merchant_id", "livemode", "created_at" DESC);

-- CreateIndex
CREATE INDEX "invoices_merchant_id_livemode_status_idx" ON "invoices"("merchant_id", "livemode", "status");

-- CreateIndex
CREATE INDEX "invoices_student_id_idx" ON "invoices"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_merchant_id_livemode_number_key" ON "invoices"("merchant_id", "livemode", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_installments_payment_link_id_key" ON "invoice_installments"("payment_link_id");

-- CreateIndex
CREATE INDEX "invoice_reminders_status_scheduled_for_idx" ON "invoice_reminders"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "invoice_reminders_invoice_id_status_idx" ON "invoice_reminders"("invoice_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_transaction_id_key" ON "receipts"("transaction_id");

-- CreateIndex
CREATE INDEX "receipts_merchant_id_livemode_created_at_idx" ON "receipts"("merchant_id", "livemode", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "receipts_merchant_id_livemode_number_key" ON "receipts"("merchant_id", "livemode", "number");

-- CreateIndex
CREATE UNIQUE INDEX "students_merchant_id_registration_no_key" ON "students"("merchant_id", "registration_no");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_schedules_student_id_fee_grid_line_id_key" ON "student_fee_schedules"("student_id", "fee_grid_line_id");

-- AddForeignKey
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_settings" ADD CONSTRAINT "recovery_settings_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "invoice_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_schedules" ADD CONSTRAINT "student_fee_schedules_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "invoice_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Plage horaire cohérente (heures pleines, fin exclue).
ALTER TABLE "recovery_settings" ADD CONSTRAINT "recovery_settings_hours_check"
  CHECK ("send_from_hour" BETWEEN 0 AND 23 AND "send_until_hour" BETWEEN 1 AND 24 AND "send_from_hour" < "send_until_hour");
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_kind_check" CHECK ("kind" IN ('invoice', 'receipt'));
