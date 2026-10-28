-- T-59/T-60 : dossier KYB (états du cahier), pièces chiffrées, historique, vérifications KYC.
-- Remplace les anciennes tables Smile ID (kyc_cases, kyc_documents, kyc_events).
-- CreateEnum
CREATE TYPE "KybStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'INFO_REQUIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KybDocumentType" AS ENUM ('RCCM_EXTRACT', 'NIU_CERTIFICATE', 'DIRECTOR_ID');

-- CreateEnum
CREATE TYPE "KycCheckStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RETRY');

-- CreateTable
CREATE TABLE "kyb_applications" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "status" "KybStatus" NOT NULL DEFAULT 'DRAFT',
    "legal_name" TEXT,
    "legal_form" TEXT,
    "rccm" TEXT,
    "niu" TEXT,
    "address" TEXT,
    "sector" TEXT,
    "director_first_name" TEXT,
    "director_last_name" TEXT,
    "submitted_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "decision_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyb_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyb_documents" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "type" "KybDocumentType" NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyb_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyb_events" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "from_status" "KybStatus",
    "to_status" "KybStatus" NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyb_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_checks" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "status" "KycCheckStatus" NOT NULL DEFAULT 'PENDING',
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kyb_applications_merchant_id_key" ON "kyb_applications"("merchant_id");

-- CreateIndex
CREATE INDEX "kyb_applications_status_submitted_at_idx" ON "kyb_applications"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "kyb_documents_storage_key_key" ON "kyb_documents"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "kyb_documents_application_id_type_key" ON "kyb_documents"("application_id", "type");

-- CreateIndex
CREATE INDEX "kyb_events_application_id_created_at_idx" ON "kyb_events"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "kyc_checks_application_id_idx" ON "kyc_checks"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_checks_provider_applicant_id_key" ON "kyc_checks"("provider", "applicant_id");

-- AddForeignKey
ALTER TABLE "kyb_applications" ADD CONSTRAINT "kyb_applications_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyb_documents" ADD CONSTRAINT "kyb_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "kyb_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyb_events" ADD CONSTRAINT "kyb_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "kyb_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_checks" ADD CONSTRAINT "kyc_checks_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "kyb_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reprise des données : l'état des anciens dossiers est conservé (les pièces
-- stockées sur l'ancien S3 AWS ne sont pas reprises : à redéposer).
INSERT INTO "kyb_applications" ("id", "merchant_id", "status", "legal_name", "submitted_at", "decided_at", "decision_reason", "created_at", "updated_at")
SELECT c."id", c."merchant_id",
       (CASE c."status"::text WHEN 'NOT_STARTED' THEN 'DRAFT' WHEN 'NEEDS_MORE' THEN 'INFO_REQUIRED' ELSE c."status"::text END)::"KybStatus",
       m."name",
       CASE WHEN c."status"::text <> 'NOT_STARTED' THEN c."created_at" END,
       c."decided_at", c."rejection_reason", c."created_at", c."updated_at"
FROM "kyc_cases" c JOIN "merchants" m ON m."id" = c."merchant_id";

-- Marchands déjà validés sans dossier : dossier approuvé (le mode live reste ouvert).
INSERT INTO "kyb_applications" ("id", "merchant_id", "status", "legal_name", "decided_at", "created_at", "updated_at")
SELECT gen_random_uuid()::text, m."id", 'APPROVED', m."name", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "merchants" m
WHERE m."onboarding_status" = 'APPROVED' AND NOT EXISTS (SELECT 1 FROM "kyb_applications" a WHERE a."merchant_id" = m."id");

-- Anciennes tables.
DROP TABLE "kyc_documents";
DROP TABLE "kyc_events";
DROP TABLE "kyc_cases";
DROP TYPE "KycDocumentType";
DROP TYPE "KycStatus";
