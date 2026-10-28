-- T-70 à T-95 (M6 Gérer, M7 Recouvrer, M8 École, M11 Facturation, M12 personnel AlphaPay) : tables et types.
-- Remplace les migrations 30 à 37 écrites à la main, qui ne s'appliquaient sur aucune base
-- (colonnes UUID face aux identifiants TEXT, recréation de credit_ledger, triggers d'audit déjà posés en 23). D-052.
-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "ReconciliationDayStatus" AS ENUM ('PENDING', 'OK', 'DISCREPANCY');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIAL', 'PAID', 'VOID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'GRACE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('SUPPORT', 'COMPLIANCE', 'SUPER_ADMIN');

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
    "format" "ExportFormat" NOT NULL DEFAULT 'CSV',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "row_count" INTEGER,
    "file_key" TEXT,
    "download_url" TEXT,
    "url_expires_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_days" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "till_id" TEXT,
    "entry_date" DATE NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReconciliationDayStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "digital_count" INTEGER NOT NULL DEFAULT 0,
    "digital_amount" BIGINT NOT NULL DEFAULT 0,
    "cash_amount" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "statement_lines" INTEGER,
    "statement_amount" BIGINT,
    "statement_csv_key" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "reconciliation_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_entries" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "till_id" TEXT,
    "member_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "entry_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "cash_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_counters" (
    "merchant_id" TEXT NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("merchant_id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "number" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "tax_amount" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "amount_paid" BIGINT NOT NULL DEFAULT 0,
    "amount_due" BIGINT NOT NULL DEFAULT 0,
    "issue_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" DATE,
    "notes" TEXT,
    "footer" TEXT,
    "payment_link_id" TEXT,
    "pdf_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amount" BIGINT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_installments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "paid_amount" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payment_link_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "invoice_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_reminders" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "installment_id" TEXT,
    "channel" "ReminderChannel" NOT NULL DEFAULT 'SMS',
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "days_offset" INTEGER NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "invoice_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "transaction_id" TEXT,
    "number" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "pdf_key" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_years" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "school_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_classes" (
    "id" TEXT NOT NULL,
    "school_year_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "school_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "school_class_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" DATE,
    "gender" TEXT,
    "registration_no" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "relation" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_grids" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "school_year_id" TEXT NOT NULL,
    "school_class_id" TEXT,
    "label" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "fee_grids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_grid_lines" (
    "id" TEXT NOT NULL,
    "fee_grid_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "due_date" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

CONSTRAINT "fee_grid_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_fee_schedules" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "fee_grid_line_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "amount" BIGINT NOT NULL,
    "amount_paid" BIGINT NOT NULL DEFAULT 0,
    "due_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "student_fee_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price_monthly" BIGINT NOT NULL DEFAULT 0,
    "price_yearly" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "included_modules" TEXT[],
    "included_credits" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "billing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alphapay_invoices" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "transaction_id" TEXT,
    "due_date" DATE NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "alphapay_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_packs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "price" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "credit_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'SUPPORT',
    "password_hash" TEXT NOT NULL,
    "totp_secret_enc" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_sessions" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "staff_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_access_log" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_id" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "staff_access_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "export_jobs_merchant_id_created_at_idx" ON "export_jobs"("merchant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reconciliation_days_merchant_id_livemode_entry_date_idx" ON "reconciliation_days"("merchant_id", "livemode", "entry_date" DESC);

-- CreateIndex
CREATE INDEX "cash_entries_merchant_id_livemode_entry_date_idx" ON "cash_entries"("merchant_id", "livemode", "entry_date" DESC);

-- CreateIndex
CREATE INDEX "cash_entries_till_id_livemode_entry_date_idx" ON "cash_entries"("till_id", "livemode", "entry_date" DESC);

-- CreateIndex
CREATE INDEX "customers_merchant_id_created_at_idx" ON "customers"("merchant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "invoices_merchant_id_created_at_idx" ON "invoices"("merchant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "invoices_customer_id_created_at_idx" ON "invoices"("customer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "invoices_merchant_id_status_idx" ON "invoices"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_sort_order_idx" ON "invoice_lines"("invoice_id", "sort_order");

-- CreateIndex
CREATE INDEX "invoice_installments_invoice_id_due_date_idx" ON "invoice_installments"("invoice_id", "due_date");

-- CreateIndex
CREATE INDEX "invoice_reminders_scheduled_for_idx" ON "invoice_reminders"("scheduled_for");

-- CreateIndex
CREATE INDEX "receipts_merchant_id_created_at_idx" ON "receipts"("merchant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "school_years_merchant_id_idx" ON "school_years"("merchant_id");

-- CreateIndex
CREATE INDEX "school_classes_school_year_id_idx" ON "school_classes"("school_year_id");

-- CreateIndex
CREATE INDEX "students_merchant_id_idx" ON "students"("merchant_id");

-- CreateIndex
CREATE INDEX "students_school_class_id_idx" ON "students"("school_class_id");

-- CreateIndex
CREATE INDEX "guardians_student_id_idx" ON "guardians"("student_id");

-- CreateIndex
CREATE INDEX "fee_grids_school_year_id_idx" ON "fee_grids"("school_year_id");

-- CreateIndex
CREATE INDEX "fee_grids_school_class_id_idx" ON "fee_grids"("school_class_id");

-- CreateIndex
CREATE INDEX "fee_grid_lines_fee_grid_id_sort_order_idx" ON "fee_grid_lines"("fee_grid_id", "sort_order");

-- CreateIndex
CREATE INDEX "student_fee_schedules_student_id_idx" ON "student_fee_schedules"("student_id");

-- CreateIndex
CREATE INDEX "student_fee_schedules_merchant_id_status_idx" ON "student_fee_schedules"("merchant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_plans_code_key" ON "billing_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_merchant_id_key" ON "subscriptions"("merchant_id");

-- CreateIndex
CREATE INDEX "alphapay_invoices_merchant_id_created_at_idx" ON "alphapay_invoices"("merchant_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "credit_packs_code_key" ON "credit_packs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_sessions_token_hash_key" ON "staff_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "staff_sessions_staff_id_idx" ON "staff_sessions"("staff_id");

-- CreateIndex
CREATE INDEX "staff_sessions_expires_at_idx" ON "staff_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "staff_access_log_staff_id_created_at_idx" ON "staff_access_log"("staff_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "staff_access_log_target_id_created_at_idx" ON "staff_access_log"("target_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "merchant_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_days" ADD CONSTRAINT "reconciliation_days_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_days" ADD CONSTRAINT "reconciliation_days_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "merchant_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "merchant_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_installments" ADD CONSTRAINT "invoice_installments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "invoice_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_classes" ADD CONSTRAINT "school_classes_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_classes" ADD CONSTRAINT "school_classes_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_class_id_fkey" FOREIGN KEY ("school_class_id") REFERENCES "school_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_grids" ADD CONSTRAINT "fee_grids_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_grids" ADD CONSTRAINT "fee_grids_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_grids" ADD CONSTRAINT "fee_grids_school_class_id_fkey" FOREIGN KEY ("school_class_id") REFERENCES "school_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_grid_lines" ADD CONSTRAINT "fee_grid_lines_fee_grid_id_fkey" FOREIGN KEY ("fee_grid_id") REFERENCES "fee_grids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_schedules" ADD CONSTRAINT "student_fee_schedules_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_schedules" ADD CONSTRAINT "student_fee_schedules_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_schedules" ADD CONSTRAINT "student_fee_schedules_fee_grid_line_id_fkey" FOREIGN KEY ("fee_grid_line_id") REFERENCES "fee_grid_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "billing_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alphapay_invoices" ADD CONSTRAINT "alphapay_invoices_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alphapay_invoices" ADD CONSTRAINT "alphapay_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_access_log" ADD CONSTRAINT "staff_access_log_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Contraintes non exprimables dans le schéma Prisma ───────────────────────
-- Montant du cash déclaré jamais négatif.
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_amount_non_negative" CHECK ("amount" >= 0);

-- Un seul jour de rapprochement par (marchand, caisse, date, mode) ; la ligne
-- « toutes caisses » (till_id nul) est unique par (marchand, date, mode).
CREATE UNIQUE INDEX "reconciliation_days_unique_idx" ON "reconciliation_days" ("merchant_id", "till_id", "entry_date", "livemode") WHERE "till_id" IS NOT NULL;
CREATE UNIQUE INDEX "reconciliation_days_notill_unique_idx" ON "reconciliation_days" ("merchant_id", "entry_date", "livemode") WHERE "till_id" IS NULL;

-- File des relances à envoyer.
CREATE INDEX "invoice_reminders_pending_idx" ON "invoice_reminders" ("scheduled_for") WHERE "status" = 'PENDING';
