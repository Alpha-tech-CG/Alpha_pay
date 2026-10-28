-- T-72 : Rapprochement journalier par caisse (§M6).
-- Une ligne par (till, date, livemode). Le marchand (comptable, admin) note
-- le statut après comparaison des totaux AlphaPay avec ses propres relevés.

CREATE TYPE "ReconciliationDayStatus" AS ENUM (
  'PENDING',    -- non encore vérifié
  'OK',         -- totaux concordants
  'DISCREPANCY' -- écart constaté
);

CREATE TABLE "reconciliation_days" (
  "id"                UUID                        NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id"       UUID                        NOT NULL,
  "till_id"           UUID,
  "entry_date"        DATE                        NOT NULL,
  "livemode"          BOOLEAN                     NOT NULL DEFAULT false,
  "status"            "ReconciliationDayStatus"   NOT NULL DEFAULT 'PENDING',
  "comment"           TEXT,
  -- Totaux calculés depuis les transactions + cash déclaré
  "digital_count"     INTEGER                     NOT NULL DEFAULT 0,
  "digital_amount"    BIGINT                      NOT NULL DEFAULT 0,
  "cash_amount"       BIGINT                      NOT NULL DEFAULT 0,
  "currency"          VARCHAR(3)                  NOT NULL DEFAULT 'XAF',
  -- Données importées depuis le relevé CSV du marchand (optionnel)
  "statement_lines"   INTEGER,
  "statement_amount"  BIGINT,
  "statement_csv_key" TEXT,
  "reviewed_by_id"    UUID,
  "reviewed_at"       TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ                 NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ                 NOT NULL DEFAULT now(),

  CONSTRAINT "reconciliation_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reconciliation_days_unique_idx"
  ON "reconciliation_days" ("merchant_id", "till_id", "entry_date", "livemode")
  WHERE "till_id" IS NOT NULL;

CREATE UNIQUE INDEX "reconciliation_days_notill_unique_idx"
  ON "reconciliation_days" ("merchant_id", "entry_date", "livemode")
  WHERE "till_id" IS NULL;

CREATE INDEX "reconciliation_days_merchant_date_idx"
  ON "reconciliation_days" ("merchant_id", "livemode", "entry_date" DESC);

ALTER TABLE "reconciliation_days"
  ADD CONSTRAINT "reconciliation_days_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

ALTER TABLE "reconciliation_days"
  ADD CONSTRAINT "reconciliation_days_till_fkey"
    FOREIGN KEY ("till_id") REFERENCES "tills" ("id") ON DELETE SET NULL;

ALTER TABLE "reconciliation_days"
  ADD CONSTRAINT "reconciliation_days_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "merchant_members" ("id") ON DELETE SET NULL;
