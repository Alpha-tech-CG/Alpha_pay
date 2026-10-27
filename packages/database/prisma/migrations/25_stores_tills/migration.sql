-- T-50 : boutiques, caisses (QR public, options Vérif), caissiers ; paiement rattaché à une caisse.
-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "store_id" TEXT,
ADD COLUMN     "till_id" TEXT;

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tills" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "public_code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "confirm_by_sms" BOOLEAN NOT NULL DEFAULT false,
    "confirm_by_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "till_members" (
    "id" TEXT NOT NULL,
    "till_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "till_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stores_merchant_id_active_idx" ON "stores"("merchant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "tills_public_code_key" ON "tills"("public_code");

-- CreateIndex
CREATE INDEX "tills_merchant_id_active_idx" ON "tills"("merchant_id", "active");

-- CreateIndex
CREATE INDEX "tills_store_id_idx" ON "tills"("store_id");

-- CreateIndex
CREATE INDEX "till_members_member_id_idx" ON "till_members"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "till_members_till_id_member_id_key" ON "till_members"("till_id", "member_id");

-- CreateIndex
CREATE INDEX "transactions_till_id_livemode_created_at_idx" ON "transactions"("till_id", "livemode", "created_at");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tills" ADD CONSTRAINT "tills_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "till_members" ADD CONSTRAINT "till_members_till_id_fkey" FOREIGN KEY ("till_id") REFERENCES "tills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "till_members" ADD CONSTRAINT "till_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "merchant_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

