CREATE TABLE "push_tokens" (
    "id"          TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "token"       TEXT NOT NULL,
    "platform"    TEXT NOT NULL DEFAULT 'expo',
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_tokens_merchant_id_token_key" ON "push_tokens"("merchant_id", "token");
CREATE INDEX "push_tokens_merchant_id_idx" ON "push_tokens"("merchant_id");
