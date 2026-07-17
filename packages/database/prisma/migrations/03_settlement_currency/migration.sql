-- Devise de reversement par marchand + FX au settlement (ALP-151).
ALTER TABLE "merchant_settlement_configs" ADD COLUMN "settlement_currency" TEXT;

ALTER TABLE "settlement_batches" ADD COLUMN "settlement_currency" TEXT;
ALTER TABLE "settlement_batches" ADD COLUMN "settled_net_cents" BIGINT;
ALTER TABLE "settlement_batches" ADD COLUMN "fx_rate" DECIMAL(20,10);
