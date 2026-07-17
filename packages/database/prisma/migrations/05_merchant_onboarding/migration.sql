-- Migration 5 : onboarding marchand multi-rôles
-- Ajoute OnboardingStatus, AccountType et champs de profil au modèle Merchant.
-- isActive passe à false par défaut : les nouveaux marchands sont PENDING.

CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "MerchantType" AS ENUM ('MERCHANT', 'DEVELOPER');

ALTER TABLE "merchants"
  ADD COLUMN "merchant_type"      "MerchantType"     NOT NULL DEFAULT 'MERCHANT',
  ADD COLUMN "onboarding_status"  "OnboardingStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "rejection_reason"   TEXT,
  ADD COLUMN "phone"              TEXT,
  ADD COLUMN "company_name"       TEXT,
  ADD COLUMN "country"            TEXT,
  ADD COLUMN "clerk_user_id"      TEXT;

-- Les marchands existants (seed dev) passent APPROVED + actifs pour ne pas casser l'existant.
UPDATE "merchants" SET "onboarding_status" = 'APPROVED' WHERE "is_active" = TRUE;

-- Nouveaux marchands inactifs par défaut (isActive était TRUE, on corrige la valeur par défaut).
ALTER TABLE "merchants" ALTER COLUMN "is_active" SET DEFAULT FALSE;

CREATE UNIQUE INDEX "merchants_clerk_user_id_key" ON "merchants"("clerk_user_id")
  WHERE "clerk_user_id" IS NOT NULL;

CREATE INDEX "merchants_onboarding_status_idx" ON "merchants"("onboarding_status");
