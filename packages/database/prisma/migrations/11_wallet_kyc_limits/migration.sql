-- Migration 11 : plafonds e-money par niveau KYC (ALP-174)

CREATE TYPE "WalletKycLevel" AS ENUM ('N0', 'N1', 'N2');

ALTER TABLE "wallets" ADD COLUMN "kyc_level" "WalletKycLevel" NOT NULL DEFAULT 'N0';

-- Plafonds éditables par niveau (centimes ×100, devise wallet).
CREATE TABLE "wallet_limits" (
  "level"             "WalletKycLevel" PRIMARY KEY,
  "max_balance_cents" BIGINT NOT NULL,
  "per_tx_cents"      BIGINT NOT NULL,
  "daily_cents"       BIGINT NOT NULL,
  "monthly_cents"     BIGINT NOT NULL,
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Défauts indicatifs (à ajuster selon la banque partenaire / BEAC).
-- N0 (numéro vérifié seulement)  : plafonds bas.
-- N1 (pièce d'identité vérifiée) : plafonds élevés.
-- N2 (vérification renforcée)    : plafonds très élevés.
INSERT INTO "wallet_limits" ("level", "max_balance_cents", "per_tx_cents", "daily_cents", "monthly_cents") VALUES
  ('N0',  10000000,   5000000,   5000000,  20000000),   -- 100k solde / 50k op / 50k jour / 200k mois (XAF)
  ('N1', 200000000,  50000000, 100000000, 500000000),   -- 2M / 500k / 1M / 5M
  ('N2', 1000000000, 200000000, 500000000, 2000000000); -- 10M / 2M / 5M / 20M
