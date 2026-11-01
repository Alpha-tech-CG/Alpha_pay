-- 34 : espace particulier (D-065) : budget, enveloppes, épargne suivie, identifiant
-- AlphaPay, envois déclarés et demandes de paiement. AlphaPay ne détient aucun fonds.

-- CreateEnum
CREATE TYPE "PersonalAccountKind" AS ENUM ('MTN_MOMO', 'AIRTEL_MONEY', 'BANK', 'CARD', 'CASH');

-- CreateEnum
CREATE TYPE "BudgetDirection" AS ENUM ('OUT', 'IN');

-- CreateEnum
CREATE TYPE "BudgetEntrySource" AS ENUM ('MANUAL', 'ALPHAPAY_PAYMENT', 'ALPHAPAY_TRANSFER');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DECLARED', 'CONFIRMED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentRequestStatus" AS ENUM ('OPEN', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "personal_profiles" (
    "user_id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "monthly_income" BIGINT,
    "income_irregular" BOOLEAN NOT NULL DEFAULT false,
    "round_up_enabled" BOOLEAN NOT NULL DEFAULT false,
    "round_up_to" INTEGER NOT NULL DEFAULT 1000,
    "round_up_goal_id" TEXT,
    "onboarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "personal_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "PersonalAccountKind" NOT NULL,
    "label" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envelopes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "planned" BIGINT NOT NULL DEFAULT 0,
    "alert_threshold" INTEGER NOT NULL DEFAULT 80,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT,
    "envelope_id" TEXT,
    "direction" "BudgetDirection" NOT NULL,
    "amount" BIGINT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "source" "BudgetEntrySource" NOT NULL DEFAULT 'MANUAL',
    "source_ref" TEXT,
    "round_up" BIGINT NOT NULL DEFAULT 0,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "envelope_id" TEXT,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_goals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "target" BIGINT NOT NULL,
    "saved" BIGINT NOT NULL DEFAULT 0,
    "target_date" DATE,
    "last_milestone" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_contributions" (
    "id" TEXT NOT NULL,
    "goal_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_transfers" (
    "id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "receiver_user_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "note" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'DECLARED',
    "idempotency_key" TEXT NOT NULL,
    "sender_envelope_id" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "personal_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" TEXT NOT NULL,
    "requester_user_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'OPEN',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_alerts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_profiles_handle_key" ON "personal_profiles"("handle");

-- CreateIndex
CREATE INDEX "personal_accounts_user_id_idx" ON "personal_accounts"("user_id");

-- CreateIndex
CREATE INDEX "envelopes_user_id_idx" ON "envelopes"("user_id");

-- CreateIndex
CREATE INDEX "budget_entries_user_id_occurred_at_idx" ON "budget_entries"("user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "budget_entries_user_id_source_source_ref_key" ON "budget_entries"("user_id", "source", "source_ref");

-- CreateIndex
CREATE UNIQUE INDEX "category_rules_user_id_pattern_key" ON "category_rules"("user_id", "pattern");

-- CreateIndex
CREATE INDEX "savings_goals_user_id_idx" ON "savings_goals"("user_id");

-- CreateIndex
CREATE INDEX "goal_contributions_goal_id_idx" ON "goal_contributions"("goal_id");

-- CreateIndex
CREATE INDEX "personal_transfers_receiver_user_id_idx" ON "personal_transfers"("receiver_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "personal_transfers_sender_user_id_idempotency_key_key" ON "personal_transfers"("sender_user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_requests_code_key" ON "payment_requests"("code");

-- CreateIndex
CREATE INDEX "payment_requests_requester_user_id_idx" ON "payment_requests"("requester_user_id");

-- CreateIndex
CREATE INDEX "personal_alerts_user_id_created_at_idx" ON "personal_alerts"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "personal_alerts_user_id_dedup_key_key" ON "personal_alerts"("user_id", "dedup_key");

-- AddForeignKey
ALTER TABLE "personal_profiles" ADD CONSTRAINT "personal_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "savings_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

