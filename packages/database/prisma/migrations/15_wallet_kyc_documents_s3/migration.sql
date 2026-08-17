-- Migration 15 : bascule le stockage des pièces KYC wallet de base64-en-DB
-- vers S3 (docs/AVANT_PROD.md §0.2) — sort du mode démo introduit en
-- migration 12. Aucune donnée réelle n'existe (aucune prod lancée) : les
-- éventuelles lignes de démo sont purgées plutôt que migrées, leur contenu
-- base64 n'ayant pas de clé S3 équivalente à leur assigner.

TRUNCATE TABLE "wallet_kyc_documents";

ALTER TABLE "wallet_kyc_documents" DROP COLUMN "data_base64";
ALTER TABLE "wallet_kyc_documents" ADD COLUMN "storage_key" TEXT NOT NULL;
