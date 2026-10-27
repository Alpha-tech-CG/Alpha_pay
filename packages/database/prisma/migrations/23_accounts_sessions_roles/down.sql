-- Migration inverse de 23_accounts_sessions_roles (manuelle : psql -f down.sql).
-- Les invitations par téléphone (sans email) sont supprimées : l'ancien schéma exige un email.
DROP TRIGGER IF EXISTS audit_logs_no_update ON "audit_logs";
DROP TRIGGER IF EXISTS audit_logs_no_delete ON "audit_logs";
DROP INDEX IF EXISTS "merchant_invitations_one_pending_phone";
ALTER TABLE "merchant_invitations" DROP CONSTRAINT IF EXISTS "merchant_invitations_email_or_phone";
DELETE FROM "merchant_invitations" WHERE "email_hash" IS NULL;

-- AlterEnum
BEGIN;
DROP INDEX IF EXISTS "merchant_members_one_active_owner";
CREATE TYPE "MerchantMemberRole_new" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER');
ALTER TABLE "merchant_members" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "merchant_invitations" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "merchant_members" ALTER COLUMN "role" TYPE "MerchantMemberRole_new" USING ((CASE "role"::text WHEN 'ACCOUNTANT' THEN 'VIEWER' WHEN 'CASHIER' THEN 'MEMBER' WHEN 'DEVELOPER' THEN 'MEMBER' ELSE "role"::text END)::"MerchantMemberRole_new");
ALTER TABLE "merchant_invitations" ALTER COLUMN "role" TYPE "MerchantMemberRole_new" USING ((CASE "role"::text WHEN 'ACCOUNTANT' THEN 'VIEWER' WHEN 'CASHIER' THEN 'MEMBER' WHEN 'DEVELOPER' THEN 'MEMBER' ELSE "role"::text END)::"MerchantMemberRole_new");
ALTER TYPE "MerchantMemberRole" RENAME TO "MerchantMemberRole_old";
ALTER TYPE "MerchantMemberRole_new" RENAME TO "MerchantMemberRole";
DROP TYPE "MerchantMemberRole_old";
CREATE UNIQUE INDEX "merchant_members_one_active_owner"
  ON "merchant_members" ("merchant_id")
  WHERE "role" = 'OWNER' AND "status" = 'ACTIVE';
ALTER TABLE "merchant_members" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
ALTER TABLE "merchant_invitations" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
COMMIT;

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_fkey";

-- DropIndex
DROP INDEX "app_users_phone_hash_key";

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "clerk_user_id" TEXT;

-- AlterTable
ALTER TABLE "app_users" DROP COLUMN "email_verified_at",
DROP COLUMN "last_login_at",
DROP COLUMN "password_hash",
DROP COLUMN "phone_encrypted",
DROP COLUMN "phone_hash",
DROP COLUMN "phone_masked",
DROP COLUMN "phone_verified_at",
DROP COLUMN "preferred_otp_channel",
DROP COLUMN "status",
ADD COLUMN     "clerk_user_id" TEXT;

-- AlterTable
ALTER TABLE "merchant_members" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "merchant_invitations" DROP COLUMN "phone_encrypted",
DROP COLUMN "phone_hash",
ALTER COLUMN "email_hash" SET NOT NULL,
ALTER COLUMN "email_encrypted" SET NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- DropTable
DROP TABLE "sessions";

-- DropTable
DROP TABLE "audit_logs";

-- DropEnum
DROP TYPE "UserStatus";

-- CreateIndex
CREATE UNIQUE INDEX "merchants_clerk_user_id_key" ON "merchants"("clerk_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_users_clerk_user_id_key" ON "app_users"("clerk_user_id");

