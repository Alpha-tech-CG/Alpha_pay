-- Migration 8 : QR signés (ALP-172) + checkout wallet (ALP-169)

-- Lien caissier → marchand : un wallet MERCHANT_CASHIER encaisse pour un Merchant.
ALTER TABLE "wallets" ADD COLUMN "merchant_id" UUID REFERENCES "merchants"("id");
CREATE INDEX "wallets_merchant_idx" ON "wallets"("merchant_id");

-- Nonce à usage unique des QR signés : l'index unique garantit qu'un même QR
-- ne peut être payé qu'une seule fois (anti-rejeu au niveau base).
ALTER TABLE "wallet_transactions" ADD COLUMN "qr_nonce" TEXT;
CREATE UNIQUE INDEX "wallet_transactions_qr_nonce_key" ON "wallet_transactions"("qr_nonce");
