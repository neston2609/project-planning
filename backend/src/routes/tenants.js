const express = require('express');
const bcrypt = require('bcrypt');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireTenantAdmin } = require('../middleware/auth');
const { ensureDefaultRoles } = require('../utils/roles');

const router = express.Router();
router.use(requireAuth, requireTenantAdmin);

/** The default tenant id (cannot be deleted). */
async function getDefaultTenantId() {
    const r = await db.query("SELECT value FROM app_config WHERE key='default_tenant_id'");
    const id = r.rows[0] ? Number(r.rows[0].value) : null;
    return Number.isInteger(id) && id > 0 ? id : null;
}

async function seedTenantConfig(client, tenantId) {
    const defaults = [
        ['default_year',          String(new Date().getFullYear())],
        ['license_expiring_days', '30'],
        ['login_log_retention_days', '14'],
        ['kb_version_limit', '20'],
        ['kb_attachment_limit_mb', '5'],
        ['post_it_expiry_days', '30'],
        ['post_it_board_size', '40'],
        ['pipeline_win_threshold_pct', '50'],
        ['ai_provider', 'openai'],
        ['ai_api_key', ''],
        ['ai_endpoint', ''],
        ['ai_model', ''],
        ['web_search_provider', 'disabled'],
        ['web_search_api_key', ''],
        ['web_search_endpoint', ''],
        ['web_search_cx', ''],
        ['announcement_enabled', 'false'],
        ['announcement_content', ''],
        ['footer_text',           'Implemented and Maintain by BSM RPA Team. For Internal use only']
    ];
    for (const [key, value] of defaults) {
        await client.query(
            `INSERT INTO tenant_config(tenant_id, key, value) VALUES ($1,$2,$3)
             ON CONFLICT (tenant_id, key) DO NOTHING`,
            [tenantId, key, value]
        );
    }
}

const COUNTS_SELECT = `
    SELECT t.id, t.name, t.created_at, t.updated_at,
           (SELECT COUNT(*)::int FROM users     u WHERE u.tenant_id = t.id) AS user_count,
           (SELECT COUNT(*)::int FROM customers c WHERE c.tenant_id = t.id) AS customer_count,
           (SELECT COUNT(*)::int FROM projects  p WHERE p.tenant_id = t.id) AS project_count
      FROM tenants t
`;

// ---------- List all tenants ----------
router.get('/', async (_req, res) => {
    const { rows } = await db.query(`${COUNTS_SELECT} ORDER BY t.id`);
    const defId = await getDefaultTenantId();
    res.json(rows.map(r => ({ ...r, is_default: r.id === defId })));
});

// ---------- Single tenant ----------
router.get('/:id', param('id').isInt(), async (req, res) => {
    const { rows } = await db.query(`${COUNTS_SELECT} WHERE t.id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Tenant not found' });
    const defId = await getDefaultTenantId();
    res.json({ ...rows[0], is_default: rows[0].id === defId });
});

// ---------- Create a new tenant + its first superadmin + default config ----------
router.post('/',
    body('name').isString().trim().isLength({ min: 1, max: 255 })
        .withMessage('Team name is required'),
    body('admin_username').isString().trim().isLength({ min: 3, max: 64 })
        .withMessage('Admin username must be 3-64 characters'),
    body('admin_password').isString().isLength({ min: 8 })
        .withMessage('Admin password must be at least 8 characters'),
    body('admin_full_name').optional().isString(),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ error: errs.array()[0].msg });

        const name      = String(req.body.name).trim();
        const username  = String(req.body.admin_username).trim();
        const password  = String(req.body.admin_password);
        const fullName  = String(req.body.admin_full_name || '').trim() || 'Team Superadmin';

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const t = await client.query(
                'INSERT INTO tenants(name) VALUES ($1) RETURNING *',
                [name]
            );
            const tenant = t.rows[0];

            // Seed sensible per-tenant config defaults.
            await seedTenantConfig(client, tenant.id);
            const defaultRoles = await ensureDefaultRoles(tenant.id, client);
            await client.query(
                `INSERT INTO project_attachment_types(tenant_id, name, is_system)
                 VALUES ($1,'General',TRUE)
                 ON CONFLICT (tenant_id, name) DO NOTHING`,
                [tenant.id]
            );
            const dup = await client.query(
                `SELECT 1 FROM users
                  WHERE tenant_id=$1 AND LOWER(username)=LOWER($2)
                  LIMIT 1`,
                [tenant.id, username]
            );
            if (dup.rowCount) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'That admin username is already taken in this team' });
            }

            const hash = await bcrypt.hash(password, 10);
            const u = await client.query(
                `INSERT INTO users(tenant_id, username, password_hash, full_name, role, tenant_role_id, must_change_password)
                 VALUES ($1,$2,$3,$4,'superadmin',$5,TRUE)
                 RETURNING id, username, full_name, role, tenant_role_id, must_change_password`,
                [tenant.id, username, hash, fullName, defaultRoles.superadmin.id]
            );

            await client.query('COMMIT');
            res.status(201).json({
                tenant: { ...tenant, user_count: 1, customer_count: 0, project_count: 0, is_default: false },
                superadmin: u.rows[0]
            });
        } catch (err) {
            await client.query('ROLLBACK');
            if (err.code === '23505') {
                return res.status(409).json({ error: 'That admin username is already taken in this team' });
            }
            console.error('[tenants/create]', err);
            res.status(500).json({ error: 'Could not create tenant' });
        } finally {
            client.release();
        }
    }
);

// ---------- Rename a tenant ----------
router.put('/:id', param('id').isInt(),
    body('name').isString().trim().isLength({ min: 1, max: 255 })
        .withMessage('Team name is required'),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ error: errs.array()[0].msg });
        const { rows } = await db.query(
            'UPDATE tenants SET name=$1 WHERE id=$2 RETURNING *',
            [String(req.body.name).trim(), req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Tenant not found' });
        res.json(rows[0]);
    }
);

// ---------- Delete a tenant + ALL its data ----------
router.delete('/:id', param('id').isInt(), async (req, res) => {
    const id = Number(req.params.id);
    const defId = await getDefaultTenantId();
    if (id === defId) {
        return res.status(400).json({ error: 'The default tenant cannot be deleted' });
    }

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const exists = await client.query('SELECT 1 FROM tenants WHERE id=$1', [id]);
        if (!exists.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Tenant not found' });
        }
        await client.query('DELETE FROM projects              WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM customers             WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM resources             WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM year_config           WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM tenant_config         WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM smtp_config           WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM login_logs            WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM pending_registrations WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM office_bookings       WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM office_booking_holidays WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM office_booking_config WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM post_it_replies       WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM post_it_notes         WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM pipeline_notes        WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM kb_articles           WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM kb_categories         WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM kb_products           WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM tenant_roles          WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM users                 WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM tenants               WHERE id=$1', [id]);
        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[tenants/delete]', err);
        res.status(500).json({ error: 'Could not delete tenant' });
    } finally {
        client.release();
    }
});

// =====================================================================
// User management for ANY tenant — TenantAdmin only.
// /api/tenants/:tenantId/users[/:userId]
// =====================================================================

async function assertTenantExists(req, res, next) {
    const r = await db.query('SELECT 1 FROM tenants WHERE id=$1', [req.params.tenantId]);
    if (!r.rowCount) return res.status(404).json({ error: 'Tenant not found' });
    next();
}

router.get('/:tenantId/users',
    param('tenantId').isInt(),
    assertTenantExists,
    async (req, res) => {
        const { rows } = await db.query(
            `SELECT id, username, full_name, email, phone_number, role,
                    must_change_password, created_at
               FROM users WHERE tenant_id=$1 ORDER BY username`,
            [req.params.tenantId]
        );
        res.json(rows);
    }
);

router.post('/:tenantId/users',
    param('tenantId').isInt(),
    body('username').isString().trim().isLength({ min: 1, max: 64 }),
    body('password').isString().isLength({ min: 8 }),
    body('role').isIn(['user','admin','superadmin']),
    body('full_name').optional().isString(),
    body('email').optional().isString(),
    body('phone_number').optional().isString(),
    assertTenantExists,
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const username = String(req.body.username || '').trim();
        const { password, full_name, email, phone_number, role } = req.body;
        try {
            const dup = await db.query(
                `SELECT 1 FROM users
                  WHERE tenant_id=$1 AND LOWER(username)=LOWER($2)
                  LIMIT 1`,
                [req.params.tenantId, username]
            );
            if (dup.rowCount) return res.status(409).json({ error: 'Username already exists in this team' });
            const hash = await bcrypt.hash(password, 10);
            const { rows } = await db.query(
                `INSERT INTO users(tenant_id, username, password_hash, full_name, email, phone_number, role, must_change_password)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
                 RETURNING id, username, full_name, email, phone_number, role, must_change_password`,
                [req.params.tenantId, username, hash,
                 full_name || '', email || '', phone_number || '', role]
            );
            res.status(201).json(rows[0]);
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ error: 'Username already exists in this team' });
            }
            console.error('[tenants/users/create]', err);
            res.status(500).json({ error: 'Could not create user' });
        }
    }
);

router.put('/:tenantId/users/:userId',
    param('tenantId').isInt(),
    param('userId').isInt(),
    assertTenantExists,
    async (req, res) => {
        const { full_name, email, phone_number, role, password, username } = req.body;
        const safeRole = (role && ['user','admin','superadmin'].includes(role)) ? role : null;
        const args = [];
        const sets = [];
        function push(col, val) { sets.push(`${col}=$${args.push(val)}`); }
        if (username != null) {
            const nextUsername = String(username).trim();
            const dup = await db.query(
                `SELECT 1 FROM users
                  WHERE tenant_id=$1
                    AND LOWER(username)=LOWER($2)
                    AND id<>$3
                  LIMIT 1`,
                [req.params.tenantId, nextUsername, req.params.userId]
            );
            if (dup.rowCount) return res.status(409).json({ error: 'Username already exists in this team' });
            push('username', nextUsername);
        }
        push('full_name',    full_name || '');
        push('email',        email || '');
        push('phone_number', phone_number || '');
        // COALESCE so undefined role doesn't clobber existing
        sets.push(`role = COALESCE($${args.push(safeRole)}, role)`);
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            sets.push(`password_hash=$${args.push(hash)}`);
        }
        const userIdParam = args.push(req.params.userId);
        const tenantParam = args.push(req.params.tenantId);
        const q = `UPDATE users SET ${sets.join(', ')}
                    WHERE id=$${userIdParam} AND tenant_id=$${tenantParam}
                   RETURNING id, username, full_name, email, phone_number, role, must_change_password`;
        try {
            const { rows } = await db.query(q, args);
            if (!rows[0]) return res.status(404).json({ error: 'User not found in this team' });
            res.json(rows[0]);
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ error: 'Username already exists in this team' });
            }
            console.error('[tenants/users/update]', err);
            res.status(500).json({ error: 'Could not update user' });
        }
    }
);

router.delete('/:tenantId/users/:userId',
    param('tenantId').isInt(),
    param('userId').isInt(),
    assertTenantExists,
    async (req, res) => {
        if (Number(req.params.userId) === req.user.uid) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }
        const { rowCount } = await db.query(
            'DELETE FROM users WHERE id=$1 AND tenant_id=$2',
            [req.params.userId, req.params.tenantId]
        );
        if (!rowCount) return res.status(404).json({ error: 'User not found in this team' });
        res.json({ ok: true });
    }
);

module.exports = router;
