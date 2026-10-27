-- T-30 / D-005 : comptes maison (Argon2id, téléphone, OTP), sessions révocables,
-- rôles du cahier des charges, invitations par téléphone, journal d'audit.
-- Retrait de Clerk : colonnes clerk_user_id supprimées.
-- Rôles : MANAGER → ADMIN, MEMBER → CASHIER, VIEWER → ACCOUNTANT ; + DEVELOPER.

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- AlterEnum
BEGIN;
DROP INDEX IF EXISTS "merchant_members_one_active_owner";
CREATE TYPE "MerchantMemberRole_new" AS ENUM ('OWNER', 'ADMIN', 'ACCOUNTANT', 'CASHIER', 'DEVELOPER');
ALTER TABLE "merchant_members" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "merchant_invitations" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "merchant_members" ALTER COLUMN "role" TYPE "MerchantMemberRole_new" USING ((CASE "role"::text WHEN 'MANAGER' THEN 'ADMIN' WHEN 'MEMBER' THEN 'CASHIER' WHEN 'VIEWER' THEN 'ACCOUNTANT' ELSE "role"::text END)::"MerchantMemberRole_new");
ALTER TABLE "merchant_invitations" ALTER COLUMN "role" TYPE "MerchantMemberRole_new" USING ((CASE "role"::text WHEN 'MANAGER' THEN 'ADMIN' WHEN 'MEMBER' THEN 'CASHIER' WHEN 'VIEWER' THEN 'ACCOUNTANT' ELSE "role"::text END)::"MerchantMemberRole_new");
ALTER TYPE "MerchantMemberRole" RENAME TO "MerchantMemberRole_old";
ALTER TYPE "MerchantMemberRole_new" RENAME TO "MerchantMemberRole";
DROP TYPE "MerchantMemberRole_old";
CREATE UNIQUE INDEX "merchant_members_one_active_owner"
  ON "merchant_members" ("merchant_id")
  WHERE "role" = 'OWNER' AND "status" = 'ACTIVE';
ALTER TABLE "merchant_members" ALTER COLUMN "role" SET DEFAULT 'CASHIER';
ALTER TABLE "merchant_invitations" ALTER COLUMN "role" SET DEFAULT 'CASHIER';
COMMIT;

-- DropIndex
-- Selon l'historique, l'unicité est un index ou une contrainte.
ALTER TABLE "merchants" DROP CONSTRAINT IF EXISTS "merchants_clerk_user_id_key";
DROP INDEX IF EXISTS "merchants_clerk_user_id_key";

-- DropIndex
-- Selon l'historique, l'unicité est un index ou une contrainte.
ALTER TABLE "app_users" DROP CONSTRAINT IF EXISTS "app_users_clerk_user_id_key";
DROP INDEX IF EXISTS "app_users_clerk_user_id_key";

-- AlterTable
ALTER TABLE "merchants" DROP COLUMN "clerk_user_id";

-- AlterTable
ALTER TABLE "app_users" DROP COLUMN "clerk_user_id",
ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "phone_encrypted" BYTEA,
ADD COLUMN     "phone_hash" BYTEA,
ADD COLUMN     "phone_masked" TEXT,
ADD COLUMN     "phone_verified_at" TIMESTAMP(3),
ADD COLUMN     "preferred_otp_channel" "MessageChannel" NOT NULL DEFAULT 'SMS',
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "merchant_members" ALTER COLUMN "role" SET DEFAULT 'CASHIER';

-- AlterTable
ALTER TABLE "merchant_invitations" ADD COLUMN     "phone_encrypted" BYTEA,
ADD COLUMN     "phone_hash" BYTEA,
ALTER COLUMN "email_hash" DROP NOT NULL,
ALTER COLUMN "email_encrypted" DROP NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'CASHIER';

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "previous_token_hash" TEXT,
    "user_agent" TEXT,
    "ip_hash" BYTEA,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "merchant_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "ip_hash" BYTEA,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_previous_token_hash_key" ON "sessions"("previous_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "audit_logs_merchant_id_created_at_idx" ON "audit_logs"("merchant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_type_actor_id_created_at_idx" ON "audit_logs"("actor_type", "actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_users_phone_hash_key" ON "app_users"("phone_hash");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Une seule invitation EN ATTENTE par (marchand, téléphone), comme pour l'email.
CREATE UNIQUE INDEX "merchant_invitations_one_pending_phone"
  ON "merchant_invitations" ("merchant_id", "phone_hash")
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL AND "phone_hash" IS NOT NULL;

ALTER TABLE "merchant_invitations"
  ADD CONSTRAINT "merchant_invitations_email_or_phone"
  CHECK ("email_hash" IS NOT NULL OR "phone_hash" IS NOT NULL);

-- Journal d'audit non modifiable (§M12) : ni mise à jour ni suppression.
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION alphapay_append_only();
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION alphapay_append_only();
