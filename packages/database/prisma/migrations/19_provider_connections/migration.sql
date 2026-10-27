-- CreateEnum
CREATE TYPE "ProviderConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "livemode" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "provider_connections" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "operator" "Operator" NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "environment" TEXT NOT NULL,
    "credentials_enc" BYTEA,
    "status" "ProviderConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "last_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_connections_merchant_id_operator_livemode_key" ON "provider_connections"("merchant_id", "operator", "livemode");

-- CreateIndex
CREATE INDEX "transactions_merchant_id_livemode_created_at_idx" ON "transactions"("merchant_id", "livemode", "created_at");

-- AddForeignKey
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

