-- T-74 / T-75 / T-76 / T-77 : Recouvrer — clients, factures, relances, reçus.

-- ─── Clients ────────────────────────────────────────────────────────────────

CREATE TABLE "customers" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id" UUID        NOT NULL,
  "name"        TEXT        NOT NULL,
  "email"       TEXT,
  "phone"       TEXT,
  "address"     TEXT,
  "metadata"    JSONB       NOT NULL DEFAULT '{}',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customers_merchant_idx" ON "customers" ("merchant_id", "created_at" DESC);

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

-- ─── Compteur de factures par marchand (numérotation sans trou) ───────────

CREATE TABLE "invoice_counters" (
  "merchant_id" UUID    NOT NULL,
  "last_seq"    INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("merchant_id")
);

ALTER TABLE "invoice_counters"
  ADD CONSTRAINT "invoice_counters_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

-- ─── Statuts de facture ───────────────────────────────────────────────────

CREATE TYPE "InvoiceStatus" AS ENUM (
  'DRAFT',      -- brouillon, non envoyée
  'SENT',       -- envoyée au client, en attente de paiement
  'PARTIAL',    -- versement(s) reçu(s), solde restant
  'PAID',       -- entièrement réglée
  'VOID',       -- annulée
  'OVERDUE'     -- échéance dépassée, relance active
);

-- ─── Factures ─────────────────────────────────────────────────────────────

CREATE TABLE "invoices" (
  "id"            UUID            NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id"   UUID            NOT NULL,
  "customer_id"   UUID,
  "livemode"      BOOLEAN         NOT NULL DEFAULT false,
  -- Numéro lisible ex. "INV-2026-00042" (généré au moment de SENT)
  "number"        TEXT,
  "status"        "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "currency"      TEXT            NOT NULL DEFAULT 'XAF',
  -- Montants en centimes
  "subtotal"      BIGINT          NOT NULL DEFAULT 0,
  "tax_amount"    BIGINT          NOT NULL DEFAULT 0,
  "total"         BIGINT          NOT NULL DEFAULT 0,
  "amount_paid"   BIGINT          NOT NULL DEFAULT 0,
  "amount_due"    BIGINT          NOT NULL DEFAULT 0,
  -- Dates
  "issue_date"    DATE            NOT NULL DEFAULT CURRENT_DATE,
  "due_date"      DATE,
  -- Textes libres
  "notes"         TEXT,
  "footer"        TEXT,
  -- Lien de paiement intégré (crée un PaymentLink AlphaPay)
  "payment_link_id" UUID,
  -- PDF généré et stocké via FileStorage
  "pdf_key"       TEXT,
  "created_at"    TIMESTAMPTZ     NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoices_merchant_idx" ON "invoices" ("merchant_id", "created_at" DESC);
CREATE INDEX "invoices_customer_idx" ON "invoices" ("customer_id", "created_at" DESC);
CREATE INDEX "invoices_status_idx"   ON "invoices" ("merchant_id", "status");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_customer_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE SET NULL;

-- ─── Lignes de facture ────────────────────────────────────────────────────

CREATE TABLE "invoice_lines" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "invoice_id"  UUID        NOT NULL,
  "description" TEXT        NOT NULL,
  "quantity"    NUMERIC(10,3) NOT NULL DEFAULT 1,
  "unit_price"  BIGINT      NOT NULL,
  "tax_rate"    NUMERIC(5,2) NOT NULL DEFAULT 0,
  "amount"      BIGINT      NOT NULL,  -- quantity * unit_price (arrondi)
  "sort_order"  SMALLINT    NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" ("invoice_id", "sort_order");

ALTER TABLE "invoice_lines"
  ADD CONSTRAINT "invoice_lines_invoice_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE CASCADE;

-- ─── Versements (T-75) ────────────────────────────────────────────────────

CREATE TABLE "invoice_installments" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "invoice_id"      UUID        NOT NULL,
  "due_date"        DATE        NOT NULL,
  "amount"          BIGINT      NOT NULL,
  "paid_amount"     BIGINT      NOT NULL DEFAULT 0,
  "status"          TEXT        NOT NULL DEFAULT 'PENDING',  -- PENDING|PARTIAL|PAID
  -- Lien de paiement dédié à ce versement
  "payment_link_id" UUID,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "invoice_installments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_installments_invoice_idx" ON "invoice_installments" ("invoice_id", "due_date");

ALTER TABLE "invoice_installments"
  ADD CONSTRAINT "invoice_installments_invoice_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE CASCADE;

-- ─── Relances (T-76) ─────────────────────────────────────────────────────

CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');
CREATE TYPE "ReminderChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

CREATE TABLE "invoice_reminders" (
  "id"                  UUID              NOT NULL DEFAULT gen_random_uuid(),
  "invoice_id"          UUID              NOT NULL,
  "installment_id"      UUID,
  "channel"             "ReminderChannel" NOT NULL DEFAULT 'SMS',
  "status"              "ReminderStatus"  NOT NULL DEFAULT 'PENDING',
  -- Nombre de jours par rapport à l'échéance (négatif = avant, 0 = jour J, positif = après)
  "days_offset"         SMALLINT          NOT NULL,
  "scheduled_for"       TIMESTAMPTZ       NOT NULL,
  "sent_at"             TIMESTAMPTZ,
  "error"               TEXT,
  "created_at"          TIMESTAMPTZ       NOT NULL DEFAULT now(),

  CONSTRAINT "invoice_reminders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_reminders_pending_idx"
  ON "invoice_reminders" ("scheduled_for")
  WHERE "status" = 'PENDING';

ALTER TABLE "invoice_reminders"
  ADD CONSTRAINT "invoice_reminders_invoice_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE CASCADE;

ALTER TABLE "invoice_reminders"
  ADD CONSTRAINT "invoice_reminders_installment_fkey"
    FOREIGN KEY ("installment_id") REFERENCES "invoice_installments" ("id") ON DELETE SET NULL;

-- ─── Reçus (T-77) ────────────────────────────────────────────────────────

CREATE TABLE "receipts" (
  "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
  "merchant_id"   UUID        NOT NULL,
  "invoice_id"    UUID,
  "transaction_id" UUID,
  "number"        TEXT        NOT NULL,  -- numéroté sans trou par marchand
  "amount"        BIGINT      NOT NULL,
  "currency"      TEXT        NOT NULL DEFAULT 'XAF',
  "livemode"      BOOLEAN     NOT NULL DEFAULT false,
  "pdf_key"       TEXT,
  "sent_at"       TIMESTAMPTZ,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "receipts_merchant_idx" ON "receipts" ("merchant_id", "created_at" DESC);

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_merchant_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants" ("id") ON DELETE CASCADE;

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_invoice_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE SET NULL;
