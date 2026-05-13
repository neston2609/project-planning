-- =====================================================================
-- Adds account_manager column to customers (CR#2)
-- Idempotent: safe to re-run.
-- =====================================================================
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS account_manager VARCHAR(255) NOT NULL DEFAULT '';
