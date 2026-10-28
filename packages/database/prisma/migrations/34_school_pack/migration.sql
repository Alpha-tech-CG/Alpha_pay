-- T-78/T-79/T-80 : Pack École — années, classes, élèves, responsables, grilles de frais.

-- ─── Années scolaires ─────────────────────────────────────────────────────

CREATE TABLE "school_years" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id" UUID        NOT NULL,
  "label"       TEXT        NOT NULL,   -- ex. "2026-2027"
  "starts_on"   DATE        NOT NULL,
  "ends_on"     DATE        NOT NULL,
  "is_active"   BOOLEAN     NOT NULL DEFAULT false,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "school_years_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "school_years_merchant_idx" ON "school_years" ("merchant_id");

ALTER TABLE "school_years"
  ADD CONSTRAINT "school_years_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

-- ─── Classes ──────────────────────────────────────────────────────────────

CREATE TABLE "school_classes" (
  "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
  "school_year_id" UUID       NOT NULL,
  "merchant_id"   UUID        NOT NULL,
  "name"          TEXT        NOT NULL,   -- ex. "6ème A"
  "capacity"      INTEGER,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "school_classes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "school_classes_year_idx" ON "school_classes" ("school_year_id");

ALTER TABLE "school_classes"
  ADD CONSTRAINT "school_classes_year_fkey"
    FOREIGN KEY ("school_year_id") REFERENCES "school_years" ("id") ON DELETE CASCADE;

ALTER TABLE "school_classes"
  ADD CONSTRAINT "school_classes_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

-- ─── Élèves ───────────────────────────────────────────────────────────────

CREATE TABLE "students" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id"     UUID        NOT NULL,
  "school_class_id" UUID,
  "first_name"      TEXT        NOT NULL,
  "last_name"       TEXT        NOT NULL,
  "date_of_birth"   DATE,
  "gender"          TEXT,        -- M / F / autres
  "registration_no" TEXT,        -- numéro d'inscription interne
  "metadata"        JSONB       NOT NULL DEFAULT '{}',
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "students_merchant_idx"  ON "students" ("merchant_id");
CREATE INDEX "students_class_idx"     ON "students" ("school_class_id");

ALTER TABLE "students"
  ADD CONSTRAINT "students_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

ALTER TABLE "students"
  ADD CONSTRAINT "students_class_fkey"
    FOREIGN KEY ("school_class_id") REFERENCES "school_classes" ("id") ON DELETE SET NULL;

-- ─── Responsables légaux ──────────────────────────────────────────────────

CREATE TABLE "guardians" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id" UUID        NOT NULL,
  "student_id"  UUID        NOT NULL,
  "name"        TEXT        NOT NULL,
  "phone"       TEXT,
  "email"       TEXT,
  "relation"    TEXT,        -- père, mère, tuteur…
  "is_primary"  BOOLEAN     NOT NULL DEFAULT false,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guardians_student_idx" ON "guardians" ("student_id");

ALTER TABLE "guardians"
  ADD CONSTRAINT "guardians_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

ALTER TABLE "guardians"
  ADD CONSTRAINT "guardians_student_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE CASCADE;

-- ─── Grilles de frais ─────────────────────────────────────────────────────

CREATE TABLE "fee_grids" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id"     UUID        NOT NULL,
  "school_year_id"  UUID        NOT NULL,
  "school_class_id" UUID,        -- null = grille commune à toutes les classes de l'année
  "label"           TEXT        NOT NULL,
  "currency"        TEXT        NOT NULL DEFAULT 'XAF',
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "fee_grids_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fee_grids_year_idx"  ON "fee_grids" ("school_year_id");
CREATE INDEX "fee_grids_class_idx" ON "fee_grids" ("school_class_id");

ALTER TABLE "fee_grids"
  ADD CONSTRAINT "fee_grids_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

ALTER TABLE "fee_grids"
  ADD CONSTRAINT "fee_grids_year_fkey"
    FOREIGN KEY ("school_year_id") REFERENCES "school_years" ("id") ON DELETE CASCADE;

ALTER TABLE "fee_grids"
  ADD CONSTRAINT "fee_grids_class_fkey"
    FOREIGN KEY ("school_class_id") REFERENCES "school_classes" ("id") ON DELETE SET NULL;

-- ─── Lignes de grille ─────────────────────────────────────────────────────

CREATE TABLE "fee_grid_lines" (
  "id"          UUID       NOT NULL DEFAULT gen_random_uuid(),
  "fee_grid_id" UUID       NOT NULL,
  "label"       TEXT       NOT NULL,    -- ex. "Frais d'inscription"
  "amount"      BIGINT     NOT NULL,    -- centimes
  "due_date"    DATE,                   -- date limite de paiement
  "sort_order"  SMALLINT   NOT NULL DEFAULT 0,
  CONSTRAINT "fee_grid_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fee_grid_lines_grid_idx" ON "fee_grid_lines" ("fee_grid_id", "sort_order");

ALTER TABLE "fee_grid_lines"
  ADD CONSTRAINT "fee_grid_lines_grid_fkey"
    FOREIGN KEY ("fee_grid_id") REFERENCES "fee_grids" ("id") ON DELETE CASCADE;

-- ─── Échéanciers élèves ───────────────────────────────────────────────────

CREATE TABLE "student_fee_schedules" (
  "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id"       UUID        NOT NULL,
  "student_id"        UUID        NOT NULL,
  "fee_grid_line_id"  UUID        NOT NULL,
  "invoice_id"        UUID,               -- facture AlphaPay liée
  "amount"            BIGINT      NOT NULL,
  "amount_paid"       BIGINT      NOT NULL DEFAULT 0,
  "due_date"          DATE,
  "status"            TEXT        NOT NULL DEFAULT 'PENDING',  -- PENDING|PAID
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "student_fee_schedules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sfs_student_idx"  ON "student_fee_schedules" ("student_id");
CREATE INDEX "sfs_merchant_idx" ON "student_fee_schedules" ("merchant_id", "status");

ALTER TABLE "student_fee_schedules"
  ADD CONSTRAINT "sfs_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

ALTER TABLE "student_fee_schedules"
  ADD CONSTRAINT "sfs_student_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON DELETE CASCADE;

ALTER TABLE "student_fee_schedules"
  ADD CONSTRAINT "sfs_fee_grid_line_fkey"
    FOREIGN KEY ("fee_grid_line_id") REFERENCES "fee_grid_lines" ("id");

ALTER TABLE "student_fee_schedules"
  ADD CONSTRAINT "sfs_invoice_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE SET NULL;
