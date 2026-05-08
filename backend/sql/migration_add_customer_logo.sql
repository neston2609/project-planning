-- =====================================================================
-- One-shot migration: add customer logo column to existing DBs.
-- Run with:
--   psql -h <host> -U postgres -d rpa_planning -f sql/migration_add_customer_logo.sql
-- Idempotent.
-- =====================================================================
BEGIN;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS logo_data TEXT;

COMMIT;
