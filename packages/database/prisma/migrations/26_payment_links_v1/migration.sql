-- T-52 : liens de paiement (montant libre, usage multiple, désactivation, code public) ; paiement rattaché à son lien.
-- AlterTable
ALTER TABLE "payment_links" ALTER COLUMN "amount" DROP NOT NULL,
ADD COLUMN     "public_code" TEXT,
ADD COLUMN     "multi_use" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "payment_link_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payment_links_public_code_key" ON "payment_links"("public_code");

-- CreateIndex
CREATE INDEX "transactions_payment_link_id_idx" ON "transactions"("payment_link_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_link_id_fkey" FOREIGN KEY ("payment_link_id") REFERENCES "payment_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;
