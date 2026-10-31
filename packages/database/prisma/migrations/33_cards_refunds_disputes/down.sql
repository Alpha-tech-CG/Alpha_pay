-- Annule 33. La valeur CARD de l'enum Operator reste (PostgreSQL ne retire pas une valeur d'enum) ;
-- supprimer d'abord les transactions CARD si besoin.
DROP TABLE IF EXISTS "disputes";
DROP TABLE IF EXISTS "refunds";
DROP TYPE IF EXISTS "DisputeStatus";
DROP TYPE IF EXISTS "RefundStatus";
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "amount_refunded",
  DROP COLUMN IF EXISTS "card_brand",
  DROP COLUMN IF EXISTS "card_last4",
  DROP COLUMN IF EXISTS "checkout_url";
