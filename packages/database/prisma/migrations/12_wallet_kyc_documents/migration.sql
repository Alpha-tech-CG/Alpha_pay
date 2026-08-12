-- Migration 12 : pièces d'identité client (KYC wallet N0 → N1) — ALP-177
-- Démo : image stockée encodée (base64) en base, sans dépendance S3.

CREATE TYPE "WalletKycDocType" AS ENUM ('ID_FRONT', 'ID_BACK', 'SELFIE');
CREATE TYPE "WalletKycDocStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "wallet_kyc_documents" (
  "id"            TEXT PRIMARY KEY,
  "wallet_id"     TEXT NOT NULL REFERENCES "wallets"("id"),
  "type"          "WalletKycDocType" NOT NULL,
  "mime_type"     TEXT NOT NULL,
  "data_base64"   TEXT NOT NULL,
  "status"        "WalletKycDocStatus" NOT NULL DEFAULT 'PENDING',
  "reviewed_by"   TEXT,
  "review_reason" TEXT,
  "reviewed_at"   TIMESTAMPTZ,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "wallet_kyc_documents_wallet_id_idx" ON "wallet_kyc_documents"("wallet_id");
CREATE INDEX "wallet_kyc_documents_status_idx" ON "wallet_kyc_documents"("status");
