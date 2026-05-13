-- =====================================================================
-- CR#4: customer_licenses table + expiring-soon threshold app_config
-- Idempotent: safe to re-run. Mirrors the same DDL added to schema.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS customer_licenses (
    id              SERIAL PRIMARY KEY,
    customer_id     INT          NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
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

INSERT INTO app_config(key, value) VALUES ('license_expiring_days', '30')
ON CONFLICT (key) DO NOTHING;

-- updated_at trigger (re-uses set_updated_at() defined in main schema).
DROP TRIGGER IF EXISTS trg_customer_licenses_upd ON customer_licenses;
CREATE TRIGGER trg_customer_licenses_upd
    BEFORE UPDATE ON customer_licenses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
