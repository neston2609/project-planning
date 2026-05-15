const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('../db');

/**
 * Startup bootstrap.
 *
 *  1. Apply schema.sql (idempotent — everything uses IF NOT EXISTS / guarded ALTERs).
 *  2. Multi-tenancy (Phase 1):
 *     a. Ensure the default tenant exists ("Automation Excellence" on first run;
 *        its id is remembered in app_config['default_tenant_id'] so renames stick).
 *     b. Backfill tenant_id on every tenant-scoped table for legacy NULL rows.
 *     c. Swap year_config to a composite (tenant_id, year) primary key.
 *     d. Swap customers/projects/resources unique constraints to per-tenant.
 *  3. Seed a default global TenantAdmin (tenant_id NULL) if none exists.
 *  4. Seed a default superadmin for the default tenant if the tenant has no
 *     non-tenantadmin users yet.
 */
async function bootstrap() {
    // ---- 1) Apply schema ----
    const schemaPath = path.join(__dirname, '..', '..', 'sql', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const ddl = fs.readFileSync(schemaPath, 'utf8');
        try {
            await db.query(ddl);
            console.log('[bootstrap] schema applied');
        } catch (err) {
            console.error('[bootstrap] schema apply failed:', err.message);
            throw err;
        }
    }

    // ---- 2a) Ensure the default tenant ----
    let defaultTenantId = null;
    {
        const cfg = await db.query(
            "SELECT value FROM app_config WHERE key='default_tenant_id'"
        );
        if (cfg.rows[0] && Number(cfg.rows[0].value)) {
            defaultTenantId = Number(cfg.rows[0].value);
            // Safety: if the remembered tenant was deleted, fall through to re-pick.
            const exists = await db.query('SELECT 1 FROM tenants WHERE id=$1', [defaultTenantId]);
            if (!exists.rowCount) defaultTenantId = null;
        }
        if (!defaultTenantId) {
            // Re-use the oldest tenant if one exists (partial prior migration),
            // otherwise create "Automation Excellence".
            const existing = await db.query('SELECT id FROM tenants ORDER BY id ASC LIMIT 1');
            if (existing.rows[0]) {
                defaultTenantId = existing.rows[0].id;
            } else {
                const created = await db.query(
                    'INSERT INTO tenants(name) VALUES($1) RETURNING id',
                    ['Automation Excellence']
                );
                defaultTenantId = created.rows[0].id;
                console.log(`[bootstrap] created default tenant "Automation Excellence" (id=${defaultTenantId})`);
            }
            await db.query(
                `INSERT INTO app_config(key, value) VALUES('default_tenant_id', $1)
                 ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
                [String(defaultTenantId)]
            );
        }
    }

    // ---- 2b) Backfill tenant_id on legacy rows ----
    // Existing single-tenant data all belongs to the default tenant.
    // tenantadmin users intentionally keep tenant_id = NULL.
    const backfills = [
        ['users',                 "UPDATE users SET tenant_id=$1 WHERE tenant_id IS NULL AND role <> 'tenantadmin'"],
        ['customers',             'UPDATE customers SET tenant_id=$1 WHERE tenant_id IS NULL'],
        ['resources',             'UPDATE resources SET tenant_id=$1 WHERE tenant_id IS NULL'],
        ['projects',              'UPDATE projects SET tenant_id=$1 WHERE tenant_id IS NULL'],
        ['customer_licenses',     'UPDATE customer_licenses SET tenant_id=$1 WHERE tenant_id IS NULL'],
        ['year_config',           'UPDATE year_config SET tenant_id=$1 WHERE tenant_id IS NULL'],
        ['login_logs',            'UPDATE login_logs SET tenant_id=$1 WHERE tenant_id IS NULL'],
        ['pending_registrations', 'UPDATE pending_registrations SET tenant_id=$1 WHERE tenant_id IS NULL']
    ];
    for (const [table, sql] of backfills) {
        try {
            const r = await db.query(sql, [defaultTenantId]);
            if (r.rowCount > 0) console.log(`[bootstrap] backfilled ${r.rowCount} ${table} row(s) -> tenant ${defaultTenantId}`);
        } catch (err) {
            console.error(`[bootstrap] backfill ${table} failed:`, err.message);
            throw err;
        }
    }

    // ---- 2c) year_config: swap to composite (tenant_id, year) primary key ----
    try {
        await db.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'year_config_pkey'
                      AND conrelid = 'year_config'::regclass
                      AND array_length(conkey, 1) = 1
                ) THEN
                    ALTER TABLE year_config DROP CONSTRAINT year_config_pkey;
                    ALTER TABLE year_config ALTER COLUMN tenant_id SET NOT NULL;
                    ALTER TABLE year_config ADD CONSTRAINT year_config_pkey PRIMARY KEY (tenant_id, year);
                END IF;
            END $$;
        `);
    } catch (err) {
        console.error('[bootstrap] year_config PK swap failed:', err.message);
        throw err;
    }

    // ---- 2d) customers / projects / resources: per-tenant unique constraints ----
    try {
        await db.query(`
            DO $$
            BEGIN
                -- customers.alias : global unique -> per-tenant unique
                IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customers_alias_key' AND conrelid='customers'::regclass) THEN
                    ALTER TABLE customers DROP CONSTRAINT customers_alias_key;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customers_alias_tenant_key' AND conrelid='customers'::regclass) THEN
                    ALTER TABLE customers ADD CONSTRAINT customers_alias_tenant_key UNIQUE (tenant_id, alias);
                END IF;

                -- projects.project_code : global unique -> per-tenant unique
                IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='projects_project_code_key' AND conrelid='projects'::regclass) THEN
                    ALTER TABLE projects DROP CONSTRAINT projects_project_code_key;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='projects_code_tenant_key' AND conrelid='projects'::regclass) THEN
                    ALTER TABLE projects ADD CONSTRAINT projects_code_tenant_key UNIQUE (tenant_id, project_code);
                END IF;

                -- resources.emp_id : global unique -> per-tenant unique
                IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='resources_emp_id_key' AND conrelid='resources'::regclass) THEN
                    ALTER TABLE resources DROP CONSTRAINT resources_emp_id_key;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='resources_emp_id_tenant_key' AND conrelid='resources'::regclass) THEN
                    ALTER TABLE resources ADD CONSTRAINT resources_emp_id_tenant_key UNIQUE (tenant_id, emp_id);
                END IF;
            END $$;
        `);
    } catch (err) {
        console.error('[bootstrap] unique-constraint swap failed:', err.message);
        throw err;
    }

    // ---- 3) Seed default global TenantAdmin ----
    {
        const { rows } = await db.query(
            "SELECT COUNT(*)::int AS n FROM users WHERE role='tenantadmin'"
        );
        if (rows[0].n === 0) {
            const username = process.env.TENANTADMIN_USERNAME || 'tenantadmin';
            const password = process.env.TENANTADMIN_PASSWORD || 'tenantadmin1234';
            const hash = await bcrypt.hash(password, 10);
            try {
                await db.query(
                    `INSERT INTO users (tenant_id, username, password_hash, full_name, role, must_change_password)
                     VALUES (NULL, $1, $2, $3, 'tenantadmin', TRUE)
                     ON CONFLICT (username) DO NOTHING`,
                    [username, hash, 'Platform Tenant Admin']
                );
                console.log(`[bootstrap] created default tenantadmin: ${username} (must change password on first login)`);
            } catch (err) {
                console.error('[bootstrap] tenantadmin seed failed:', err.message);
                throw err;
            }
        }
    }

    // ---- 4) Seed default superadmin for the default tenant ----
    {
        const { rows } = await db.query(
            "SELECT COUNT(*)::int AS n FROM users WHERE role <> 'tenantadmin'"
        );
        if (rows[0].n === 0) {
            const username = process.env.SUPERADMIN_USERNAME || 'superadmin';
            const password = process.env.SUPERADMIN_PASSWORD || 'bsmrpa1234';
            const hash = await bcrypt.hash(password, 10);
            await db.query(
                `INSERT INTO users (tenant_id, username, password_hash, full_name, role, must_change_password)
                 VALUES ($1, $2, $3, $4, 'superadmin', TRUE)
                 ON CONFLICT (username) DO NOTHING`,
                [defaultTenantId, username, hash, 'System Superadmin']
            );
            console.log(`[bootstrap] created default superadmin: ${username} (tenant ${defaultTenantId}, must change password on first login)`);
        }
    }
}

module.exports = { bootstrap };
