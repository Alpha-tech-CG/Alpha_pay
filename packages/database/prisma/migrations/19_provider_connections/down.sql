-- Migration inverse de 19_provider_connections (manuelle : psql -f down.sql).
-- DropForeignKey
ALTER TABLE "provider_connections" DROP CONSTRAINT "provider_connections_merchant_id_fkey";

-- DropIndex
DROP INDEX "transactions_merchant_id_livemode_created_at_idx";

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "livemode";

-- DropTable
DROP TABLE "provider_connections";

-- DropEnum
DROP TYPE "ProviderConnectionStatus";

