-- =====================================================================
-- One-shot migration: add the new "user" role (view-only) to existing DBs.
-- Run with:
--   psql -h <host> -U postgres -d rpa_planning -f sql/migration_add_user_role.sql
-- Idempotent: safe to run multiple times.
-- =====================================================================
BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD  CONSTRAINT users_role_check
    CHECK (role IN ('user', 'admin', 'superadmin'));

COMMIT;
