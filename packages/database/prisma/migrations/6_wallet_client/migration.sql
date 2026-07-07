-- Migration 6 : Wallet client (closed-loop) + rôles utilisateurs

CREATE TYPE "UserRole" AS ENUM ('CLIENT', 'MERCHANT', 'MERCHANT_CASHIER', 'ADMIN_STAFF');
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "WalletTxType" AS ENUM ('CASH_IN', 'PAY', 'CASH_OUT', 'P2P_SEND', 'P2P_RECEIVE', 'REFUND');

-- Portefeuilles clients
CREATE TABLE "wallets" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "phone"         TEXT NOT NULL UNIQUE,
  "pin_hash"      TEXT NOT NULL,
  "balance_cents" BIGINT NOT NULL DEFAULT 0,
  "currency"      TEXT NOT NULL DEFAULT 'XAF',
  "role"          "UserRole" NOT NULL DEFAULT 'CLIENT',
  "status"        "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
  "full_name"     TEXT,
  "push_token"    TEXT,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "wallets_phone_idx" ON "wallets"("phone");

-- Transactions sur portefeuille (ledger simplifié)
CREATE TABLE "wallet_transactions" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "wallet_id"      UUID NOT NULL REFERENCES "wallets"("id"),
  "type"           "WalletTxType" NOT NULL,
  "amount_cents"   BIGINT NOT NULL,
  "balance_before" BIGINT NOT NULL,
  "balance_after"  BIGINT NOT NULL,
  "status"         "TransactionStatus" NOT NULL DEFAULT 'PENDING',
  "description"    TEXT,
  "operator_ref"   TEXT,
  "merchant_id"    UUID,
  "peer_wallet_id" UUID REFERENCES "wallets"("id"),
  "metadata"       JSONB,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "wallet_transactions_wallet_created_idx" ON "wallet_transactions"("wallet_id", "created_at");
CREATE INDEX "wallet_transactions_merchant_idx"        ON "wallet_transactions"("merchant_id");
CREATE INDEX "wallet_transactions_status_idx"          ON "wallet_transactions"("status");

-- Contrainte : balance ne peut pas être négative
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_non_negative" CHECK ("balance_cents" >= 0);
