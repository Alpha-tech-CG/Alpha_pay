-- Migration 10 : réconciliation du float wallet (ALP-175)

CREATE TABLE "wallet_reconciliation_runs" (
  "id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_date"                 TIMESTAMPTZ NOT NULL,
  "wallet_count"             INT NOT NULL,
  -- Σ des soldes courants de tous les wallets.
  "total_balance_cents"      BIGINT NOT NULL,
  -- Σ signée des transactions wallet SUCCESSFUL (crédit − débit) : le solde théorique.
  "expected_balance_cents"   BIGINT NOT NULL,
  -- Écart d'intégrité interne = total_balance − expected (doit être 0).
  "drift_cents"              BIGINT NOT NULL,
  -- Exposition float sur comptes opérateurs = Σ cash-in − Σ cash-out (SUCCESSFUL).
  "cash_in_cents"            BIGINT NOT NULL,
  "cash_out_cents"           BIGINT NOT NULL,
  -- Σ des paiements marchands (dette de reversement portée par le wallet).
  "pay_cents"                BIGINT NOT NULL,
  "float_exposure_cents"     BIGINT NOT NULL,
  -- Nombre de wallets dont le solde ≠ balance_after de leur dernière transaction.
  "inconsistent_wallet_count" INT NOT NULL DEFAULT 0,
  "alert"                    BOOLEAN NOT NULL DEFAULT false,
  "report_json"              JSONB NOT NULL,
  "created_at"               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "wallet_reconciliation_runs_run_date_idx" ON "wallet_reconciliation_runs"("run_date");
