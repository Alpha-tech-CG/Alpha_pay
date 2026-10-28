-- T-71 : Cash déclaré par caissier (§M6).
-- Un caissier déclare le cash qu'il comptabilise manuellement en fin de shift.
-- Ces entrées complètent le rapprochement journalier (T-72).

CREATE TABLE "cash_entries" (
  "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id" UUID          NOT NULL,
  "till_id"     UUID,
  "member_id"   UUID          NOT NULL,
  -- Montant en unités mineures (XAF = francs entiers).
  "amount"      BIGINT        NOT NULL CHECK ("amount" >= 0),
  "currency"    VARCHAR(3)    NOT NULL DEFAULT 'XAF',
  "livemode"    BOOLEAN       NOT NULL DEFAULT false,
  "note"        TEXT,
  "entry_date"  DATE          NOT NULL DEFAULT CURRENT_DATE,
  "created_at"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT "cash_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cash_entries_merchant_livemode_date_idx"
  ON "cash_entries" ("merchant_id", "livemode", "entry_date" DESC);

CREATE INDEX "cash_entries_till_idx"
  ON "cash_entries" ("till_id", "livemode", "entry_date" DESC);

ALTER TABLE "cash_entries"
  ADD CONSTRAINT "cash_entries_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

ALTER TABLE "cash_entries"
  ADD CONSTRAINT "cash_entries_till_id_fkey"
    FOREIGN KEY ("till_id") REFERENCES "tills" ("id") ON DELETE SET NULL;

ALTER TABLE "cash_entries"
  ADD CONSTRAINT "cash_entries_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "merchant_members" ("id");
