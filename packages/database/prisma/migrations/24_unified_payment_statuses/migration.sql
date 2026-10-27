-- T-44 / D-016 : statuts unifiés AlphaPay (en_attente, réussi, échoué, expiré, annulé).
-- SUCCESSFUL → SUCCEEDED ; REJECTED (refus du payeur) → FAILED ; + EXPIRED, CANCELED.
-- Les paiements expirés étaient jusqu'ici notés FAILED avec le motif EXPIRED.
CREATE TYPE "TransactionStatus_new" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELED');
ALTER TABLE "transactions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "transactions" ALTER COLUMN "status" TYPE "TransactionStatus_new" USING ((
  CASE
    WHEN "status"::text = 'SUCCESSFUL' THEN 'SUCCEEDED'
    WHEN "status"::text = 'REJECTED' THEN 'FAILED'
    WHEN "status"::text = 'FAILED' AND "failure_reason" = 'EXPIRED' THEN 'EXPIRED'
    ELSE "status"::text
  END
)::"TransactionStatus_new");
ALTER TYPE "TransactionStatus" RENAME TO "TransactionStatus_old";
ALTER TYPE "TransactionStatus_new" RENAME TO "TransactionStatus";
DROP TYPE "TransactionStatus_old";
ALTER TABLE "transactions" ALTER COLUMN "status" SET DEFAULT 'PENDING';
