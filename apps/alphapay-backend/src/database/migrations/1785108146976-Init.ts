import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1785108146976 implements MigrationInterface {
    name = 'Init1785108146976'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_market_enum" AS ENUM('CONGO', 'LIBYA')`);
        await queryRunner.query(`CREATE TYPE "public"."users_accounttype_enum" AS ENUM('STANDARD', 'MERCHANT', 'DEVELOPER')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "phoneNumber" character varying NOT NULL, "email" character varying, "market" "public"."users_market_enum" NOT NULL, "accountType" "public"."users_accounttype_enum" NOT NULL DEFAULT 'STANDARD', "kycVerified" boolean NOT NULL DEFAULT false, "kycLevel" integer NOT NULL DEFAULT '0', "encryptedFullName" character varying, "encryptedNationalId" character varying, "isActive" boolean NOT NULL DEFAULT true, "lastLoginAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_1e3d0240b49c40521aaeb953293" UNIQUE ("phoneNumber"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_type_enum" AS ENUM('PAYMENT_LOCAL', 'PAYMENT_INTERNATIONAL', 'REMITTANCE_SEND', 'REMITTANCE_RECEIVE', 'CARD_TOPUP', 'CARD_PAYMENT')`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_operator_enum" AS ENUM('MTN', 'AIRTEL', 'LIBYAN_BANK')`);
        await queryRunner.query(`CREATE TYPE "public"."transactions_status_enum" AS ENUM('PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'REJECTED', 'REFUNDED')`);
        await queryRunner.query(`CREATE TABLE "transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "type" "public"."transactions_type_enum" NOT NULL, "operator" "public"."transactions_operator_enum", "status" "public"."transactions_status_enum" NOT NULL DEFAULT 'PENDING', "amount" numeric(18,6) NOT NULL, "currency" character varying(4) NOT NULL, "convertedAmount" numeric(18,6), "convertedCurrency" character varying, "fee" numeric(18,6) NOT NULL DEFAULT '0', "externalReference" character varying, "recipientPhone" character varying, "corridor" character varying, "merchantId" character varying, "metadata" jsonb, "failureReason" character varying, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6bb58f2b6e30cb51a6504599f4" ON "transactions" ("userId") `);
        await queryRunner.query(`CREATE TYPE "public"."merchants_market_enum" AS ENUM('CONGO', 'LIBYA')`);
        await queryRunner.query(`CREATE TYPE "public"."merchants_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')`);
        await queryRunner.query(`CREATE TABLE "merchants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "businessName" character varying NOT NULL, "businessSector" character varying, "market" "public"."merchants_market_enum" NOT NULL, "status" "public"."merchants_status_enum" NOT NULL DEFAULT 'PENDING', "encryptedBusinessRegistration" character varying, "subscriptionPlan" character varying NOT NULL DEFAULT 'FREE', "subscriptionExpiresAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_c4199d0353747c821386791f813" UNIQUE ("userId"), CONSTRAINT "PK_4fd312ef25f8e05ad47bfe7ed25" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "terminals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "merchantId" character varying NOT NULL, "name" character varying NOT NULL, "qrCodeId" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_33d2ce16240fb19114e53492ac9" UNIQUE ("qrCodeId"), CONSTRAINT "PK_cd9f1bbe36836bffd5217d3fe60" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."kyc_submissions_level_enum" AS ENUM('LEVEL_1', 'LEVEL_2')`);
        await queryRunner.query(`CREATE TYPE "public"."kyc_submissions_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "kyc_submissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "level" "public"."kyc_submissions_level_enum" NOT NULL, "status" "public"."kyc_submissions_status_enum" NOT NULL DEFAULT 'PENDING', "provider" character varying NOT NULL, "providerSubmissionId" character varying, "documentType" character varying, "providerResponse" jsonb, "rejectionReason" character varying, "reviewedAt" TIMESTAMP WITH TIME ZONE, "submittedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b6ce86b4b10d774272de1730a71" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3800470348647686e70d5169ec" ON "kyc_submissions" ("userId") `);
        await queryRunner.query(`CREATE TYPE "public"."virtual_cards_network_enum" AS ENUM('VISA', 'MASTERCARD')`);
        await queryRunner.query(`CREATE TYPE "public"."virtual_cards_status_enum" AS ENUM('ACTIVE', 'FROZEN', 'DELETED')`);
        await queryRunner.query(`CREATE TYPE "public"."virtual_cards_issuedformarket_enum" AS ENUM('CONGO', 'LIBYA')`);
        await queryRunner.query(`CREATE TABLE "virtual_cards" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "issuerCardId" character varying NOT NULL, "network" "public"."virtual_cards_network_enum" NOT NULL, "lastFour" character varying(4) NOT NULL, "expiryMonth" character varying NOT NULL, "expiryYear" character varying NOT NULL, "balanceUsd" numeric(18,6) NOT NULL DEFAULT '0', "status" "public"."virtual_cards_status_enum" NOT NULL DEFAULT 'ACTIVE', "issuedForMarket" "public"."virtual_cards_issuedformarket_enum" NOT NULL, "issuedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_733e137730f42fc12d597705515" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."api_keys_environment_enum" AS ENUM('SANDBOX', 'PRODUCTION')`);
        await queryRunner.query(`CREATE TABLE "api_keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "name" character varying NOT NULL, "keyHash" character varying NOT NULL, "keyPrefix" character varying(20) NOT NULL, "environment" "public"."api_keys_environment_enum" NOT NULL, "scopes" text NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "lastUsedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_df3b25181df0b4b59bd93f16e10" UNIQUE ("keyHash"), CONSTRAINT "PK_5c8a79801b44bd27b79228e1dad" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6c2e267ae764a9413b863a2934" ON "api_keys" ("userId") `);
        await queryRunner.query(`CREATE TYPE "public"."api_logs_environment_enum" AS ENUM('SANDBOX', 'PRODUCTION')`);
        await queryRunner.query(`CREATE TABLE "api_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "apiKeyId" character varying, "method" character varying NOT NULL, "endpoint" character varying NOT NULL, "statusCode" integer NOT NULL, "latencyMs" integer NOT NULL, "environment" "public"."api_logs_environment_enum" NOT NULL, "requestBody" jsonb, "responseBody" jsonb, "userId" character varying, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ea3f2ad34a2921407593ff4425b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_306f79cd972fbc8aab9cd7f4b9" ON "api_logs" ("apiKeyId") `);
        await queryRunner.query(`CREATE TABLE "webhook_endpoints" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "url" character varying NOT NULL, "secretHash" character varying NOT NULL, "events" text NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_054c4cfb95223732f5939d2d546" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fd866edd4a9cf92aec0901ce4d" ON "webhook_endpoints" ("userId") `);
        await queryRunner.query(`CREATE TABLE "webhook_delivery_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "webhookId" character varying NOT NULL, "event" character varying NOT NULL, "statusCode" integer, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0e3b1d3f1b9b79d4a7ad0b92b84" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5f6ea4a287e4f131ed3082521d" ON "webhook_delivery_logs" ("webhookId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_5f6ea4a287e4f131ed3082521d"`);
        await queryRunner.query(`DROP TABLE "webhook_delivery_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fd866edd4a9cf92aec0901ce4d"`);
        await queryRunner.query(`DROP TABLE "webhook_endpoints"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_306f79cd972fbc8aab9cd7f4b9"`);
        await queryRunner.query(`DROP TABLE "api_logs"`);
        await queryRunner.query(`DROP TYPE "public"."api_logs_environment_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6c2e267ae764a9413b863a2934"`);
        await queryRunner.query(`DROP TABLE "api_keys"`);
        await queryRunner.query(`DROP TYPE "public"."api_keys_environment_enum"`);
        await queryRunner.query(`DROP TABLE "virtual_cards"`);
        await queryRunner.query(`DROP TYPE "public"."virtual_cards_issuedformarket_enum"`);
        await queryRunner.query(`DROP TYPE "public"."virtual_cards_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."virtual_cards_network_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3800470348647686e70d5169ec"`);
        await queryRunner.query(`DROP TABLE "kyc_submissions"`);
        await queryRunner.query(`DROP TYPE "public"."kyc_submissions_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."kyc_submissions_level_enum"`);
        await queryRunner.query(`DROP TABLE "terminals"`);
        await queryRunner.query(`DROP TABLE "merchants"`);
        await queryRunner.query(`DROP TYPE "public"."merchants_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."merchants_market_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6bb58f2b6e30cb51a6504599f4"`);
        await queryRunner.query(`DROP TABLE "transactions"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_operator_enum"`);
        await queryRunner.query(`DROP TYPE "public"."transactions_type_enum"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_accounttype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."users_market_enum"`);
    }

}
