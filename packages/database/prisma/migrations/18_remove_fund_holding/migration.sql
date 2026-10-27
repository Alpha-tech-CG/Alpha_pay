-- T-03 / D-003 : retrait du code qui détient ou fait transiter des fonds
-- (wallet, grand livre, reversements, commissions, partenaires, routage, change).

-- La vue et la fonction du grand livre dépendent de journal_entries.
DROP VIEW IF EXISTS "account_balances";

-- DropForeignKey
ALTER TABLE "wallets" DROP CONSTRAINT "wallets_merchant_id_fkey";

-- DropForeignKey
ALTER TABLE "wallet_transactions" DROP CONSTRAINT "wallet_transactions_wallet_id_fkey";

-- DropForeignKey
ALTER TABLE "wallet_transactions" DROP CONSTRAINT "wallet_transactions_peer_wallet_id_fkey";

-- DropForeignKey
ALTER TABLE "wallet_kyc_documents" DROP CONSTRAINT "wallet_kyc_documents_wallet_id_fkey";

-- DropForeignKey
ALTER TABLE "merchants" DROP CONSTRAINT "merchants_fee_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "settlement_audits" DROP CONSTRAINT "settlement_audits_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_account_id_fkey";

-- DropForeignKey
ALTER TABLE "ledger_balance_snapshots" DROP CONSTRAINT "ledger_balance_snapshots_account_id_fkey";

-- DropForeignKey
ALTER TABLE "partner_credentials" DROP CONSTRAINT "partner_credentials_partner_id_fkey";

-- DropForeignKey
ALTER TABLE "routing_rules" DROP CONSTRAINT "routing_rules_partner_id_fkey";

-- DropForeignKey
ALTER TABLE "fee_rules" DROP CONSTRAINT "fee_rules_fee_profile_id_fkey";

-- DropIndex
DROP INDEX "merchants_fee_profile_id_idx";

-- DropIndex
DROP INDEX "transactions_partner_id_idx";

-- AlterTable
ALTER TABLE "merchants" DROP COLUMN "fee_profile_id";

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "fee_cents",
DROP COLUMN "partner_id",
DROP COLUMN "routing_reason",
DROP COLUMN "routing_rule_id";

-- DropTable
DROP TABLE "wallets";

-- DropTable
DROP TABLE "wallet_transactions";

-- DropTable
DROP TABLE "wallet_limits";

-- DropTable
DROP TABLE "wallet_kyc_documents";

-- DropTable
DROP TABLE "merchant_settlement_configs";

-- DropTable
DROP TABLE "settlement_batches";

-- DropTable
DROP TABLE "settlement_audits";

-- DropTable
DROP TABLE "wallet_reconciliation_runs";

-- DropTable
DROP TABLE "ledger_accounts";

-- DropTable
DROP TABLE "journal_entries";

-- DropTable
DROP TABLE "ledger_balance_snapshots";

-- DropTable
DROP TABLE "currency_rates";

-- DropTable
DROP TABLE "partners";

-- DropTable
DROP TABLE "partner_credentials";

-- DropTable
DROP TABLE "routing_rules";

-- DropTable
DROP TABLE "fee_profiles";

-- DropTable
DROP TABLE "fee_rules";

-- DropTable
DROP TABLE "settlement_records";

-- DropEnum
DROP TYPE "AccountType";

-- DropEnum
DROP TYPE "EntryDirection";

-- DropEnum
DROP TYPE "SettlementFrequency";

-- DropEnum
DROP TYPE "SettlementStatus";

-- DropEnum
DROP TYPE "SettlementPayoutMethod";

-- DropEnum
DROP TYPE "UserRole";

-- DropEnum
DROP TYPE "WalletStatus";

-- DropEnum
DROP TYPE "WalletTxType";

-- DropEnum
DROP TYPE "WalletKycLevel";

-- DropEnum
DROP TYPE "WalletKycDocType";

-- DropEnum
DROP TYPE "WalletKycDocStatus";

-- DropEnum
DROP TYPE "PartnerType";

-- DropEnum
DROP TYPE "PartnerStatus";

-- DropEnum
DROP TYPE "PaymentMethodType";


-- Fonction des triggers anti-mutation du grand livre (supprimés avec la table).
DROP FUNCTION IF EXISTS journal_block_mutation();
