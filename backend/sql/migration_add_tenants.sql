-- =====================================================================
-- Phase 1: Multi-tenancy structural migration. Idempotent / non-destructive.
--
-- This adds the tenants table + nullable tenant_id columns + widens the
-- users.role CHECK. The DATA backfill (assigning existing rows to the
-- 'Automation Excellence' tenant), the year_config primary-key swap and the
-- per-tenant UNIQUE constraint swaps are performed by backend bootstrap.js
-- AFTER this runs (they depend on the tenant row existing first).
--
-- bootstrap.js applies schema.sql on every start, so running this file
-- by hand is optional — it's provided for manual/explicit migration.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tenants (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE users                 ADD COLUMN IF NOT EXISTS tenant_id INT;
ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS tenant_id INT;
ALTER TABLE login_logs            ADD COLUMN IF NOT EXISTS tenant_id INT;
ALTER TABLE year_config           ADD COLUMN IF NOT EXISTS tenant_id INT;
ALTER TABLE customers             ADD COLUMN IF NOT EXISTS tenant_id INT;
ALTER TABLE resources             ADD COLUMN IF NOT EXISTS tenant_id INT;
ALTER TABLE projects              ADD COLUMN IF NOT EXISTS tenant_id INT;
ALTER TABLE customer_licenses     ADD COLUMN IF NOT EXISTS tenant_id INT;

-- Widen the users.role CHECK to allow the global 'tenantadmin' role.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD  CONSTRAINT users_role_check
    CHECK (role IN ('user', 'admin', 'superadmin', 'tenantadmin'));

CREATE INDEX IF NOT EXISTS idx_users_tenant             ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_tenant        ON login_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant         ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_resources_tenant         ON resources(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant          ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_licenses_tenant ON customer_licenses(tenant_id);

COMMIT;
