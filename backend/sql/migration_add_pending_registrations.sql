-- =====================================================================
-- One-shot migration: add the pending_registrations table for self-signup.
-- Run with:
--   psql -h <host> -U postgres -d rpa_planning -f sql/migration_add_pending_registrations.sql
-- Idempotent.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS pending_registrations (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(64)  NOT NULL,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL DEFAULT '',
    phone_number    VARCHAR(64)  NOT NULL DEFAULT '',
    token           VARCHAR(128) NOT NULL UNIQUE,
    expires_at      TIMESTAMP    NOT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_reg_email ON pending_registrations(email);

COMMIT;
