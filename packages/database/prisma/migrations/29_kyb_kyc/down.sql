-- Migration inverse de 29_kyb_kyc (manuelle : psql -f down.sql).
-- Recrée les tables Smile ID (structure de 00_init) avec l'état des dossiers ; pièces et KYC perdus.
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_MORE');
CREATE TYPE "KycDocumentType" AS ENUM ('ID_FRONT', 'ID_BACK', 'RCCM', 'NIU', 'STATUTES', 'PROOF_OF_ADDRESS');

CREATE TABLE "kyc_cases" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "smile_score" INTEGER,
    "smile_job_id" TEXT,
    "screening_hit" BOOLEAN NOT NULL DEFAULT false,
    "screening_lists" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_screened_at" TIMESTAMP(3),
    "decision" TEXT,
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "re_kyc_due_at" TIMESTAMP(3),
    "re_kyc_started_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "kyc_cases_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "kyc_documents" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "type" "KycDocumentType" NOT NULL,
    "s3_key" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "kyc_events" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "kyc_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "kyc_cases_merchant_id_key" ON "kyc_cases"("merchant_id");
CREATE UNIQUE INDEX "kyc_cases_smile_job_id_key" ON "kyc_cases"("smile_job_id");
CREATE UNIQUE INDEX "kyc_documents_case_id_type_key" ON "kyc_documents"("case_id", "type");
CREATE INDEX "kyc_events_case_id_idx" ON "kyc_events"("case_id");
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "kyc_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kyc_events" ADD CONSTRAINT "kyc_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "kyc_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "kyc_cases" ("id", "merchant_id", "status", "decided_at", "rejection_reason", "created_at", "updated_at")
SELECT "id", "merchant_id",
       (CASE "status"::text WHEN 'DRAFT' THEN 'NOT_STARTED' WHEN 'INFO_REQUIRED' THEN 'NEEDS_MORE' ELSE "status"::text END)::"KycStatus",
       "decided_at", "decision_reason", "created_at", "updated_at"
FROM "kyb_applications";

DROP TABLE "kyc_checks";
DROP TABLE "kyb_events";
DROP TABLE "kyb_documents";
DROP TABLE "kyb_applications";
DROP TYPE "KycCheckStatus";
DROP TYPE "KybDocumentType";
DROP TYPE "KybStatus";
