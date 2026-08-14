-- Migration 13 : équipe marchand multi-tenant (ALP-team).
-- Utilisateurs locaux (miroir Clerk) + memberships + invitations + audit.
-- Étape « expand » : on N'ENLÈVE PAS encore l'unicité merchants.clerk_user_id
-- (retrait dans une migration ultérieure, après bascule du code).

CREATE TYPE "MerchantMemberRole" AS ENUM ('OWNER','ADMIN','MANAGER','MEMBER','VIEWER');
CREATE TYPE "MerchantMemberStatus" AS ENUM ('INVITED','ACTIVE','SUSPENDED','REMOVED');
CREATE TYPE "MerchantMemberEventType" AS ENUM (
  'INVITATION_SENT','INVITATION_ACCEPTED','INVITATION_REVOKED',
  'ROLE_CHANGED','MEMBER_SUSPENDED','MEMBER_REACTIVATED',
  'MEMBER_REMOVED','OWNERSHIP_TRANSFERRED'
);

-- Utilisateurs locaux (miroir Clerk). PII chiffrée comme merchants.
CREATE TABLE "app_users" (
  "id"              TEXT PRIMARY KEY,
  "clerk_user_id"   TEXT UNIQUE,
  "email_encrypted" BYTEA NOT NULL,
  "email_hash"      BYTEA NOT NULL UNIQUE,
  "full_name"       TEXT,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cache dénormalisé du propriétaire (source de vérité = merchant_members).
ALTER TABLE "merchants" ADD COLUMN "owner_user_id" TEXT;
ALTER TABLE "merchants"
  ADD CONSTRAINT "merchants_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL;

-- Appartenance (source de vérité).
CREATE TABLE "merchant_members" (
  "id"           TEXT PRIMARY KEY,
  "merchant_id"  TEXT NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "user_id"      TEXT NOT NULL REFERENCES "app_users"("id"),
  "role"         "MerchantMemberRole"   NOT NULL DEFAULT 'MEMBER',
  "status"       "MerchantMemberStatus" NOT NULL DEFAULT 'INVITED',
  "invited_at"   TIMESTAMPTZ,
  "joined_at"    TIMESTAMPTZ,
  "suspended_at" TIMESTAMPTZ,
  "removed_at"   TIMESTAMPTZ,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "merchant_members_merchant_id_user_id_key" UNIQUE ("merchant_id","user_id")
);

-- Garde-fou : un seul OWNER actif par marchand (index unique partiel).
CREATE UNIQUE INDEX "merchant_members_one_active_owner"
  ON "merchant_members" ("merchant_id")
  WHERE "role" = 'OWNER' AND "status" = 'ACTIVE';

CREATE INDEX "merchant_members_merchant_id_status_idx" ON "merchant_members" ("merchant_id","status");
CREATE INDEX "merchant_members_user_id_status_idx"     ON "merchant_members" ("user_id","status");

-- Invitations (token JAMAIS en clair : token_hash = SHA-256).
CREATE TABLE "merchant_invitations" (
  "id"              TEXT PRIMARY KEY,
  "merchant_id"     TEXT NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "email_hash"      BYTEA NOT NULL,
  "email_encrypted" BYTEA NOT NULL,
  "role"            "MerchantMemberRole" NOT NULL DEFAULT 'MEMBER',
  "token_hash"      TEXT NOT NULL UNIQUE,
  "invited_by"      TEXT NOT NULL REFERENCES "app_users"("id"),
  "expires_at"      TIMESTAMPTZ NOT NULL,
  "accepted_at"     TIMESTAMPTZ,
  "revoked_at"      TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Une seule invitation EN ATTENTE par (marchand,email).
CREATE UNIQUE INDEX "merchant_invitations_one_pending"
  ON "merchant_invitations" ("merchant_id","email_hash")
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;

CREATE INDEX "merchant_invitations_merchant_id_idx" ON "merchant_invitations" ("merchant_id");

-- Audit append-only.
CREATE TABLE "merchant_member_events" (
  "id"            TEXT PRIMARY KEY,
  "merchant_id"   TEXT NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "member_id"     TEXT,
  "actor_user_id" TEXT REFERENCES "app_users"("id") ON DELETE SET NULL,
  "event_type"    "MerchantMemberEventType" NOT NULL,
  "metadata"      JSONB NOT NULL DEFAULT '{}',
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "merchant_member_events_merchant_id_created_at_idx"
  ON "merchant_member_events" ("merchant_id","created_at" DESC);
