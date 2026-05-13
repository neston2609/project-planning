-- =====================================================================
-- CR#4: Customer Licenses + License Dashboard
-- Idempotent: safe to re-run.
-- =====================================================================

-- Per-customer licenses. One customer may have many licenses;
-- license_name may be duplicated within one customer (per spec).
CREATE TABLE IF NOT EXISTS customer_licenses (
    id              SERIAL PRIMARY KEY,
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
CREATE INDEX IF NOT EXISTS idx_customer_licenses_customer ON customer_licenses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_licenses_expired  ON customer_licenses(expired_date);

-- updated_at trigger (set_updated_at function is created in schema.sql)
DROP TRIGGER IF EXISTS trg_customer_licenses_upd ON customer_licenses;
CREATE TRIGGER trg_customer_licenses_upd BEFORE UPDATE ON customer_licenses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Configurable "expiring soon" threshold in days. Admin can change this
-- via PUT /api/admin/app-config/license_expiring_days. Default: 30 days.
INSERT INTO app_config(key, value) VALUES ('license_expiring_days', '30')
ON CONFLICT (key) DO NOTHING;
