-- Migration inverse de 18_remove_fund_holding (manuelle : psql -f down.sql).
-- Recrée tables et colonnes vides ; les triggers et la vue du grand livre sont dans 01_ledger_immutability.

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE', 'EQUITY');

-- CreateEnum
CREATE TYPE "EntryDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "SettlementFrequency" AS ENUM ('DAILY', 'T1', 'T2', 'WEEKLY');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING_VALIDATION', 'INITIATED', 'SENT', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "SettlementPayoutMethod" AS ENUM ('BANK', 'MOMO');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CLIENT', 'MERCHANT', 'MERCHANT_CASHIER', 'ADMIN_STAFF');

-- CreateEnum
CREATE TYPE "WalletStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('CASH_IN', 'PAY', 'CASH_OUT', 'P2P_SEND', 'P2P_RECEIVE', 'REFUND');

-- CreateEnum
CREATE TYPE "WalletKycLevel" AS ENUM ('N0', 'N1', 'N2');

-- CreateEnum
CREATE TYPE "WalletKycDocType" AS ENUM ('ID_FRONT', 'ID_BACK', 'SELFIE');

-- CreateEnum
CREATE TYPE "WalletKycDocStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('BANK', 'MOBILE_OPERATOR', 'CARD_SCHEME', 'CARD_ISSUER', 'PSP');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('TEST', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('CARD', 'MOBILE_MONEY', 'BANK_TRANSFER');

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "fee_profile_id" TEXT;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "fee_cents" BIGINT,
ADD COLUMN     "partner_id" TEXT,
ADD COLUMN     "routing_reason" TEXT,
ADD COLUMN     "routing_rule_id" TEXT;

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "balance_cents" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "role" "UserRole" NOT NULL DEFAULT 'CLIENT',
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "kyc_level" "WalletKycLevel" NOT NULL DEFAULT 'N0',
    "full_name" TEXT,
    "push_token" TEXT,
    "merchant_id" TEXT,
    "otp_hash" TEXT,
    "otp_expires_at" TIMESTAMP(3),
    "otp_attempts" INTEGER NOT NULL DEFAULT 0,
    "failed_pin_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "balance_before" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "operator_ref" TEXT,
    "merchant_id" TEXT,
    "peer_wallet_id" TEXT,
    "idempotency_key" TEXT,
    "qr_nonce" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_limits" (
    "level" "WalletKycLevel" NOT NULL,
    "max_balance_cents" BIGINT NOT NULL,
    "per_tx_cents" BIGINT NOT NULL,
    "daily_cents" BIGINT NOT NULL,
    "monthly_cents" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_limits_pkey" PRIMARY KEY ("level")
);

-- CreateTable
CREATE TABLE "wallet_kyc_documents" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "type" "WalletKycDocType" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" "WalletKycDocStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "review_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_settlement_configs" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "frequency" "SettlementFrequency" NOT NULL DEFAULT 'T1',
    "min_amount_cents" BIGINT NOT NULL DEFAULT 0,
    "commission_bps" INTEGER NOT NULL DEFAULT 150,
    "day_of_week" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "payout_method" "SettlementPayoutMethod" NOT NULL DEFAULT 'MOMO',
    "payout_provider" TEXT,
    "payout_destination_encrypted" BYTEA,
    "settlement_currency" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_settlement_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_batches" (
    "id" TEXT NOT NULL,
    "batch_number" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "gross_cents" BIGINT NOT NULL,
    "commission_cents" BIGINT NOT NULL,
    "holds_cents" BIGINT NOT NULL DEFAULT 0,
    "net_cents" BIGINT NOT NULL,
    "settlement_currency" TEXT,
    "settled_net_cents" BIGINT,
    "fx_rate" DECIMAL(20,10),
    "status" "SettlementStatus" NOT NULL DEFAULT 'INITIATED',
    "requires_double_validation" BOOLEAN NOT NULL DEFAULT false,
    "validated_by" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "payout_provider" TEXT,
    "external_reference" TEXT,
    "receipt_pdf_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_audits" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_reconciliation_runs" (
    "id" TEXT NOT NULL,
    "run_date" TIMESTAMP(3) NOT NULL,
    "wallet_count" INTEGER NOT NULL,
    "total_balance_cents" BIGINT NOT NULL,
    "expected_balance_cents" BIGINT NOT NULL,
    "drift_cents" BIGINT NOT NULL,
    "cash_in_cents" BIGINT NOT NULL,
    "cash_out_cents" BIGINT NOT NULL,
    "pay_cents" BIGINT NOT NULL,
    "float_exposure_cents" BIGINT NOT NULL,
    "inconsistent_wallet_count" INTEGER NOT NULL DEFAULT 0,
    "alert" BOOLEAN NOT NULL DEFAULT false,
    "report_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "direction" "EntryDirection" NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT,
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_balance_snapshots" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "balance" BIGINT NOT NULL,
    "as_of_sequence" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_balance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_rates" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PartnerType" NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PartnerStatus" NOT NULL DEFAULT 'TEST',
    "sandbox_base_url" TEXT,
    "prod_base_url" TEXT,
    "timeout_ms" INTEGER NOT NULL DEFAULT 15000,
    "max_retries" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_credentials" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "key_name" TEXT NOT NULL,
    "value_encrypted" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "country" TEXT,
    "currency" TEXT,
    "method" "PaymentMethodType",
    "min_amount_cents" BIGINT,
    "max_amount_cents" BIGINT,
    "merchant_segment" TEXT,
    "bin_prefix" TEXT,
    "partner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_rules" (
    "id" TEXT NOT NULL,
    "fee_profile_id" TEXT NOT NULL,
    "method" "PaymentMethodType",
    "partner_id" TEXT,
    "min_amount_cents" BIGINT,
    "max_amount_cents" BIGINT,
    "percent_bps" INTEGER NOT NULL DEFAULT 0,
    "fixed_cents" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XAF',

    CONSTRAINT "fee_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_records" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "external_ref" TEXT,
    "gross_cents" BIGINT NOT NULL,
    "fee_cents" BIGINT NOT NULL,
    "net_cents" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallets_phone_key" ON "wallets"("phone");

-- CreateIndex
CREATE INDEX "wallets_phone_idx" ON "wallets"("phone");

-- CreateIndex
CREATE INDEX "wallets_merchant_id_idx" ON "wallets"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_qr_nonce_key" ON "wallet_transactions"("qr_nonce");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_transactions_merchant_id_idx" ON "wallet_transactions"("merchant_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_status_idx" ON "wallet_transactions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_wallet_id_idempotency_key_key" ON "wallet_transactions"("wallet_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_kyc_documents_wallet_id_idx" ON "wallet_kyc_documents"("wallet_id");

-- CreateIndex
CREATE INDEX "wallet_kyc_documents_status_idx" ON "wallet_kyc_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_settlement_configs_merchant_id_key" ON "merchant_settlement_configs"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_batches_batch_number_key" ON "settlement_batches"("batch_number");

-- CreateIndex
CREATE INDEX "settlement_batches_merchant_id_status_idx" ON "settlement_batches"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "settlement_audits_batch_id_idx" ON "settlement_audits"("batch_id");

-- CreateIndex
CREATE INDEX "wallet_reconciliation_runs_run_date_idx" ON "wallet_reconciliation_runs"("run_date");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_merchant_id_name_key" ON "ledger_accounts"("merchant_id", "name");

-- CreateIndex
CREATE INDEX "journal_entries_account_id_idx" ON "journal_entries"("account_id");

-- CreateIndex
CREATE INDEX "journal_entries_transaction_id_idx" ON "journal_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "journal_entries_sequence_idx" ON "journal_entries"("sequence");

-- CreateIndex
CREATE INDEX "ledger_balance_snapshots_account_id_as_of_sequence_idx" ON "ledger_balance_snapshots"("account_id", "as_of_sequence");

-- CreateIndex
CREATE UNIQUE INDEX "currency_rates_base_quote_key" ON "currency_rates"("base", "quote");

-- CreateIndex
CREATE UNIQUE INDEX "partners_code_key" ON "partners"("code");

-- CreateIndex
CREATE UNIQUE INDEX "partner_credentials_partner_id_environment_key_name_key" ON "partner_credentials"("partner_id", "environment", "key_name");

-- CreateIndex
CREATE INDEX "routing_rules_enabled_priority_idx" ON "routing_rules"("enabled", "priority");

-- CreateIndex
CREATE INDEX "fee_rules_fee_profile_id_idx" ON "fee_rules"("fee_profile_id");

-- CreateIndex
CREATE INDEX "settlement_records_merchant_id_idx" ON "settlement_records"("merchant_id");

-- CreateIndex
CREATE INDEX "settlement_records_partner_id_idx" ON "settlement_records"("partner_id");

-- CreateIndex
CREATE INDEX "merchants_fee_profile_id_idx" ON "merchants"("fee_profile_id");

-- CreateIndex
CREATE INDEX "transactions_partner_id_idx" ON "transactions"("partner_id");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_peer_wallet_id_fkey" FOREIGN KEY ("peer_wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_kyc_documents" ADD CONSTRAINT "wallet_kyc_documents_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_fee_profile_id_fkey" FOREIGN KEY ("fee_profile_id") REFERENCES "fee_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_audits" ADD CONSTRAINT "settlement_audits_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "settlement_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_balance_snapshots" ADD CONSTRAINT "ledger_balance_snapshots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_credentials" ADD CONSTRAINT "partner_credentials_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_rules" ADD CONSTRAINT "fee_rules_fee_profile_id_fkey" FOREIGN KEY ("fee_profile_id") REFERENCES "fee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

