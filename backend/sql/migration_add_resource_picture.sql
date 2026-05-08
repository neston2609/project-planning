-- =====================================================================
-- One-shot migration: add resource picture column to existing DBs.
-- Run with:
--   psql -h <host> -U postgres -d rpa_planning -f sql/migration_add_resource_picture.sql
-- Idempotent.
-- =====================================================================
BEGIN;

ALTER TABLE resources ADD COLUMN IF NOT EXISTS picture_data TEXT;

COMMIT;
