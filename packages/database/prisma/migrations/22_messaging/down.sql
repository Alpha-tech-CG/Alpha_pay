-- Migration inverse de 22_messaging (manuelle : psql -f down.sql).
DROP TRIGGER IF EXISTS credit_ledger_no_update ON "credit_ledger";
DROP TRIGGER IF EXISTS credit_ledger_no_delete ON "credit_ledger";
-- DropTable
DROP TABLE "message_templates";

-- DropTable
DROP TABLE "messages";

-- DropTable
DROP TABLE "message_preferences";

-- DropTable
DROP TABLE "opt_outs";

-- DropTable
DROP TABLE "otp_audit";

-- DropTable
DROP TABLE "credit_ledger";

-- DropEnum
DROP TYPE "MessageChannel";

-- DropEnum
DROP TYPE "MessageStatus";

-- DropEnum
DROP TYPE "MessageCategory";

DROP FUNCTION IF EXISTS alphapay_append_only();
