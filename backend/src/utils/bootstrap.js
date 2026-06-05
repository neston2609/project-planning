const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('../db');
const { ensureDefaultRoles } = require('./roles');

function requiredSeedPassword(envName, username) {
    const password = process.env[envName];
    if (password) return password;
    throw new Error(`[bootstrap] ${envName} is required before creating the initial ${username} user`);
}

/**
 * Startup bootstrap.
 *
 *  1. Apply schema.sql (idempotent).
 *  2. Multi-tenancy migration:
 *     a. Ensure the default tenant ("Automation Excellence" on first run;
 *        id remembered in app_config['default_tenant_id']).
 *     b. Backfill tenant_id on every tenant-scoped table.
 *     c. Swap year_config to composite PK (tenant_id, year).
 *     d. Swap customers/projects/resources unique constraints to per-tenant.
 *     e. Drop the global users.username UNIQUE — partial indexes in
 *        schema.sql now enforce per-tenant + (NULL-only) global uniqueness.
 *     f. Move 'default_year' and 'license_expiring_days' from app_config to
 *        per-tenant tenant_config (default tenant gets the legacy values;
 *        every other tenant gets sensible defaults).
 *     g. Migrate the legacy single-row smtp_config to per-tenant
 *        (default tenant inherits the legacy values; other tenants start
 *        with empty defaults).
 *  3. Seed a default global TenantAdmin if none exists.
 *  4. Seed a default superadmin for the default tenant if it has no
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
            const exists = await db.query('SELECT 1 FROM tenants WHERE id=$1', [defaultTenantId]);
            if (!exists.rowCount) defaultTenantId = null;
        }
        if (!defaultTenantId) {
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

    // ---- 2d) Per-tenant unique constraints on alias / project_code / emp_id ----
    try {
        await db.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customers_alias_key' AND conrelid='customers'::regclass) THEN
                    ALTER TABLE customers DROP CONSTRAINT customers_alias_key;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customers_alias_tenant_key' AND conrelid='customers'::regclass) THEN
                    ALTER TABLE customers ADD CONSTRAINT customers_alias_tenant_key UNIQUE (tenant_id, alias);
                END IF;

                IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='projects_project_code_key' AND conrelid='projects'::regclass) THEN
                    ALTER TABLE projects DROP CONSTRAINT projects_project_code_key;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='projects_code_tenant_key' AND conrelid='projects'::regclass) THEN
                    ALTER TABLE projects ADD CONSTRAINT projects_code_tenant_key UNIQUE (tenant_id, project_code);
                END IF;

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

    // ---- 2e) users.username : drop the global UNIQUE so partial indexes can govern ----
    // schema.sql creates the partial indexes; the legacy constraint must go.
    try {
        await db.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_constraint
                            WHERE conname='users_username_key' AND conrelid='users'::regclass) THEN
                    ALTER TABLE users DROP CONSTRAINT users_username_key;
                END IF;
            END $$;
        `);
    } catch (err) {
        console.error('[bootstrap] users.username constraint swap failed:', err.message);
        throw err;
    }

    // ---- 2f) Move 'default_year' / 'license_expiring_days' from app_config to tenant_config ----
    // Pre-Phase-4, these lived in the global app_config. Each tenant now owns
    // its own copy. The default tenant inherits the legacy values; every other
    // existing tenant gets a baseline (current year + 30 days).
    const perTenantKeys = ['default_year', 'license_expiring_days', 'footer_text', 'login_log_retention_days', 'kb_version_limit', 'post_it_expiry_days', 'post_it_board_size', 'ai_provider', 'ai_api_key', 'ai_endpoint', 'ai_model'];
    try {
        for (const key of perTenantKeys) {
            // Read legacy global value (if any).
            const legacy = await db.query('SELECT value FROM app_config WHERE key=$1', [key]);
            const legacyValue = legacy.rows[0]?.value || null;

            // Sensible fallback per key.
            const fallback = key === 'default_year'
                ? String(new Date().getFullYear())
                : key === 'license_expiring_days'
                    ? '30'
                    : key === 'login_log_retention_days'
                        ? '14'
                        : key === 'kb_version_limit'
                            ? '20'
                            : key === 'post_it_expiry_days'
                                ? '30'
                                : key === 'post_it_board_size'
                                    ? '40'
                                    : key === 'ai_provider'
                                        ? 'openai'
                                        : key === 'ai_api_key' || key === 'ai_endpoint' || key === 'ai_model'
                                            ? ''
                                            : 'Implemented and Maintain by BSM RPA Team. For Internal use only';

            // For the default tenant: take legacy if present, else fallback.
            // For every other existing tenant: take fallback.
            const { rows: allTenants } = await db.query('SELECT id FROM tenants');
            for (const t of allTenants) {
                const seedValue = (t.id === defaultTenantId && legacyValue !== null)
                    ? legacyValue
                    : fallback;
                await db.query(
                    `INSERT INTO tenant_config(tenant_id, key, value)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (tenant_id, key) DO NOTHING`,
                    [t.id, key, seedValue]
                );
            }
            // Strip the legacy row from app_config (so reads aren't ambiguous).
            if (legacyValue !== null) {
                await db.query('DELETE FROM app_config WHERE key=$1', [key]);
                console.log(`[bootstrap] migrated app_config['${key}'] -> tenant_config (default tenant value preserved)`);
            }
        }
    } catch (err) {
        console.error('[bootstrap] tenant_config migration failed:', err.message);
        throw err;
    }

    // ---- 2f.1) Seed per-tenant default roles and attach legacy users ----
    try {
        const { rows: allTenants } = await db.query('SELECT id FROM tenants');
        for (const t of allTenants) {
            await ensureDefaultRoles(t.id);
        }
    } catch (err) {
        console.error('[bootstrap] default role seed failed:', err.message);
        throw err;
    }

    // ---- 2g) smtp_config: legacy single-row (id=1) -> per-tenant ----
    // Migration plan: stamp the legacy row with tenant_id = default tenant,
    // then drop the id/CHECK/PK and swap PK to tenant_id. Subsequent tenants
    // get empty rows lazily when they first save SMTP settings.
    try {
        await db.query(`
            DO $$
            BEGIN
                -- Stamp the legacy row (id=1) with default tenant id.
                IF EXISTS (SELECT 1 FROM information_schema.columns
                             WHERE table_name='smtp_config' AND column_name='id') THEN
                    UPDATE smtp_config SET tenant_id = $1 WHERE id = 1 AND tenant_id IS NULL;
                    -- Drop old PK on id / CHECK.
                    ALTER TABLE smtp_config DROP CONSTRAINT IF EXISTS smtp_config_id_check;
                    -- 'smtp_config_pkey' might be on id; swap to tenant_id.
                    IF EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = 'smtp_config_pkey'
                          AND conrelid = 'smtp_config'::regclass
                          AND array_length(conkey, 1) = 1
                          AND EXISTS (
                              SELECT 1 FROM information_schema.columns
                              WHERE table_name='smtp_config' AND column_name='id'
                                AND ordinal_position = ANY (
                                    SELECT unnest(conkey) FROM pg_constraint
                                    WHERE conname='smtp_config_pkey' AND conrelid='smtp_config'::regclass
                                )
                          )
                    ) THEN
                        ALTER TABLE smtp_config DROP CONSTRAINT smtp_config_pkey;
                    END IF;
                    ALTER TABLE smtp_config ALTER COLUMN tenant_id SET NOT NULL;
                    -- Add new PK if missing.
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname='smtp_config_pkey' AND conrelid='smtp_config'::regclass
                    ) THEN
                        ALTER TABLE smtp_config ADD CONSTRAINT smtp_config_pkey PRIMARY KEY (tenant_id);
                    END IF;
                    -- Finally drop id column.
                    ALTER TABLE smtp_config DROP COLUMN IF EXISTS id;
                END IF;
            END $$;
        `.replace(/\$1/g, String(defaultTenantId)));
        // ^ embed defaultTenantId; DO block doesn't bind params, so we inline-format the safe int.
    } catch (err) {
        console.error('[bootstrap] smtp_config restructure failed:', err.message);
        throw err;
    }

    // ---- 3) Seed default global TenantAdmin ----
    {
        const { rows } = await db.query(
            "SELECT COUNT(*)::int AS n FROM users WHERE role='tenantadmin'"
        );
        if (rows[0].n === 0) {
            const username = process.env.TENANTADMIN_USERNAME || 'tenantadmin';
            const password = requiredSeedPassword('TENANTADMIN_PASSWORD', username);
            const hash = await bcrypt.hash(password, 10);
            try {
                await db.query(
                    `INSERT INTO users (tenant_id, username, password_hash, full_name, role, must_change_password)
                     VALUES (NULL, $1, $2, $3, 'tenantadmin', TRUE)`,
                    [username, hash, 'Platform Tenant Admin']
                );
                console.log(`[bootstrap] created default tenantadmin: ${username} (must change password on first login)`);
            } catch (err) {
                if (err.code !== '23505') {
                    console.error('[bootstrap] tenantadmin seed failed:', err.message);
                    throw err;
                }
            }
        }
    }

    // ---- 4) Seed default superadmin for the default tenant ----
    {
        const { rows } = await db.query(
            "SELECT COUNT(*)::int AS n FROM users WHERE tenant_id=$1 AND role <> 'tenantadmin'",
            [defaultTenantId]
        );
        if (rows[0].n === 0) {
            const username = process.env.SUPERADMIN_USERNAME || 'superadmin';
            const password = requiredSeedPassword('SUPERADMIN_PASSWORD', username);
            const hash = await bcrypt.hash(password, 10);
            const { rows: roleRows } = await db.query(
                `SELECT id FROM tenant_roles
                  WHERE tenant_id=$1 AND base_role='superadmin' AND is_system=TRUE
                  ORDER BY id
                  LIMIT 1`,
                [defaultTenantId]
            );
            try {
                await db.query(
                    `INSERT INTO users (tenant_id, username, password_hash, full_name, role, tenant_role_id, must_change_password)
                     VALUES ($1, $2, $3, $4, 'superadmin', $5, TRUE)`,
                    [defaultTenantId, username, hash, 'System Superadmin', roleRows[0]?.id || null]
                );
                console.log(`[bootstrap] created default superadmin: ${username} (tenant ${defaultTenantId}, must change password on first login)`);
            } catch (err) {
                if (err.code !== '23505') throw err;
            }
        }
    }
}

module.exports = { bootstrap };
