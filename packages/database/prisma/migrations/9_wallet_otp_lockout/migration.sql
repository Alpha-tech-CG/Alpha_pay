-- Migration 9 : OTP d'inscription (ALP-171) + verrouillage progressif du PIN (ALP-173)

-- Un wallet nouvellement inscrit doit prouver la possession du numéro (OTP SMS)
-- avant toute opération.
ALTER TYPE "WalletStatus" ADD VALUE IF NOT EXISTS 'PENDING_VERIFICATION';

ALTER TABLE "wallets" ADD COLUMN "otp_hash" TEXT;
ALTER TABLE "wallets" ADD COLUMN "otp_expires_at" TIMESTAMPTZ;
ALTER TABLE "wallets" ADD COLUMN "otp_attempts" INT NOT NULL DEFAULT 0;

-- Anti brute-force PIN par compte (le rate limit IP ne suffit pas contre un botnet).
ALTER TABLE "wallets" ADD COLUMN "failed_pin_attempts" INT NOT NULL DEFAULT 0;
ALTER TABLE "wallets" ADD COLUMN "locked_until" TIMESTAMPTZ;
