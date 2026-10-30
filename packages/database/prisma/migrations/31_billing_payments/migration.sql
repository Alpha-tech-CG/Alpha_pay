-- M11 : limites des paliers, factures AlphaPay payées par lien de paiement, paliers du cahier.
ALTER TABLE "billing_plans" ADD COLUMN "max_stores" INTEGER,
ADD COLUMN "max_tills" INTEGER,
ADD COLUMN "max_monthly_transactions" INTEGER;

ALTER TABLE "alphapay_invoices" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
ADD COLUMN "plan_id" TEXT,
ADD COLUMN "credit_pack_id" TEXT,
ADD COLUMN "payment_link_id" TEXT;

CREATE UNIQUE INDEX "alphapay_invoices_payment_link_id_key" ON "alphapay_invoices"("payment_link_id");

-- Paliers du cahier (§M11). Prix NON fixés : 0, à renseigner dans le back-office
-- (aucun prix en dur). Limites indicatives, modifiables de même.
INSERT INTO "billing_plans" ("id", "code", "label", "price_monthly", "price_yearly", "currency", "included_modules", "included_credits", "max_stores", "max_tills", "max_monthly_transactions", "updated_at") VALUES
  (gen_random_uuid()::text, 'gratuit', 'Gratuit', 0, 0, 'XAF', ARRAY[]::text[], 0, 1, 1, 100, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'commerce', 'Commerce', 0, 0, 'XAF', ARRAY['m6_manage'], 0, 3, 10, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'pro', 'Pro', 0, 0, 'XAF', ARRAY['m6_manage', 'm7_recover', 'm9_messaging', 'm10_developers'], 0, 10, 50, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'etablissement', 'Établissement', 0, 0, 'XAF', ARRAY['m6_manage', 'm7_recover', 'm8_school', 'm9_messaging', 'm10_developers'], 0, NULL, NULL, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
