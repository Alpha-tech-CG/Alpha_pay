-- T-90 : Comptes du personnel AlphaPay — OTP obligatoire, rôles cloisonnés.

CREATE TYPE "StaffRole" AS ENUM (
  'SUPPORT',       -- lecture marchands, kyb, paiements ; aucune écriture financière
  'COMPLIANCE',    -- revue KYB, suspension, validation finale
  'SUPER_ADMIN'    -- tout ; doit être le moins nombreux possible
);

CREATE TABLE "staff_users" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "email"           TEXT        NOT NULL UNIQUE,
  "display_name"    TEXT        NOT NULL,
  "role"            "StaffRole" NOT NULL DEFAULT 'SUPPORT',
  -- Authentification : hachage bcrypt du mot de passe initial
  "password_hash"   TEXT        NOT NULL,
  -- OTP TOTP (secret chiffré avec la clé d'application)
  "totp_secret_enc" TEXT,
  "totp_enabled"    BOOLEAN     NOT NULL DEFAULT false,
  "is_active"       BOOLEAN     NOT NULL DEFAULT true,
  "last_login_at"   TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- Sessions du personnel (stockées en base, TTL 8 h)
CREATE TABLE "staff_sessions" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "staff_id"    UUID        NOT NULL,
  "token_hash"  TEXT        NOT NULL UNIQUE,  -- SHA-256 du jeton opaque
  "ip"          TEXT,
  "user_agent"  TEXT,
  "expires_at"  TIMESTAMPTZ NOT NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "staff_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_sessions_staff_idx"  ON "staff_sessions" ("staff_id");
CREATE INDEX "staff_sessions_expiry_idx" ON "staff_sessions" ("expires_at");

ALTER TABLE "staff_sessions"
  ADD CONSTRAINT "staff_sessions_staff_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff_users" ("id") ON DELETE CASCADE;

-- Journal d'accès du personnel (audit T-94)
CREATE TABLE "staff_access_log" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "staff_id"    UUID        NOT NULL,
  "action"      TEXT        NOT NULL,  -- ex. "kyb.decide", "merchant.suspend"
  "target_id"   UUID,                  -- marchand ou entité concernée
  "detail"      JSONB       NOT NULL DEFAULT '{}',
  "ip"          TEXT,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "staff_access_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_access_log_staff_idx"  ON "staff_access_log" ("staff_id", "created_at" DESC);
CREATE INDEX "staff_access_log_target_idx" ON "staff_access_log" ("target_id", "created_at" DESC);

ALTER TABLE "staff_access_log"
  ADD CONSTRAINT "staff_access_log_staff_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff_users" ("id");
