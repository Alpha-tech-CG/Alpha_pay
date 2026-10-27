-- T-20 : messages, modèles versionnés, préférences, désabonnements, audit OTP, registre de crédits.
-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MessageCategory" AS ENUM ('TRANSACTIONAL', 'OTP', 'MARKETING');

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "version" INTEGER NOT NULL,
    "category" "MessageCategory" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "whatsapp_template_name" TEXT,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "channel" "MessageChannel" NOT NULL,
    "category" "MessageCategory" NOT NULL,
    "template_key" TEXT,
    "template_version" INTEGER,
    "destination_hash" BYTEA NOT NULL,
    "destination_masked" TEXT NOT NULL,
    "contact_enc" BYTEA,
    "subject" TEXT,
    "variables_enc" BYTEA,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "provider_message_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" TEXT,
    "cost_minor" BIGINT,
    "cost_currency" TEXT,
    "credits_charged" INTEGER NOT NULL DEFAULT 0,
    "fallback_channels" "MessageChannel"[] DEFAULT ARRAY[]::"MessageChannel"[],
    "fallback_of_id" TEXT,
    "group_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_preferences" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT,
    "destination_hash" BYTEA NOT NULL,
    "preferred_channels" "MessageChannel"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opt_outs" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "destination_hash" BYTEA NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opt_outs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_audit" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "purpose" TEXT NOT NULL,
    "channel" "MessageChannel",
    "destination_hash" BYTEA NOT NULL,
    "destination_masked" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "ip_hash" BYTEA,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_templates_key_channel_locale_active_idx" ON "message_templates"("key", "channel", "locale", "active");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_key_channel_locale_version_key" ON "message_templates"("key", "channel", "locale", "version");

-- CreateIndex
CREATE INDEX "messages_merchant_id_livemode_created_at_idx" ON "messages"("merchant_id", "livemode", "created_at");

-- CreateIndex
CREATE INDEX "messages_provider_provider_message_id_idx" ON "messages"("provider", "provider_message_id");

-- CreateIndex
CREATE INDEX "messages_status_created_at_idx" ON "messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "messages_group_id_idx" ON "messages"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_preferences_merchant_id_destination_hash_key" ON "message_preferences"("merchant_id", "destination_hash");

-- CreateIndex
CREATE UNIQUE INDEX "opt_outs_merchant_id_channel_destination_hash_key" ON "opt_outs"("merchant_id", "channel", "destination_hash");

-- CreateIndex
CREATE INDEX "otp_audit_destination_hash_created_at_idx" ON "otp_audit"("destination_hash", "created_at");

-- CreateIndex
CREATE INDEX "otp_audit_merchant_id_livemode_created_at_idx" ON "otp_audit"("merchant_id", "livemode", "created_at");

-- CreateIndex
CREATE INDEX "credit_ledger_merchant_id_livemode_created_at_idx" ON "credit_ledger"("merchant_id", "livemode", "created_at");

-- CreateIndex
CREATE INDEX "credit_ledger_message_id_idx" ON "credit_ledger"("message_id");

-- Le registre de crédits est en ajout seul (§6) : ni mise à jour ni suppression.
CREATE OR REPLACE FUNCTION alphapay_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% est en ajout seul : % interdit', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER credit_ledger_no_update BEFORE UPDATE ON "credit_ledger"
  FOR EACH ROW EXECUTE FUNCTION alphapay_append_only();
CREATE TRIGGER credit_ledger_no_delete BEFORE DELETE ON "credit_ledger"
  FOR EACH ROW EXECUTE FUNCTION alphapay_append_only();
