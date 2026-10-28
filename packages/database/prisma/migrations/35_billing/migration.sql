-- T-81 / T-82 / T-83 : Facturation interne, crédits, contrôle d'accès par palier.

-- ─── Plans tarifaires (T-81) ──────────────────────────────────────────────

CREATE TABLE "billing_plans" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "code"            TEXT        NOT NULL UNIQUE,  -- ex. "starter", "pro", "school"
  "label"           TEXT        NOT NULL,
  "price_monthly"   BIGINT      NOT NULL DEFAULT 0,
  "price_yearly"    BIGINT      NOT NULL DEFAULT 0,
  "currency"        TEXT        NOT NULL DEFAULT 'XAF',
  -- Modules inclus (liste de clés comme "m6_manage","m7_recover","m8_school")
  "included_modules" TEXT[]     NOT NULL DEFAULT '{}',
  -- Crédits offerts à l'activation
  "included_credits" INTEGER    NOT NULL DEFAULT 0,
  "is_active"       BOOLEAN     NOT NULL DEFAULT true,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "billing_plans_pkey" PRIMARY KEY ("id")
);

-- ─── Abonnements (T-81) ───────────────────────────────────────────────────

CREATE TYPE "SubscriptionStatus" AS ENUM (
  'TRIAL',      -- période d'essai (sans paiement)
  'ACTIVE',     -- payé et en cours
  'GRACE',      -- impayé, accès restreint (lecture seule hors encaissements)
  'CANCELED',
  'EXPIRED'
);

CREATE TABLE "subscriptions" (
  "id"              UUID                NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id"     UUID                NOT NULL UNIQUE,
  "plan_id"         UUID                NOT NULL,
  "status"          "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
  "period_start"    DATE                NOT NULL DEFAULT CURRENT_DATE,
  "period_end"      DATE                NOT NULL,
  "canceled_at"     TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ         NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ         NOT NULL DEFAULT now(),
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_plan_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "billing_plans" ("id");

-- ─── Factures AlphaPay (T-81) ──────────────────────────────────────────────

CREATE TABLE "alphapay_invoices" (
  "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id"       UUID        NOT NULL,
  "subscription_id"   UUID,
  "amount"            BIGINT      NOT NULL,
  "currency"          TEXT        NOT NULL DEFAULT 'XAF',
  "status"            TEXT        NOT NULL DEFAULT 'PENDING',  -- PENDING|PAID|VOID
  -- Paiement via AlphaPay lui-même (transaction générée par la plateforme)
  "transaction_id"    UUID,
  "due_date"          DATE        NOT NULL,
  "paid_at"           TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "alphapay_invoices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ap_invoices_merchant_idx" ON "alphapay_invoices" ("merchant_id", "created_at" DESC);

ALTER TABLE "alphapay_invoices"
  ADD CONSTRAINT "ap_invoices_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

ALTER TABLE "alphapay_invoices"
  ADD CONSTRAINT "ap_invoices_subscription_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions" ("id") ON DELETE SET NULL;

-- ─── Packs de crédits (T-82) ──────────────────────────────────────────────

CREATE TABLE "credit_packs" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "code"        TEXT        NOT NULL UNIQUE,  -- ex. "sms_100", "sms_500"
  "label"       TEXT        NOT NULL,
  "credits"     INTEGER     NOT NULL,
  "price"       BIGINT      NOT NULL,
  "currency"    TEXT        NOT NULL DEFAULT 'XAF',
  "is_active"   BOOLEAN     NOT NULL DEFAULT true,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "credit_packs_pkey" PRIMARY KEY ("id")
);

-- ─── Registre des crédits (T-82, append-only) ─────────────────────────────

CREATE TABLE "credit_ledger" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id" UUID        NOT NULL,
  "delta"       INTEGER     NOT NULL,  -- positif = crédit, négatif = débit
  "reason"      TEXT        NOT NULL,  -- "pack_purchase", "plan_included", "sms_send", etc.
  "ref_id"      UUID,                  -- id du pack ou du message associé
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credit_ledger_merchant_idx" ON "credit_ledger" ("merchant_id", "created_at" DESC);

ALTER TABLE "credit_ledger"
  ADD CONSTRAINT "credit_ledger_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

-- Vue matérialisée du solde (recalculable)
-- Le solde courant se calcule : SELECT SUM(delta) FROM credit_ledger WHERE merchant_id = $1

-- ─── Modules AlphaPay (T-83) ──────────────────────────────────────────────

-- Liste des clés de module attendues en base. Les marchands sans accès voient
-- le module verrouillé mais visible ; la lecture seule s'applique en GRACE.
-- (Pas de table séparée : les modules sont dans billing_plans.included_modules.)
