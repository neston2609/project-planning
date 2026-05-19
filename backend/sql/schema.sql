-- =====================================================================
-- RPA Planning Management - PostgreSQL Schema
-- Target: PostgreSQL 13+
-- Run with:  psql -h <host> -U postgres -d <database> -f schema.sql
--
-- Multi-tenant. One Team = one Tenant. Business data is scoped by tenant_id.
-- Per-tenant settings (default_year, license_expiring_days, SMTP) live in
-- tenant_config / smtp_config keyed by tenant_id. The global 'tenantadmin'
-- role (tenant_id IS NULL) manages tenants. The 'default_tenant_id' system
-- key in app_config (global) tracks the home of originally-migrated data.
-- Existing single-tenant databases are migrated automatically by
-- bootstrap.js (backfill + PK/unique swaps + smtp_config + tenant_config).
-- =====================================================================

BEGIN;

-- ---------- Tenants (Teams) ----------
CREATE TABLE IF NOT EXISTS tenants (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------- Auth / users ----------
-- tenant_id is NULL for the global 'tenantadmin' role; NOT NULL for everyone else.
-- usernames are unique PER TENANT (so two tenants can each have a 'superadmin'),
-- and globally unique among tenantadmin (tenant_id IS NULL) accounts. Enforced
-- by two partial unique indexes below (so the in-table column declaration is
-- NOT marked UNIQUE).
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    tenant_id       INT,
    username        VARCHAR(64)  NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL DEFAULT '',
    email           VARCHAR(255) NOT NULL DEFAULT '',
    phone_number    VARCHAR(64)  NOT NULL DEFAULT '',
    role            VARCHAR(32)  NOT NULL CHECK (role IN ('user', 'admin', 'superadmin', 'tenantadmin', 'tenantuser')),
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INT;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD  CONSTRAINT users_role_check
    CHECK (role IN ('user', 'admin', 'superadmin', 'tenantadmin', 'tenantuser'));
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
-- Partial unique indexes for the username rules. bootstrap.js drops the old
-- global UNIQUE constraint (users_username_key) on existing databases before
-- these are created.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_per_tenant_uq
    ON users(tenant_id, username) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_global_uq
    ON users(username) WHERE tenant_id IS NULL;

-- Self-registration: pending records waiting for email confirmation.
CREATE TABLE IF NOT EXISTS pending_registrations (
    id              SERIAL PRIMARY KEY,
    tenant_id       INT,
    username        VARCHAR(64)  NOT NULL,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL DEFAULT '',
    phone_number    VARCHAR(64)  NOT NULL DEFAULT '',
    token           VARCHAR(128) NOT NULL UNIQUE,
    expires_at      TIMESTAMP    NOT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS tenant_id INT;
CREATE INDEX IF NOT EXISTS idx_pending_reg_email ON pending_registrations(email);

CREATE TABLE IF NOT EXISTS login_logs (
    id              SERIAL PRIMARY KEY,
    tenant_id       INT,
    username        VARCHAR(64)  NOT NULL,
    login_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    ip_address      VARCHAR(64)  NOT NULL DEFAULT '',
    status          VARCHAR(16)  NOT NULL CHECK (status IN ('Success', 'Failed')),
    user_agent      TEXT         NOT NULL DEFAULT ''
);
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS tenant_id INT;
CREATE INDEX IF NOT EXISTS idx_login_logs_username ON login_logs(username);
CREATE INDEX IF NOT EXISTS idx_login_logs_login_at ON login_logs(login_at);
CREATE INDEX IF NOT EXISTS idx_login_logs_tenant   ON login_logs(tenant_id);

-- ---------- App / tenant configuration ----------
-- app_config: GLOBAL platform KV (system keys like default_tenant_id only).
CREATE TABLE IF NOT EXISTS app_config (
    key             VARCHAR(64) PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- tenant_config: PER-TENANT KV (default_year, license_expiring_days, etc.).
-- bootstrap.js seeds default rows when a tenant is created.
CREATE TABLE IF NOT EXISTS tenant_config (
    tenant_id   INT NOT NULL,
    key         VARCHAR(64) NOT NULL,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS idx_tenant_config_tenant ON tenant_config(tenant_id);

-- SMTP config — PER TENANT (was a single global row prior to Phase 4;
-- bootstrap.js migrates it). Each tenant manages its own sending account.
CREATE TABLE IF NOT EXISTS smtp_config (
    tenant_id       INT PRIMARY KEY,
    host            VARCHAR(255) NOT NULL DEFAULT 'smtp.gmail.com',
    port            INT          NOT NULL DEFAULT 587,
    secure          BOOLEAN      NOT NULL DEFAULT FALSE,
    username        VARCHAR(255) NOT NULL DEFAULT '',
    password        VARCHAR(255) NOT NULL DEFAULT '',
    from_email      VARCHAR(255) NOT NULL DEFAULT '',
    from_name       VARCHAR(255) NOT NULL DEFAULT 'Planning',
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
ALTER TABLE smtp_config ADD COLUMN IF NOT EXISTS tenant_id INT;

-- Per-year team capacity, tenant-scoped (target = headcount * revenue_per_headcount).
CREATE TABLE IF NOT EXISTS year_config (
    tenant_id             INT NOT NULL,
    year                  INT NOT NULL,
    headcount             INT      NOT NULL DEFAULT 0,
    revenue_per_headcount NUMERIC(18,2) NOT NULL DEFAULT 0,
    updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, year)
);
ALTER TABLE year_config ADD COLUMN IF NOT EXISTS tenant_id INT;

-- ---------- Customers & Resources ----------
CREATE TABLE IF NOT EXISTS customers (
    id                  SERIAL PRIMARY KEY,
    tenant_id           INT,
    alias               VARCHAR(64)  NOT NULL,
    full_name           VARCHAR(512) NOT NULL DEFAULT '',
    contact_name        VARCHAR(255) NOT NULL DEFAULT '',
    contact_email       VARCHAR(255) NOT NULL DEFAULT '',
    contact_phone       VARCHAR(64)  NOT NULL DEFAULT '',
    account_manager     VARCHAR(255) NOT NULL DEFAULT '',
    color_hex           VARCHAR(7)   NOT NULL DEFAULT '#3b82f6',
    logo_data           TEXT,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_manager VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id INT;
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);

CREATE TABLE IF NOT EXISTS resources (
    id              SERIAL PRIMARY KEY,
    tenant_id       INT,
    emp_id          VARCHAR(64),
    first_name      VARCHAR(128) NOT NULL DEFAULT '',
    last_name       VARCHAR(128) NOT NULL DEFAULT '',
    nick_name       VARCHAR(128) NOT NULL DEFAULT '',
    role            VARCHAR(128) NOT NULL DEFAULT '',
    email           VARCHAR(255) NOT NULL DEFAULT '',
    erp_username    VARCHAR(128) NOT NULL DEFAULT '',
    skill           TEXT         NOT NULL DEFAULT '',
    picture_data    TEXT,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS tenant_id INT;
CREATE INDEX IF NOT EXISTS idx_resources_tenant ON resources(tenant_id);

-- ---------- Projects ----------
CREATE TABLE IF NOT EXISTS projects (
    id                   SERIAL PRIMARY KEY,
    tenant_id            INT,
    project_code         VARCHAR(64)  NOT NULL,
    description          TEXT         NOT NULL DEFAULT '',
    customer_id          INT          REFERENCES customers(id) ON DELETE SET NULL,
    project_start_date   DATE,
    project_end_date     DATE,
    status               VARCHAR(16)  NOT NULL CHECK (status IN ('Win','Loss','Pipeline','Backlog')) DEFAULT 'Pipeline',
    pipeline_target_date DATE,
    note                 TEXT         NOT NULL DEFAULT '',
    created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP    NOT NULL DEFAULT NOW()
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tenant_id INT;
CREATE INDEX IF NOT EXISTS idx_projects_status   ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant   ON projects(tenant_id);

-- Subscription License (1 per project)
CREATE TABLE IF NOT EXISTS project_subscriptions (
    id                  SERIAL PRIMARY KEY,
    project_id          INT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    license_name        VARCHAR(255) NOT NULL DEFAULT '',
    license_start_date  DATE,
    license_end_date    DATE,
    license_revenue     NUMERIC(18,2) NOT NULL DEFAULT 0,
    license_cost        NUMERIC(18,2) NOT NULL DEFAULT 0,
    erp_code            VARCHAR(64)   NOT NULL DEFAULT ''
);

-- Perpetual License / SW MA (multi rows)
CREATE TABLE IF NOT EXISTS project_perpetual_ma (
    id                  SERIAL PRIMARY KEY,
    project_id          INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    item_name           VARCHAR(255) NOT NULL DEFAULT '',
    item_type           VARCHAR(16)  NOT NULL CHECK (item_type IN ('License','MA')),
    start_date          DATE,
    end_date            DATE,
    revenue             NUMERIC(18,2) NOT NULL DEFAULT 0,
    cost                NUMERIC(18,2) NOT NULL DEFAULT 0,
    erp_code            VARCHAR(64)   NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_perp_ma_project ON project_perpetual_ma(project_id);

-- Service MA (multi rows)
CREATE TABLE IF NOT EXISTS project_service_ma (
    id                  SERIAL PRIMARY KEY,
    project_id          INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    description         VARCHAR(512) NOT NULL DEFAULT '',
    start_date          DATE,
    end_date            DATE,
    revenue             NUMERIC(18,2) NOT NULL DEFAULT 0,
    cost                NUMERIC(18,2) NOT NULL DEFAULT 0,
    erp_code            VARCHAR(64)   NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_svma_project ON project_service_ma(project_id);

-- Implementation (1 per project)
CREATE TABLE IF NOT EXISTS project_implementation (
    id                       SERIAL PRIMARY KEY,
    project_id               INT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    description              TEXT          NOT NULL DEFAULT '',
    progress_last_year_pct   NUMERIC(7,4)  NOT NULL DEFAULT 0,
    progress_this_year_pct   NUMERIC(7,4)  NOT NULL DEFAULT 0,
    revenue                  NUMERIC(18,2) NOT NULL DEFAULT 0,
    cost                     NUMERIC(18,2) NOT NULL DEFAULT 0,
    erp_code                 VARCHAR(64)   NOT NULL DEFAULT ''
);

-- Outsource (1 per project) + monthly breakdown for Man-Month type
CREATE TABLE IF NOT EXISTS project_outsource (
    id                  SERIAL PRIMARY KEY,
    project_id          INT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    outsource_type      VARCHAR(16)  NOT NULL CHECK (outsource_type IN ('Man-Month','Man-Year')),
    description         VARCHAR(512) NOT NULL DEFAULT '',
    start_date          DATE,
    end_date            DATE,
    revenue             NUMERIC(18,2) NOT NULL DEFAULT 0,
    cost                NUMERIC(18,2) NOT NULL DEFAULT 0,
    erp_code            VARCHAR(64)   NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS project_outsource_monthly (
    id                  SERIAL PRIMARY KEY,
    project_outsource_id INT NOT NULL REFERENCES project_outsource(id) ON DELETE CASCADE,
    year                INT NOT NULL,
    month               INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    revenue             NUMERIC(18,2) NOT NULL DEFAULT 0,
    cost                NUMERIC(18,2) NOT NULL DEFAULT 0,
    UNIQUE (project_outsource_id, year, month)
);

-- ---------- Customer Licenses (CR#4) ----------
CREATE TABLE IF NOT EXISTS customer_licenses (
    id              SERIAL PRIMARY KEY,
    tenant_id       INT,
    customer_id     INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    license_name    VARCHAR(255) NOT NULL DEFAULT '',
    vendor          VARCHAR(255) NOT NULL DEFAULT '',
    quantity        INT          NOT NULL DEFAULT 1,
    license_key     TEXT         NOT NULL DEFAULT '',
    note            TEXT         NOT NULL DEFAULT '',
    start_date      DATE,
    expired_date    DATE,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
ALTER TABLE customer_licenses ADD COLUMN IF NOT EXISTS tenant_id INT;
CREATE INDEX IF NOT EXISTS idx_customer_licenses_customer ON customer_licenses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_licenses_expired  ON customer_licenses(expired_date);
CREATE INDEX IF NOT EXISTS idx_customer_licenses_tenant   ON customer_licenses(tenant_id);

-- ---------- Resource assignments (Gantt) ----------
CREATE TABLE IF NOT EXISTS resource_assignments (
    id              SERIAL PRIMARY KEY,
    resource_id     INT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    project_id      INT NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    note            VARCHAR(512) NOT NULL DEFAULT '',
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_ra_resource ON resource_assignments(resource_id);
CREATE INDEX IF NOT EXISTS idx_ra_project  ON resource_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_ra_dates    ON resource_assignments(start_date, end_date);

-- ---------- updated_at trigger ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'tenants','users','customers','resources','projects',
        'smtp_config','year_config','tenant_config','customer_licenses'
    ]) LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%s_upd ON %I; '
            'CREATE TRIGGER trg_%s_upd BEFORE UPDATE ON %I '
            'FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
            t, t, t, t
        );
    END LOOP;
END $$;

COMMIT;
