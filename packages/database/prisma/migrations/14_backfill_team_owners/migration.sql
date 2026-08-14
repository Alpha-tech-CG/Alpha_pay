-- Migration 14 : backfill de l'équipe pour les marchands existants (ALP-team).
-- Idempotente (ON CONFLICT). Chaque marchand ayant un clerk_user_id devient un
-- app_user + un membership OWNER actif ; le cache merchants.owner_user_id est posé.
-- gen_random_uuid() est natif Postgres >= 13 (image postgres:17).

-- 1) app_users depuis les marchands liés à Clerk.
INSERT INTO "app_users" ("id","clerk_user_id","email_encrypted","email_hash","full_name","created_at","updated_at")
SELECT gen_random_uuid()::text, m."clerk_user_id", m."email_encrypted", m."email_hash", m."name", now(), now()
FROM "merchants" m
WHERE m."clerk_user_id" IS NOT NULL
ON CONFLICT ("clerk_user_id") DO NOTHING;

-- 2) Membership OWNER actif par marchand.
INSERT INTO "merchant_members" ("id","merchant_id","user_id","role","status","invited_at","joined_at","created_at","updated_at")
SELECT gen_random_uuid()::text, m."id", u."id", 'OWNER','ACTIVE', m."created_at", m."created_at", now(), now()
FROM "merchants" m
JOIN "app_users" u ON u."clerk_user_id" = m."clerk_user_id"
WHERE m."clerk_user_id" IS NOT NULL
ON CONFLICT ("merchant_id","user_id") DO NOTHING;

-- 3) Cache owner_user_id.
UPDATE "merchants" m
SET "owner_user_id" = mm."user_id"
FROM "merchant_members" mm
WHERE mm."merchant_id" = m."id" AND mm."role" = 'OWNER' AND mm."status" = 'ACTIVE'
  AND (m."owner_user_id" IS NULL OR m."owner_user_id" <> mm."user_id");

-- 4) Événement d'audit du backfill.
INSERT INTO "merchant_member_events" ("id","merchant_id","member_id","actor_user_id","event_type","metadata","created_at")
SELECT gen_random_uuid()::text, mm."merchant_id", mm."id", mm."user_id", 'OWNERSHIP_TRANSFERRED',
       jsonb_build_object('reason','backfill_initial_owner'), now()
FROM "merchant_members" mm
WHERE mm."role" = 'OWNER' AND mm."status" = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM "merchant_member_events" e
    WHERE e."merchant_id" = mm."merchant_id"
      AND e."event_type" = 'OWNERSHIP_TRANSFERRED'
      AND e."metadata"->>'reason' = 'backfill_initial_owner'
  );
