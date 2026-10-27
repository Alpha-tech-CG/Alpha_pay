-- Migration inverse de 25_stores_tills (manuelle : psql -f down.sql).
-- DropForeignKey
ALTER TABLE "stores" DROP CONSTRAINT "stores_merchant_id_fkey";

-- DropForeignKey
ALTER TABLE "tills" DROP CONSTRAINT "tills_store_id_fkey";

-- DropForeignKey
ALTER TABLE "till_members" DROP CONSTRAINT "till_members_till_id_fkey";

-- DropForeignKey
ALTER TABLE "till_members" DROP CONSTRAINT "till_members_member_id_fkey";

-- DropIndex
DROP INDEX "transactions_till_id_livemode_created_at_idx";

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "store_id",
DROP COLUMN "till_id";

-- DropTable
DROP TABLE "stores";

-- DropTable
DROP TABLE "tills";

-- DropTable
DROP TABLE "till_members";

