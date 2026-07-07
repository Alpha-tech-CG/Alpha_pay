-- Migration 7 : durcissement wallet + valeurs d'opérateur manquantes

-- Valeurs présentes dans le schéma Prisma mais absentes du type PostgreSQL.
-- CINETPAY était utilisé par le connecteur cartes sans migration (aurait cassé en prod).
-- WALLET matérialise les encaissements marchands payés depuis un wallet client.
ALTER TYPE "Operator" ADD VALUE IF NOT EXISTS 'CINETPAY';
ALTER TYPE "Operator" ADD VALUE IF NOT EXISTS 'WALLET';

-- Idempotence des opérations wallet (double-tap mobile, retry réseau).
ALTER TABLE "wallet_transactions" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "wallet_transactions_wallet_id_idempotency_key_key"
  ON "wallet_transactions"("wallet_id", "idempotency_key");

-- Onboarding développeur : dossier complet (site, cas d'usage, pièce d'identité S3).
ALTER TABLE "merchants" ADD COLUMN "website" TEXT;
ALTER TABLE "merchants" ADD COLUMN "use_case" TEXT;
ALTER TABLE "merchants" ADD COLUMN "id_document_key" TEXT;
