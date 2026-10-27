-- Migration inverse de 24_unified_payment_statuses (manuelle : psql -f down.sql).
-- EXPIRED → FAILED (motif EXPIRED conservé), CANCELED → REJECTED.
CREATE TYPE "TransactionStatus_old" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED', 'REJECTED');
ALTER TABLE "transactions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "transactions" ALTER COLUMN "status" TYPE "TransactionStatus_old" USING ((
  CASE "status"::text
    WHEN 'SUCCEEDED' THEN 'SUCCESSFUL'
    WHEN 'EXPIRED' THEN 'FAILED'
    WHEN 'CANCELED' THEN 'REJECTED'
    ELSE "status"::text
  END
)::"TransactionStatus_old");
ALTER TYPE "TransactionStatus" RENAME TO "TransactionStatus_new";
ALTER TYPE "TransactionStatus_old" RENAME TO "TransactionStatus";
DROP TYPE "TransactionStatus_new";
ALTER TABLE "transactions" ALTER COLUMN "status" SET DEFAULT 'PENDING';
