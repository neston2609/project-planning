const express = require('express');
const bcrypt = require('bcrypt');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireTenantAdmin } = require('../middleware/auth');

const router = express.Router();

// Tenant management is reserved for the global TenantAdmin role.
router.use(requireAuth, requireTenantAdmin);

/** The default tenant id (holds the originally-migrated data; cannot be deleted). */
async function getDefaultTenantId() {
    const r = await db.query("SELECT value FROM app_config WHERE key='default_tenant_id'");
    const id = r.rows[0] ? Number(r.rows[0].value) : null;
    return Number.isInteger(id) && id > 0 ? id : null;
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

// ---------- Create a new tenant + its first superadmin ----------
// Per spec: a new team starts empty (no customers/projects/resources) but with
// one superadmin login so the team can begin adding its own data/users.
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

            const hash = await bcrypt.hash(password, 10);
            const u = await client.query(
                `INSERT INTO users(tenant_id, username, password_hash, full_name, role, must_change_password)
                 VALUES ($1,$2,$3,$4,'superadmin',TRUE)
                 RETURNING id, username, full_name, role, must_change_password`,
                [tenant.id, username, hash, fullName]
            );
            await client.query('COMMIT');
            res.status(201).json({
                tenant: { ...tenant, user_count: 1, customer_count: 0, project_count: 0, is_default: false },
                superadmin: u.rows[0]
            });
        } catch (err) {
            await client.query('ROLLBACK');
            if (err.code === '23505') {
                return res.status(409).json({ error: 'That admin username is already taken' });
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

// ---------- Delete a tenant + ALL its data (transactional cascade) ----------
// The default tenant (home of the originally-migrated data) cannot be deleted.
// FK ON DELETE CASCADE handles the project/customer/resource sub-tables, so we
// only delete the tenant-scoped top-level tables here.
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
        // projects  -> cascades project_subscriptions/perpetual_ma/service_ma/
        //              implementation/outsource/outsource_monthly + resource_assignments(project_id)
        await client.query('DELETE FROM projects              WHERE tenant_id=$1', [id]);
        // customers -> cascades customer_licenses
        await client.query('DELETE FROM customers             WHERE tenant_id=$1', [id]);
        // resources -> cascades any resource_assignments left over
        await client.query('DELETE FROM resources             WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM year_config           WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM login_logs            WHERE tenant_id=$1', [id]);
        await client.query('DELETE FROM pending_registrations WHERE tenant_id=$1', [id]);
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

module.exports = router;
