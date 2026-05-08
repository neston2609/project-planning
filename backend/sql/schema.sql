-- =====================================================================
-- RPA Planning Management - PostgreSQL Schema
-- Target: PostgreSQL 13+
-- Run with:  psql -h <host> -U postgres -d <database> -f schema.sql
-- =====================================================================

BEGIN;

-- ---------- Auth / users ----------
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(64)  UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL DEFAULT '',
    email           VARCHAR(255) NOT NULL DEFAULT '',
    phone_number    VARCHAR(64)  NOT NULL DEFAULT '',
    role            VARCHAR(32)  NOT NULL CHECK (role IN ('user', 'admin', 'superadmin')),
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS login_logs (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(64)  NOT NULL,
    login_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    ip_address      VARCHAR(64)  NOT NULL DEFAULT '',
    status          VARCHAR(16)  NOT NULL CHECK (status IN ('Success', 'Failed')),
    user_agent      TEXT         NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_login_logs_username ON login_logs(username);
CREATE INDEX IF NOT EXISTS idx_login_logs_login_at ON login_logs(login_at);

-- ---------- App / year configuration ----------
CREATE TABLE IF NOT EXISTS app_config (
    key             VARCHAR(64) PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Seed: default_year = current year (overridable from admin UI)
INSERT INTO app_config(key, value)
VALUES ('default_year', EXTRACT(YEAR FROM NOW())::TEXT)
ON CONFLICT (key) DO NOTHING;

-- SMTP config (single row keyed by 'smtp')
CREATE TABLE IF NOT EXISTS smtp_config (
    id              INT PRIMARY KEY DEFAULT 1,
    host            VARCHAR(255) NOT NULL DEFAULT 'smtp.gmail.com',
    port            INT          NOT NULL DEFAULT 587,
    secure          BOOLEAN      NOT NULL DEFAULT FALSE,
    username        VARCHAR(255) NOT NULL DEFAULT '',
    password        VARCHAR(255) NOT NULL DEFAULT '',
    from_email      VARCHAR(255) NOT NULL DEFAULT '',
    from_name       VARCHAR(255) NOT NULL DEFAULT 'RPA Planning',
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    CHECK (id = 1)
);
INSERT INTO smtp_config(id) VALUES (1) ON CONFLICT DO NOTHING;

-- Per-year team capacity (target = headcount * revenue_per_headcount)
CREATE TABLE IF NOT EXISTS year_config (
    year                  INT PRIMARY KEY,
    headcount             INT      NOT NULL DEFAULT 0,
    revenue_per_headcount NUMERIC(18,2) NOT NULL DEFAULT 0,
    updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------- Customers & Resources ----------
CREATE TABLE IF NOT EXISTS customers (
    id                  SERIAL PRIMARY KEY,
    alias               VARCHAR(64)  UNIQUE NOT NULL,
    full_name           VARCHAR(512) NOT NULL DEFAULT '',
    contact_name        VARCHAR(255) NOT NULL DEFAULT '',
    contact_email       VARCHAR(255) NOT NULL DEFAULT '',
    contact_phone       VARCHAR(64)  NOT NULL DEFAULT '',
    color_hex           VARCHAR(7)   NOT NULL DEFAULT '#3b82f6',
    logo_data           TEXT,            -- data URL (e.g. data:image/png;base64,...)
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resources (
    id              SERIAL PRIMARY KEY,
    emp_id          VARCHAR(64)  UNIQUE,
    first_name      VARCHAR(128) NOT NULL DEFAULT '',
    last_name       VARCHAR(128) NOT NULL DEFAULT '',
    nick_name       VARCHAR(128) NOT NULL DEFAULT '',
    role            VARCHAR(128) NOT NULL DEFAULT '',
    email           VARCHAR(255) NOT NULL DEFAULT '',
    erp_username    VARCHAR(128) NOT NULL DEFAULT '',
    skill           TEXT         NOT NULL DEFAULT '',
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ---------- Projects ----------
-- Master project record. Each project may have one Subscription license,
-- one Implementation row, multiple Perpetual/SW MA rows, multiple Service MA
-- rows, and one Outsource block (with monthly children if Man-Month).
CREATE TABLE IF NOT EXISTS projects (
    id                   SERIAL PRIMARY KEY,
    project_code         VARCHAR(64)  UNIQUE NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_projects_status   ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);

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
    progress_last_year_pct   NUMERIC(7,4)  NOT NULL DEFAULT 0,  -- 0..1
    progress_this_year_pct   NUMERIC(7,4)  NOT NULL DEFAULT 0,  -- 0..1
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
    -- Man-Year fields
    start_date          DATE,
    end_date            DATE,
    revenue             NUMERIC(18,2) NOT NULL DEFAULT 0, -- For Man-Year only; Man-Month uses monthly rows
    cost                NUMERIC(18,2) NOT NULL DEFAULT 0, -- For Man-Year only
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
        'users','customers','resources','projects','smtp_config','year_config'
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
