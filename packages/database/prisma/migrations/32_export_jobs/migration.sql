-- T-73 : Exports CSV/Excel en tâche de fond (§M6).

CREATE TYPE "ExportJobStatus" AS ENUM (
  'PENDING',    -- en attente dans la file
  'PROCESSING', -- en cours de génération
  'DONE',       -- fichier disponible
  'FAILED'      -- erreur non récupérable
);

CREATE TYPE "ExportFormat" AS ENUM ('CSV', 'XLSX');

CREATE TABLE "export_jobs" (
  "id"            UUID                NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id"   UUID                NOT NULL,
  "requested_by"  UUID                NOT NULL,
  "livemode"      BOOLEAN             NOT NULL DEFAULT false,
  "status"        "ExportJobStatus"   NOT NULL DEFAULT 'PENDING',
  "format"        "ExportFormat"      NOT NULL DEFAULT 'CSV',
  -- Filtres appliqués (stockés pour réémission et audit)
  "filters"       JSONB               NOT NULL DEFAULT '{}',
  -- Résultats
  "row_count"     INTEGER,
  "file_key"      TEXT,         -- clé dans FileStorage
  "download_url"  TEXT,         -- URL signée (valable EXPORT_URL_TTL_S)
  "url_expires_at" TIMESTAMPTZ,
  "error"         TEXT,
  "created_at"    TIMESTAMPTZ         NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ         NOT NULL DEFAULT now(),
  "completed_at"  TIMESTAMPTZ,

  CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "export_jobs_merchant_idx"
  ON "export_jobs" ("merchant_id", "created_at" DESC);

ALTER TABLE "export_jobs"
  ADD CONSTRAINT "export_jobs_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

ALTER TABLE "export_jobs"
  ADD CONSTRAINT "export_jobs_requested_by_fkey"
    FOREIGN KEY ("requested_by") REFERENCES "merchant_members" ("id");
