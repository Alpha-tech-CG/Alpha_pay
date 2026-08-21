-- Orchestration (fournisseur de technologie de paiement) : partenaires, routage
-- piloté par données, profils de frais (commission techno), miroir de settlement.
-- AlphaPay ne détient jamais les fonds — ces tables sont des règles/instructions/miroirs.

-- Enums
CREATE TYPE "PartnerType" AS ENUM ('BANK', 'MOBILE_OPERATOR', 'CARD_SCHEME', 'CARD_ISSUER', 'PSP');
CREATE TYPE "PartnerStatus" AS ENUM ('TEST', 'ACTIVE', 'INACTIVE');
CREATE TYPE "PaymentMethodType" AS ENUM ('CARD', 'MOBILE_MONEY', 'BANK_TRANSFER');

-- Partners
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
CREATE UNIQUE INDEX "partners_code_key" ON "partners" ("code");

-- Partner credentials (chiffrés)
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
CREATE UNIQUE INDEX "partner_credentials_partner_id_environment_key_name_key"
    ON "partner_credentials" ("partner_id", "environment", "key_name");
ALTER TABLE "partner_credentials"
    ADD CONSTRAINT "partner_credentials_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partners" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Routing rules
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
CREATE INDEX "routing_rules_enabled_priority_idx" ON "routing_rules" ("enabled", "priority");
ALTER TABLE "routing_rules"
    ADD CONSTRAINT "routing_rules_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partners" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fee profiles + rules (commission technologique)
CREATE TABLE "fee_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fee_profiles_pkey" PRIMARY KEY ("id")
);

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
CREATE INDEX "fee_rules_fee_profile_id_idx" ON "fee_rules" ("fee_profile_id");
ALTER TABLE "fee_rules"
    ADD CONSTRAINT "fee_rules_fee_profile_id_fkey"
    FOREIGN KEY ("fee_profile_id") REFERENCES "fee_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Settlement records (miroir des reversements partenaires)
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
CREATE INDEX "settlement_records_merchant_id_idx" ON "settlement_records" ("merchant_id");
CREATE INDEX "settlement_records_partner_id_idx" ON "settlement_records" ("partner_id");

-- Transaction : traçabilité du routage + commission techno appliquée
ALTER TABLE "transactions" ADD COLUMN "partner_id" TEXT;
ALTER TABLE "transactions" ADD COLUMN "routing_rule_id" TEXT;
ALTER TABLE "transactions" ADD COLUMN "routing_reason" TEXT;
ALTER TABLE "transactions" ADD COLUMN "fee_cents" BIGINT;
CREATE INDEX "transactions_partner_id_idx" ON "transactions" ("partner_id");

-- Merchant : profil de frais appliqué
ALTER TABLE "merchants" ADD COLUMN "fee_profile_id" TEXT;
CREATE INDEX "merchants_fee_profile_id_idx" ON "merchants" ("fee_profile_id");
ALTER TABLE "merchants"
    ADD CONSTRAINT "merchants_fee_profile_id_fkey"
    FOREIGN KEY ("fee_profile_id") REFERENCES "fee_profiles" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
