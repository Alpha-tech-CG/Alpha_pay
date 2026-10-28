-- T-56 : journal des requêtes API (30 jours, métadonnées seulement).
-- CreateTable
CREATE TABLE "api_request_logs" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "api_key_id" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "error_code" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_request_logs_merchant_id_livemode_created_at_idx" ON "api_request_logs"("merchant_id", "livemode", "created_at");

-- CreateIndex
CREATE INDEX "api_request_logs_created_at_idx" ON "api_request_logs"("created_at");
