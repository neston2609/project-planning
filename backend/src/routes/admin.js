const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireRole, requireTenant } = require('../middleware/auth');
const { MENU_REGISTRY, defaultMenuKeysForRole } = require('../utils/menuRegistry');
const { ensureDefaultRoles } = require('../utils/roles');

const router = express.Router();
const DEFAULT_FOOTER_TEXT = 'Implemented and Maintain by BSM RPA Team. For Internal use only';
const DEFAULT_LOGIN_LOG_RETENTION_DAYS = 14;
const AI_PROVIDERS = ['openai', 'anthropic', 'google', 'azure_openai', 'custom'];
const AI_CONFIG_KEYS = ['ai_provider', 'ai_api_key', 'ai_endpoint', 'ai_model'];
// All admin routes are tenant-scoped. The global TenantAdmin manages tenants
// and team users via /api/tenants, not these per-tenant admin endpoints.
router.use(requireAuth, requireTenant);

async function roleForTenant(tenantId, tenantRoleId) {
    if (!tenantRoleId) return null;
    const { rows } = await db.query(
        'SELECT * FROM tenant_roles WHERE id=$1 AND tenant_id=$2',
        [tenantRoleId, tenantId]
    );
    return rows[0] || null;
}

async function defaultRoleForBase(tenantId, baseRole) {
    await ensureDefaultRoles(tenantId);
    const { rows } = await db.query(
        `SELECT * FROM tenant_roles
          WHERE tenant_id=$1 AND base_role=$2 AND is_system=TRUE
          ORDER BY id
          LIMIT 1`,
        [tenantId, baseRole]
    );
    return rows[0] || null;
}

function validMenuKeysForBase(baseRole, menuPermissions = null) {
    const registered = new Set(MENU_REGISTRY.map(m => m.key));
    const allowedByBase = new Set(defaultMenuKeysForRole(baseRole));
    const requested = Array.isArray(menuPermissions) ? menuPermissions : defaultMenuKeysForRole(baseRole);
    return [...new Set(requested)].filter(key => registered.has(key) && allowedByBase.has(key));
}

function cleanAiProvider(value) {
    const provider = String(value || '').trim().toLowerCase();
    return AI_PROVIDERS.includes(provider) ? provider : 'openai';
}

function maskSecret(value) {
    return value ? '********' : '';
}

function normalizeEndpoint(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

async function getTenantConfigMap(tenantId, keys) {
    const { rows } = await db.query(
        'SELECT key, value FROM tenant_config WHERE tenant_id=$1 AND key = ANY($2)',
        [tenantId, keys]
    );
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

async function saveTenantConfig(client, tenantId, key, value) {
    await client.query(
        `INSERT INTO tenant_config(tenant_id, key, value) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
        [tenantId, key, String(value ?? '')]
    );
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!response.ok) {
        const message = data?.error?.message || data?.error || data?.message || response.statusText || 'Model loading failed';
        const err = new Error(message);
        err.status = response.status;
        throw err;
    }
    return data;
}

function namesFromModels(data, provider) {
    if (!data) return [];
    if (Array.isArray(data.data)) return data.data.map(m => m.id || m.name).filter(Boolean).sort();
    if (Array.isArray(data.models)) {
        return data.models
            .map(m => m.name || m.id)
            .filter(Boolean)
            .map(name => provider === 'google' ? String(name).replace(/^models\//, '') : String(name))
            .sort();
    }
    if (Array.isArray(data.value)) return data.value.map(m => m.id || m.name).filter(Boolean).sort();
    return [];
}

async function loadAiModels({ provider, apiKey, endpoint }) {
    const cleanProvider = cleanAiProvider(provider);
    const cleanEndpoint = normalizeEndpoint(endpoint);
    if (!apiKey && cleanProvider !== 'custom') throw new Error('API key is required');

    if (cleanProvider === 'openai') {
        const data = await fetchJson('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` }
        });
        return namesFromModels(data, cleanProvider);
    }
    if (cleanProvider === 'anthropic') {
        const data = await fetchJson('https://api.anthropic.com/v1/models', {
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            }
        });
        return namesFromModels(data, cleanProvider);
    }
    if (cleanProvider === 'google') {
        const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
        return namesFromModels(data, cleanProvider);
    }
    if (cleanProvider === 'azure_openai') {
        if (!cleanEndpoint) throw new Error('Azure OpenAI endpoint is required');
        const data = await fetchJson(`${cleanEndpoint}/openai/deployments?api-version=2024-10-21`, {
            headers: { 'api-key': apiKey }
        });
        return namesFromModels(data, cleanProvider);
    }
    if (!cleanEndpoint) throw new Error('Custom endpoint is required');
    const data = await fetchJson(`${cleanEndpoint}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
    });
    return namesFromModels(data, cleanProvider);
}

// ---------- Users (Superadmin only, within the caller's tenant) ----------
router.get('/users', requireRole('superadmin'), async (req, res) => {
    await ensureDefaultRoles(req.tenantId);
    const { rows } = await db.query(
        `SELECT u.id, u.username, u.full_name, u.email, u.phone_number, u.role,
                u.tenant_role_id, tr.name AS tenant_role_name,
                u.must_change_password, u.created_at
           FROM users u
           LEFT JOIN tenant_roles tr ON tr.id = u.tenant_role_id AND tr.tenant_id = u.tenant_id
          WHERE u.tenant_id=$1
          ORDER BY u.username`,
        [req.tenantId]
    );
    res.json(rows);
});

router.post('/users', requireRole('superadmin'),
    body('username').isString().isLength({ min: 1, max: 64 }),
    body('password').isString().isLength({ min: 8 }),
    body('role').isIn(['user','admin','superadmin']),
    body('tenant_role_id').optional({ nullable: true, checkFalsy: true }).isInt(),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const username = String(req.body.username || '').trim();
        const { password, full_name, email, phone_number, role } = req.body;
        let tenantRole = await roleForTenant(req.tenantId, req.body.tenant_role_id);
        const baseRole = tenantRole?.base_role || role;
        if (!['user','admin','superadmin'].includes(baseRole)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        if (!tenantRole) tenantRole = await defaultRoleForBase(req.tenantId, baseRole);
        try {
            const dup = await db.query(
                `SELECT 1 FROM users
                  WHERE tenant_id=$1 AND LOWER(username)=LOWER($2)
                  LIMIT 1`,
                [req.tenantId, username]
            );
            if (dup.rowCount) return res.status(409).json({ error: 'Username already exists in this team' });
            const hash = await bcrypt.hash(password, 10);
            const { rows } = await db.query(
                `INSERT INTO users(tenant_id, username, password_hash, full_name, email, phone_number, role, tenant_role_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 RETURNING id, username, full_name, email, phone_number, role, tenant_role_id`,
                [req.tenantId, username, hash, full_name || '', email || '', phone_number || '', baseRole, tenantRole?.id || null]
            );
            res.status(201).json(rows[0]);
        } catch (err) {
            if (err.code === '23505') return res.status(409).json({ error: 'Username already exists in this team' });
            throw err;
        }
    }
);

router.put('/users/:id', requireRole('superadmin'), param('id').isInt(), async (req, res) => {
    const { full_name, email, phone_number, role, password, tenant_role_id } = req.body;
    let tenantRole = await roleForTenant(req.tenantId, tenant_role_id);
    const safeRole = tenantRole ? tenantRole.base_role : ((role && ['user','admin','superadmin'].includes(role)) ? role : null);
    if (!tenantRole && safeRole) tenantRole = await defaultRoleForBase(req.tenantId, safeRole);
    const safeTenantRoleId = tenantRole ? tenantRole.id : null;
    let q, args;
    if (password) {
        const hash = await bcrypt.hash(password, 10);
        q = `UPDATE users SET full_name=$1, email=$2, phone_number=$3, role=COALESCE($4, role),
                              tenant_role_id=$5, password_hash=$6
             WHERE id=$7 AND tenant_id=$8
             RETURNING id, username, full_name, email, phone_number, role, tenant_role_id`;
        args = [full_name || '', email || '', phone_number || '', safeRole, safeTenantRoleId, hash, req.params.id, req.tenantId];
    } else {
        q = `UPDATE users SET full_name=$1, email=$2, phone_number=$3, role=COALESCE($4, role),
                              tenant_role_id=$5
             WHERE id=$6 AND tenant_id=$7
             RETURNING id, username, full_name, email, phone_number, role, tenant_role_id`;
        args = [full_name || '', email || '', phone_number || '', safeRole, safeTenantRoleId, req.params.id, req.tenantId];
    }
    const { rows } = await db.query(q, args);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});

// ---------- Role management (tenant-scoped menu permissions) ----------
router.get('/menu-registry', requireRole('superadmin'), (_req, res) => {
    res.json(MENU_REGISTRY);
});

router.get('/roles', requireRole('superadmin'), async (req, res) => {
    await ensureDefaultRoles(req.tenantId);
    const { rows } = await db.query(
        `SELECT tr.*,
                COALESCE(array_agg(trp.menu_key ORDER BY trp.menu_key)
                    FILTER (WHERE trp.menu_key IS NOT NULL), ARRAY[]::text[]) AS menu_permissions,
                (SELECT COUNT(*)::int FROM users u WHERE u.tenant_role_id = tr.id) AS user_count
           FROM tenant_roles tr
           LEFT JOIN tenant_role_permissions trp ON trp.tenant_role_id = tr.id
          WHERE tr.tenant_id=$1
          GROUP BY tr.id
          ORDER BY tr.is_system DESC, tr.base_role, tr.name`,
        [req.tenantId]
    );
    res.json(rows);
});

router.post('/roles', requireRole('superadmin'),
    body('name').isString().trim().isLength({ min: 1, max: 128 }),
    body('base_role').isIn(['user','admin','superadmin']),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const permissions = validMenuKeysForBase(req.body.base_role, req.body.menu_permissions);
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(
                `INSERT INTO tenant_roles(tenant_id, name, base_role, is_system)
                 VALUES ($1,$2,$3,FALSE) RETURNING *`,
                [req.tenantId, String(req.body.name).trim(), req.body.base_role]
            );
            for (const key of permissions) {
                await client.query(
                    'INSERT INTO tenant_role_permissions(tenant_role_id, menu_key) VALUES ($1,$2) ON CONFLICT DO NOTHING',
                    [rows[0].id, key]
                );
            }
            await client.query('COMMIT');
            res.status(201).json(rows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            if (err.code === '23505') return res.status(409).json({ error: 'Role name already exists' });
            throw err;
        } finally {
            client.release();
        }
    }
);

router.put('/roles/:id', requireRole('superadmin'), param('id').isInt(), async (req, res) => {
    const name = String(req.body.name || '').trim();
    const baseRole = ['user','admin','superadmin'].includes(req.body.base_role) ? req.body.base_role : null;
    if (!name || !baseRole) return res.status(400).json({ error: 'Role name and base role are required' });
    const permissions = validMenuKeysForBase(baseRole, req.body.menu_permissions);
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `UPDATE tenant_roles SET name=$1, base_role=$2, updated_at=NOW()
              WHERE id=$3 AND tenant_id=$4
              RETURNING *`,
            [name, baseRole, req.params.id, req.tenantId]
        );
        if (!rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Role not found' });
        }
        await client.query('DELETE FROM tenant_role_permissions WHERE tenant_role_id=$1', [rows[0].id]);
        for (const key of permissions) {
            await client.query(
                'INSERT INTO tenant_role_permissions(tenant_role_id, menu_key) VALUES ($1,$2)',
                [rows[0].id, key]
            );
        }
        await client.query(
            'UPDATE users SET role=$1 WHERE tenant_id=$2 AND tenant_role_id=$3',
            [baseRole, req.tenantId, rows[0].id]
        );
        await client.query('COMMIT');
        res.json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') return res.status(409).json({ error: 'Role name already exists' });
        throw err;
    } finally {
        client.release();
    }
});

router.delete('/roles/:id', requireRole('superadmin'), param('id').isInt(), async (req, res) => {
    const usage = await db.query('SELECT COUNT(*)::int AS n FROM users WHERE tenant_role_id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
    if (usage.rows[0].n > 0) return res.status(400).json({ error: 'Cannot delete a role assigned to users' });
    const { rowCount } = await db.query(
        'DELETE FROM tenant_roles WHERE id=$1 AND tenant_id=$2 AND is_system=FALSE',
        [req.params.id, req.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Role not found or system role cannot be deleted' });
    res.json({ ok: true });
});

router.delete('/users/:id', requireRole('superadmin'), param('id').isInt(), async (req, res) => {
    if (Number(req.params.id) === req.user.uid) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    const { rowCount } = await db.query(
        'DELETE FROM users WHERE id=$1 AND tenant_id=$2',
        [req.params.id, req.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

router.get('/login-logs', requireRole('superadmin'), async (req, res) => {
    const retentionRows = await db.query(
        "SELECT value FROM tenant_config WHERE tenant_id=$1 AND key='login_log_retention_days'",
        [req.tenantId]
    );
    const retentionDays = Number(retentionRows.rows[0]?.value || DEFAULT_LOGIN_LOG_RETENTION_DAYS);
    const safeRetention = Number.isInteger(retentionDays) && retentionDays >= 0 ? retentionDays : DEFAULT_LOGIN_LOG_RETENTION_DAYS;
    await db.query(
        `DELETE FROM login_logs
          WHERE tenant_id=$1
            AND login_at < NOW() - ($2::int * INTERVAL '1 day')`,
        [req.tenantId, safeRetention]
    );

    const pageSize = [20, 50, 100, 200].includes(Number(req.query.page_size))
        ? Number(req.query.page_size)
        : 20;
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * pageSize;
    const params = [req.tenantId];
    const filters = ['tenant_id=$1'];

    const search = String(req.query.search || '').trim().toLowerCase();
    if (search) {
        params.push(`%${search}%`);
        filters.push(`(
            LOWER(username) LIKE $${params.length}
            OR LOWER(status) LIKE $${params.length}
            OR to_char(login_at, 'YYYY-MM-DD') LIKE $${params.length}
        )`);
    }
    const status = String(req.query.status || '').trim();
    if (status === 'Success' || status === 'Failed') {
        params.push(status);
        filters.push(`status=$${params.length}`);
    }
    const date = String(req.query.date || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        params.push(date);
        filters.push(`login_at::date=$${params.length}::date`);
    }

    const where = `WHERE ${filters.join(' AND ')}`;
    const countRows = await db.query(`SELECT COUNT(*)::int AS total FROM login_logs ${where}`, params);
    params.push(pageSize, offset);
    const { rows } = await db.query(
        `SELECT * FROM login_logs
          ${where}
          ORDER BY login_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );
    res.json({ rows, total: countRows.rows[0].total, page, page_size: pageSize, retention_days: safeRetention });
});

// ---------- Year config (tenant-scoped) ----------
router.get('/year-config', async (req, res) => {
    const { rows } = await db.query(
        'SELECT * FROM year_config WHERE tenant_id=$1 ORDER BY year DESC',
        [req.tenantId]
    );
    res.json(rows);
});

router.put('/year-config/:year', param('year').isInt(),
    body('headcount').isInt({ min: 0 }),
    body('revenue_per_headcount').isFloat({ min: 0 }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const { rows } = await db.query(
            `INSERT INTO year_config(tenant_id, year, headcount, revenue_per_headcount)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (tenant_id, year) DO UPDATE
               SET headcount=EXCLUDED.headcount,
                   revenue_per_headcount=EXCLUDED.revenue_per_headcount,
                   updated_at=NOW()
             RETURNING *`,
            [req.tenantId, req.params.year, req.body.headcount, req.body.revenue_per_headcount]
        );
        res.json(rows[0]);
    }
);

// ---------- App config (per-tenant tenant_config KV) ----------
// Phase 4: 'default_year' and 'license_expiring_days' live in tenant_config.
// The GET response keeps the same shape as before (flat key->value map) so
// the existing frontend doesn't need to change.
router.get('/app-config', async (req, res) => {
    const { rows } = await db.query(
        'SELECT key, value FROM tenant_config WHERE tenant_id=$1',
        [req.tenantId]
    );
    res.json({
        footer_text: DEFAULT_FOOTER_TEXT,
        login_log_retention_days: String(DEFAULT_LOGIN_LOG_RETENTION_DAYS),
        post_it_expiry_days: '30',
        post_it_board_size: '40',
        announcement_enabled: 'false',
        announcement_content: '',
        ...Object.fromEntries(rows.map(r => [r.key, r.value]))
    });
});

router.put('/app-config/:key', param('key').isString(), async (req, res) => {
    const { rows } = await db.query(
        `INSERT INTO tenant_config(tenant_id, key, value) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
         RETURNING tenant_id, key, value`,
        [req.tenantId, req.params.key, String(req.body.value ?? '')]
    );
    res.json(rows[0]);
});

// ---------- AI Model config (per tenant) ----------
router.get('/ai-config', async (req, res) => {
    const cfg = await getTenantConfigMap(req.tenantId, AI_CONFIG_KEYS);
    res.json({
        provider: cleanAiProvider(cfg.ai_provider || 'openai'),
        endpoint: cfg.ai_endpoint || '',
        model: cfg.ai_model || '',
        api_key: maskSecret(cfg.ai_api_key)
    });
});

router.put('/ai-config', async (req, res) => {
    const provider = cleanAiProvider(req.body.provider);
    const endpoint = normalizeEndpoint(req.body.endpoint);
    const model = String(req.body.model || '').trim();
    const incomingKey = String(req.body.api_key || '').trim();
    const current = await getTenantConfigMap(req.tenantId, ['ai_api_key']);
    const apiKey = incomingKey === '********' ? (current.ai_api_key || '') : incomingKey;

    if (provider === 'azure_openai' && !endpoint) {
        return res.status(400).json({ error: 'Azure OpenAI endpoint is required' });
    }
    if (provider === 'custom' && !endpoint) {
        return res.status(400).json({ error: 'Custom endpoint is required' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await saveTenantConfig(client, req.tenantId, 'ai_provider', provider);
        await saveTenantConfig(client, req.tenantId, 'ai_endpoint', endpoint);
        await saveTenantConfig(client, req.tenantId, 'ai_model', model);
        await saveTenantConfig(client, req.tenantId, 'ai_api_key', apiKey);
        await client.query('COMMIT');
        res.json({
            provider,
            endpoint,
            model,
            api_key: maskSecret(apiKey)
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[ai-config/save]', err);
        res.status(500).json({ error: 'Save failed' });
    } finally {
        client.release();
    }
});

router.post('/ai-config/models', async (req, res) => {
    const cfg = await getTenantConfigMap(req.tenantId, AI_CONFIG_KEYS);
    const provider = cleanAiProvider(req.body.provider || cfg.ai_provider || 'openai');
    const endpoint = normalizeEndpoint(req.body.endpoint ?? cfg.ai_endpoint);
    const incomingKey = String(req.body.api_key || '').trim();
    const apiKey = incomingKey && incomingKey !== '********' ? incomingKey : (cfg.ai_api_key || '');

    try {
        const models = await loadAiModels({ provider, apiKey, endpoint });
        res.json({ provider, models });
    } catch (err) {
        console.error('[ai-config/models]', err.message);
        res.status(err.status || 400).json({ error: err.message || 'Could not load models' });
    }
});

router.post('/ai-config/test', async (req, res) => {
    const cfg = await getTenantConfigMap(req.tenantId, AI_CONFIG_KEYS);
    const provider = cleanAiProvider(req.body.provider || cfg.ai_provider || 'openai');
    const endpoint = normalizeEndpoint(req.body.endpoint ?? cfg.ai_endpoint);
    const model = String(req.body.model ?? cfg.ai_model ?? '').trim();
    const incomingKey = String(req.body.api_key || '').trim();
    const apiKey = incomingKey && incomingKey !== '********' ? incomingKey : (cfg.ai_api_key || '');

    try {
        const models = await loadAiModels({ provider, apiKey, endpoint });
        const modelFound = !model || models.includes(model);
        if (!modelFound) {
            return res.status(400).json({
                ok: false,
                provider,
                model,
                model_found: false,
                model_count: models.length,
                error: 'Connection works, but the selected model was not found'
            });
        }
        res.json({
            ok: true,
            provider,
            model,
            model_found: Boolean(model),
            model_count: models.length
        });
    } catch (err) {
        console.error('[ai-config/test]', err.message);
        res.status(err.status || 400).json({ ok: false, error: err.message || 'AI configuration test failed' });
    }
});

// ---------- SMTP config (PER TENANT) ----------
router.get('/smtp', async (req, res) => {
    const { rows } = await db.query('SELECT * FROM smtp_config WHERE tenant_id=$1', [req.tenantId]);
    if (!rows[0]) {
        // Return defaults so the form has something sensible to render.
        return res.json({
            tenant_id: req.tenantId,
            host: 'smtp.gmail.com', port: 587, secure: false,
            username: '', password: '', from_email: '', from_name: 'Planning'
        });
    }
    const r = rows[0];
    res.json({ ...r, password: r.password ? '********' : '' });
});

router.post('/smtp/test',
    body('recipient').isEmail().withMessage('Valid recipient email required'),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ error: errs.array()[0].msg });

        const { rows } = await db.query('SELECT * FROM smtp_config WHERE tenant_id=$1', [req.tenantId]);
        const cfg = rows[0];
        if (!cfg || !cfg.host) {
            return res.status(400).json({ error: 'SMTP not configured. Please save settings first.' });
        }
        if (!cfg.username || !cfg.password) {
            return res.status(400).json({ error: 'SMTP username/password missing. Save credentials first.' });
        }

        try {
            const transporter = nodemailer.createTransport({
                host: cfg.host,
                port: Number(cfg.port) || 587,
                secure: !!cfg.secure,
                auth: { user: cfg.username, pass: cfg.password }
            });
            await transporter.verify();

            const info = await transporter.sendMail({
                from: `"${cfg.from_name || 'Planning'}" <${cfg.from_email || cfg.username}>`,
                to: req.body.recipient,
                subject: 'Planning · SMTP test',
                text:
`Hello,

This is a test email sent to verify your team's SMTP configuration.

If you can read this, your SMTP settings work correctly.

Sent at ${new Date().toISOString()}
By: ${req.user?.username || 'unknown'}
`,
                html: `
<p>Hello,</p>
<p>This is a <strong>test email</strong> sent to verify your team's SMTP configuration.</p>
<p>If you can read this, your SMTP settings work correctly.</p>
<hr/>
<p style="color:#64748b;font-size:12px">
Sent at ${new Date().toISOString()}<br/>
By: ${req.user?.username || 'unknown'}
</p>`
            });
            res.json({ ok: true, messageId: info.messageId, accepted: info.accepted });
        } catch (err) {
            console.error('[smtp test]', err);
            const msg = err.code ? `${err.code}: ${err.message}` : (err.message || 'SMTP test failed');
            res.status(500).json({ error: msg });
        }
    }
);

router.put('/smtp', async (req, res) => {
    const b = req.body || {};
    let pwd = b.password;
    if (pwd === '********' || pwd === undefined) {
        const cur = await db.query('SELECT password FROM smtp_config WHERE tenant_id=$1', [req.tenantId]);
        pwd = cur.rows[0]?.password || '';
    }
    const { rows } = await db.query(
        `INSERT INTO smtp_config(tenant_id, host, port, secure, username, password, from_email, from_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (tenant_id) DO UPDATE
           SET host=EXCLUDED.host, port=EXCLUDED.port, secure=EXCLUDED.secure,
               username=EXCLUDED.username, password=EXCLUDED.password,
               from_email=EXCLUDED.from_email, from_name=EXCLUDED.from_name,
               updated_at=NOW()
         RETURNING *`,
        [req.tenantId, b.host || 'smtp.gmail.com', b.port || 587, !!b.secure,
         b.username || '', pwd, b.from_email || '', b.from_name || 'Planning']
    );
    const out = { ...rows[0], password: rows[0].password ? '********' : '' };
    res.json(out);
});

module.exports = router;
