-- Taux de change (ALP-151).
CREATE TABLE "currency_rates" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "currency_rates_base_quote_key" ON "currency_rates"("base", "quote");
