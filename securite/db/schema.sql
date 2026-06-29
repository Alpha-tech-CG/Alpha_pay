-- =============================================================================
-- PayBrain — Schéma sécurisé v2
-- =============================================================================
-- Améliorations vs v1 :
--   * Montants en BIGINT centimes (jamais DECIMAL/Number)
--   * Clés API hashées (Argon2id), préfixe en clair pour identification rapide
--   * PII chiffrées (AES-256-GCM) + hash HMAC pour recherche + masque affichable
--   * Ledger double-entrée immuable avec hash chain
--   * Triggers anti-UPDATE/DELETE sur journal_entries et audit_log
--   * Idempotency records avec TTL
--   * Audit log immutable de toutes les actions sensibles
--   * Machine d'état stricte sur transactions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- -----------------------------------------------------------------------------
-- 1. MARCHANDS
-- -----------------------------------------------------------------------------
CREATE TABLE merchants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- email chiffré + hash pour recherche + masque pour affichage
  email_enc       BYTEA NOT NULL,
  email_hash      BYTEA NOT NULL UNIQUE,            -- HMAC-SHA-256 pour SELECT
  email_mask      TEXT NOT NULL,                    -- "jo***@example.com"
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','active','suspended','closed')),
  kyc_status      TEXT NOT NULL DEFAULT 'not_started'
                  CHECK (kyc_status IN ('not_started','submitted','in_review','approved','rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. CLÉS API (hashées Argon2id)
-- -----------------------------------------------------------------------------
CREATE TABLE api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  -- préfixe en clair pour identification rapide (ex. "pk_live_xxxxxxxx")
  prefix          TEXT NOT NULL UNIQUE,
  -- hash Argon2id du reste de la clé (jamais la clé complète)
  hash            TEXT NOT NULL,
  -- mode : live ou test
  mode            TEXT NOT NULL CHECK (mode IN ('live','test')),
  -- scopes
  scopes          TEXT[] NOT NULL DEFAULT '{}',
  -- restrictions optionnelles
  ip_allowlist    CIDR[],
  -- métadonnées
  name            TEXT,
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,                       -- expiration optionnelle
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID                               -- merchant user id si pertinent
);

CREATE INDEX idx_api_keys_prefix ON api_keys (prefix) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_merchant ON api_keys (merchant_id);

-- -----------------------------------------------------------------------------
-- 3. COMPTES DU GRAND LIVRE
-- -----------------------------------------------------------------------------
CREATE TABLE accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (type IN ('merchant','transit','fee','operator','external')),
  owner_id        UUID,                              -- merchant_id si type='merchant'
  currency        CHAR(3) NOT NULL CHECK (currency = 'XAF'),
  label           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (type, owner_id, currency)
);

CREATE INDEX idx_accounts_owner ON accounts (owner_id) WHERE owner_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. TRANSACTIONS (regroupement logique)
-- -----------------------------------------------------------------------------
CREATE TABLE transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID NOT NULL REFERENCES merchants(id),
  idempotency_key     TEXT NOT NULL,
  external_id         TEXT NOT NULL,
  -- montant en centimes (entier), positif
  amount_cents        BIGINT NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 500000000),
  currency            CHAR(3) NOT NULL DEFAULT 'XAF',
  -- machine d'état stricte
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','succeeded','failed','cancelled','refunded')),
  -- pour optimistic locking
  version             INTEGER NOT NULL DEFAULT 1,
  -- métadonnées paiement
  provider            TEXT NOT NULL,                 -- 'mtn', 'airtel', 'bank', 'card'
  provider_ref        TEXT,                          -- référence chez le provider
  -- PII chiffrées
  payer_phone_enc     BYTEA NOT NULL,
  payer_phone_hash    BYTEA NOT NULL,                -- HMAC pour recherche
  payer_phone_mask    TEXT NOT NULL,                 -- "242****6789"
  description         TEXT CHECK (length(description) <= 200),
  failure_reason      TEXT,
  -- timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  succeeded_at        TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ,
  UNIQUE (merchant_id, idempotency_key)
);

CREATE INDEX idx_tx_merchant_created ON transactions (merchant_id, created_at DESC);
CREATE INDEX idx_tx_provider_ref ON transactions (provider, provider_ref);
CREATE INDEX idx_tx_status ON transactions (status) WHERE status IN ('pending','processing');
CREATE INDEX idx_tx_payer_phone_hash ON transactions (payer_phone_hash);

-- -----------------------------------------------------------------------------
-- 5. JOURNAL ENTRIES (double-entrée, append-only, chaîné)
-- -----------------------------------------------------------------------------
CREATE TABLE journal_entries (
  id              BIGSERIAL PRIMARY KEY,
  transaction_id  UUID NOT NULL REFERENCES transactions(id),
  account_id      UUID NOT NULL REFERENCES accounts(id),
  debit_cents     BIGINT NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
  credit_cents   BIGINT NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
  currency        CHAR(3) NOT NULL CHECK (currency = 'XAF'),
  -- chaînage cryptographique : hash = SHA256(prev_hash || canonical(entry))
  prev_hash       BYTEA,
  hash            BYTEA NOT NULL,
  -- métadonnées
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- contrainte : exactement une colonne non-zéro (débit XOR crédit)
  CHECK ((debit_cents = 0) <> (credit_cents = 0))
);

CREATE INDEX idx_journal_tx ON journal_entries (transaction_id);
CREATE INDEX idx_journal_account ON journal_entries (account_id, created_at);

-- Triggers : journal_entries est immutable
CREATE OR REPLACE FUNCTION prevent_modify_journal() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'journal_entries is append-only — corrections via contre-écriture uniquement';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_no_update BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_modify_journal();
CREATE TRIGGER journal_no_delete BEFORE DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_modify_journal();

-- -----------------------------------------------------------------------------
-- 6. IDEMPOTENCY RECORDS
-- -----------------------------------------------------------------------------
CREATE TABLE idempotency_records (
  id                BIGSERIAL PRIMARY KEY,
  merchant_id       UUID NOT NULL REFERENCES merchants(id),
  idempotency_key   TEXT NOT NULL,
  endpoint          TEXT NOT NULL,                    -- ex. 'POST /v1/payments'
  request_hash      BYTEA NOT NULL,                   -- SHA-256 du body canonique
  response_status   INTEGER,
  response_body     JSONB,
  locked_until      TIMESTAMPTZ,                      -- verrou en cours de traitement
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  UNIQUE (merchant_id, idempotency_key, endpoint)
);

CREATE INDEX idx_idemp_expires ON idempotency_records (expires_at);

-- -----------------------------------------------------------------------------
-- 7. WEBHOOK EVENTS REÇUS (entrants depuis opérateurs)
-- -----------------------------------------------------------------------------
CREATE TABLE webhook_events_inbound (
  id                BIGSERIAL PRIMARY KEY,
  provider          TEXT NOT NULL,
  -- ID de l'event côté provider (pour dédup)
  provider_event_id TEXT NOT NULL,
  -- HMAC du body pour preuve d'authenticité
  signature_hex     TEXT NOT NULL,
  timestamp_header  BIGINT NOT NULL,
  raw_body          JSONB NOT NULL,
  status            TEXT NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received','processing','processed','failed','dlq')),
  attempts          INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX idx_wh_in_status ON webhook_events_inbound (status) WHERE status IN ('received','processing');

-- -----------------------------------------------------------------------------
-- 8. WEBHOOKS SORTANTS (vers marchands)
-- -----------------------------------------------------------------------------
CREATE TABLE webhooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  -- secret hashé (HMAC envoyée en utilisant le secret en clair en RAM uniquement à la création)
  secret_enc      BYTEA NOT NULL,                    -- chiffré KMS
  events          TEXT[] NOT NULL,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (url ~ '^https://')                          -- HTTPS obligatoire
);

CREATE TABLE webhook_deliveries (
  id              BIGSERIAL PRIMARY KEY,
  webhook_id      UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL,                      -- ID unique pour idempotence côté marchand
  event_type      TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_retry_at   TIMESTAMPTZ,
  last_response   JSONB,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wh_out_pending ON webhook_deliveries (next_retry_at) WHERE status = 'pending';

-- -----------------------------------------------------------------------------
-- 9. AUDIT LOG (append-only, chaîné)
-- -----------------------------------------------------------------------------
CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,
  actor_type      TEXT NOT NULL CHECK (actor_type IN ('merchant','admin','system','provider')),
  actor_id        UUID,
  action          TEXT NOT NULL,                      -- 'payment.create', 'key.rotate', etc.
  resource_type   TEXT NOT NULL,
  resource_id     TEXT,
  ip              INET,
  user_agent      TEXT,
  request_id      UUID,
  trace_id        TEXT,
  before_state    JSONB,
  after_state     JSONB,
  prev_hash       BYTEA,
  hash            BYTEA NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON audit_log (actor_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_log (resource_type, resource_id);

CREATE OR REPLACE FUNCTION prevent_modify_audit() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_modify_audit();
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_modify_audit();

-- -----------------------------------------------------------------------------
-- 10. PAYMENT LINKS
-- -----------------------------------------------------------------------------
CREATE TABLE payment_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),
  -- token URL-safe (256 bits, base64url) — non devinable
  token           TEXT NOT NULL UNIQUE,
  amount_cents    BIGINT NOT NULL CHECK (amount_cents > 0),
  currency        CHAR(3) NOT NULL DEFAULT 'XAF',
  description     TEXT CHECK (length(description) <= 200),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','used','expired','cancelled')),
  used_by_tx_id   UUID REFERENCES transactions(id),
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_paylink_token ON payment_links (token) WHERE status = 'active';

-- -----------------------------------------------------------------------------
-- 11. PERMISSIONS POSTGRESQL — least privilege
-- -----------------------------------------------------------------------------
-- Rôle applicatif (ce que l'app utilise en runtime)
CREATE ROLE paybrain_app NOLOGIN;
GRANT CONNECT ON DATABASE postgres TO paybrain_app;
GRANT USAGE ON SCHEMA public TO paybrain_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO paybrain_app;
-- Pas de DELETE — toutes les "suppressions" sont des soft-deletes ou contre-écritures
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM paybrain_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO paybrain_app;

-- Rôle migrations (séparé, utilisé uniquement par les migrations CI)
CREATE ROLE paybrain_migrate NOLOGIN;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO paybrain_migrate;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO paybrain_migrate;

-- -----------------------------------------------------------------------------
-- 12. VUES UTILES (read-only)
-- -----------------------------------------------------------------------------
-- Solde de chaque compte (calculé depuis le journal)
CREATE VIEW account_balances AS
SELECT
  a.id AS account_id,
  a.type,
  a.owner_id,
  a.currency,
  COALESCE(SUM(j.credit_cents - j.debit_cents), 0) AS balance_cents
FROM accounts a
LEFT JOIN journal_entries j ON j.account_id = a.id
GROUP BY a.id;
