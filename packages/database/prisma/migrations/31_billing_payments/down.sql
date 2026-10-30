-- Migration inverse de 31_billing_payments (manuelle : psql -f down.sql).
DELETE FROM "billing_plans" WHERE "code" IN ('gratuit', 'commerce', 'pro', 'etablissement') AND NOT EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."plan_id" = "billing_plans"."id");
DROP INDEX IF EXISTS "alphapay_invoices_payment_link_id_key";
ALTER TABLE "alphapay_invoices" DROP COLUMN "kind", DROP COLUMN "plan_id", DROP COLUMN "credit_pack_id", DROP COLUMN "payment_link_id";
ALTER TABLE "billing_plans" DROP COLUMN "max_stores", DROP COLUMN "max_tills", DROP COLUMN "max_monthly_transactions";
