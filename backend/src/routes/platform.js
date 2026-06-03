const express = require('express');
const bcrypt = require('bcrypt');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const {
    requireAuth, requireTenantAdmin, requirePlatformRole
} = require('../middleware/auth');
const {
    recognizeSubscription, recognizePerpetualMA, recognizeServiceMA,
    recognizeImplementation, recognizeOutsource
} = require('../utils/revenue');

const router = express.Router();

// Every route here needs a platform-level role. The /users CRUD adds an
// extra requireTenantAdmin (TenantUser cannot manage accounts).
router.use(requireAuth, requirePlatformRole);

function pickYear(req) {
    const y = Number(req.query.year);
    return Number.isInteger(y) && y > 1900 ? y : new Date().getUTCFullYear();
}

function statusBucket(status) {
    if (status === 'Pipeline') return 'Pipeline';
    if (status === 'Win' || status === 'Backlog') return 'BacklogWin';
    return null;
}

// =====================================================================
// GET /api/platform/dashboard?year=YYYY
//
// Cross-tenant revenue summary. Pulls every tenant's project rows in five
// non-tenant-scoped queries (each row carries its own tenant_id), groups in
// memory, runs the same recognize-revenue math as the per-tenant /summary,
// and joins year_config for each tenant's target.
//
// Returns { year, tenants: [...], grand_totals: {...} }.
//
// Accessible by tenantadmin AND tenantuser.
// =====================================================================
router.get('/dashboard', async (req, res) => {
    const year = pickYear(req);

    // Load all tenants up-front so tenants with zero data still appear.
    const { rows: tenants } = await db.query(
        'SELECT id, name FROM tenants ORDER BY name'
    );
    if (tenants.length === 0) {
        return res.json({ year, tenants: [], grand_totals: emptyTotals() });
    }

    // Per-section pulls (no tenant filter — we group in JS).
    const [subs, perp, sv, impl, outs, monthly, yearCfg] = await Promise.all([
        db.query(`
            SELECT p.tenant_id, p.status, s.*
              FROM project_subscriptions s
              JOIN projects p ON p.id = s.project_id
             WHERE p.status <> 'Loss'`),
        db.query(`
            SELECT p.tenant_id, p.status, m.*
              FROM project_perpetual_ma m
              JOIN projects p ON p.id = m.project_id
             WHERE p.status <> 'Loss'`),
        db.query(`
            SELECT p.tenant_id, p.status, s.*
              FROM project_service_ma s
              JOIN projects p ON p.id = s.project_id
             WHERE p.status <> 'Loss'`),
        db.query(`
            SELECT p.tenant_id, p.status, i.*
              FROM project_implementation i
              JOIN projects p ON p.id = i.project_id
             WHERE p.status <> 'Loss'`),
        db.query(`
            SELECT p.tenant_id, p.status, o.*
              FROM project_outsource o
              JOIN projects p ON p.id = o.project_id
             WHERE p.status <> 'Loss'`),
        db.query(`
            SELECT pom.project_outsource_id,
                   COALESCE(SUM(pom.revenue),0)::numeric AS rev,
                   COALESCE(SUM(pom.cost),0)::numeric    AS cst
              FROM project_outsource_monthly pom
             WHERE pom.year = $1
             GROUP BY pom.project_outsource_id`, [year]),
        db.query('SELECT tenant_id, headcount, revenue_per_headcount FROM year_config WHERE year = $1', [year])
    ]);

    const monthlyMap = new Map(monthly.rows.map(r => [r.project_outsource_id, r]));
    const yearMap    = new Map(yearCfg.rows.map(r => [r.tenant_id, r]));

    // Per-tenant accumulator.
    const acc = new Map();
    for (const t of tenants) {
        acc.set(t.id, { tenant_id: t.id, tenant_name: t.name, ...emptyBuckets() });
    }
    function ensure(tid) {
        if (!acc.has(tid)) acc.set(tid, { tenant_id: tid, tenant_name: '(unknown)', ...emptyBuckets() });
        return acc.get(tid);
    }
    function addBuckets(t, value, sectionKey, status) {
        const bucket = statusBucket(status);
        if (!bucket) return;
        if (bucket === 'Pipeline') {
            if (sectionKey === 'license') t.pipeline_license_revenue += value;
            if (sectionKey === 'service') t.pipeline_service_revenue += value;
        } else {
            if (sectionKey === 'license') t.backlog_win_license_revenue += value;
            if (sectionKey === 'service') t.backlog_win_service_revenue += value;
        }
    }

    // Subscriptions + Perpetual = license-side (recognize GM)
    for (const r of subs.rows) {
        const calc = recognizeSubscription(r, year);
        addBuckets(ensure(r.tenant_id), Number(calc.recognize_gm) || 0, 'license', r.status);
    }
    for (const r of perp.rows) {
        const calc = recognizePerpetualMA(r, year);
        addBuckets(ensure(r.tenant_id), Number(calc.recognize_gm) || 0, 'license', r.status);
    }
    // Service MA + Implementation + Outsource = service-side (recognize REVENUE)
    for (const r of sv.rows) {
        const calc = recognizeServiceMA(r, year);
        addBuckets(ensure(r.tenant_id), Number(calc.recognize_revenue) || 0, 'service', r.status);
    }
    for (const r of impl.rows) {
        const calc = recognizeImplementation(r, year);
        addBuckets(ensure(r.tenant_id), Number(calc.recognize_revenue) || 0, 'service', r.status);
    }
    for (const r of outs.rows) {
        const isMM = r.outsource_type === 'Man-Month';
        const sum  = monthlyMap.get(r.id);
        const revenue = isMM ? Number(sum?.rev || 0) : Number(r.revenue || 0);
        const cost    = isMM ? Number(sum?.cst || 0) : Number(r.cost    || 0);
        const calc = recognizeOutsource({ ...r, revenue, cost }, year);
        addBuckets(ensure(r.tenant_id), Number(calc.recognize_revenue) || 0, 'service', r.status);
    }

    // Finalize per-tenant totals + targets.
    const tenantsOut = [];
    for (const t of acc.values()) {
        t.total_revenue =
            t.pipeline_license_revenue + t.pipeline_service_revenue +
            t.backlog_win_license_revenue + t.backlog_win_service_revenue;
        const yc = yearMap.get(t.tenant_id);
        t.headcount             = Number(yc?.headcount || 0);
        t.revenue_per_headcount = Number(yc?.revenue_per_headcount || 0);
        t.target_revenue        = t.headcount * t.revenue_per_headcount;
        t.remaining_gap         = Math.max(0, t.target_revenue - t.total_revenue);
        tenantsOut.push(t);
    }
    tenantsOut.sort((a, b) => (a.tenant_name || '').localeCompare(b.tenant_name || ''));

    // Grand totals across every tenant.
    const grand = emptyTotals();
    for (const t of tenantsOut) {
        grand.pipeline_license_revenue    += t.pipeline_license_revenue;
        grand.pipeline_service_revenue    += t.pipeline_service_revenue;
        grand.backlog_win_license_revenue += t.backlog_win_license_revenue;
        grand.backlog_win_service_revenue += t.backlog_win_service_revenue;
        grand.total_revenue               += t.total_revenue;
        grand.target_revenue              += t.target_revenue;
        grand.headcount                   += t.headcount;
    }
    grand.remaining_gap = Math.max(0, grand.target_revenue - grand.total_revenue);

    res.json({ year, tenants: tenantsOut, grand_totals: grand });
});

function emptyBuckets() {
    return {
        pipeline_license_revenue: 0,
        pipeline_service_revenue: 0,
        backlog_win_license_revenue: 0,
        backlog_win_service_revenue: 0
    };
}
function emptyTotals() {
    return {
        ...emptyBuckets(),
        total_revenue: 0,
        target_revenue: 0,
        remaining_gap: 0,
        headcount: 0
    };
}

// =====================================================================
// /api/platform/users — manage tenantadmin / tenantuser accounts.
// TenantAdmin only (TenantUser is read-only platform).
// =====================================================================

const PLATFORM_ROLES = ['tenantadmin', 'tenantuser'];

router.get('/users', requireTenantAdmin, async (_req, res) => {
    const { rows } = await db.query(
        `SELECT id, username, full_name, email, phone_number, role,
                must_change_password, created_at
           FROM users
          WHERE tenant_id IS NULL AND role IN ('tenantadmin','tenantuser')
          ORDER BY role, username`
    );
    res.json(rows);
});

router.post('/users', requireTenantAdmin,
    body('username').isString().trim().isLength({ min: 1, max: 64 }),
    body('password').isString().isLength({ min: 8 }),
    body('role').isIn(PLATFORM_ROLES),
    body('full_name').optional().isString(),
    body('email').optional().isString(),
    body('phone_number').optional().isString(),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const username = String(req.body.username || '').trim();
        const { password, full_name, email, phone_number, role } = req.body;
        try {
            const dup = await db.query(
                `SELECT 1 FROM users
                  WHERE tenant_id IS NULL
                    AND LOWER(username)=LOWER($1)
                    AND role IN ('tenantadmin','tenantuser')
                  LIMIT 1`,
                [username]
            );
            if (dup.rowCount) return res.status(409).json({ error: 'That platform username is already taken' });
            const hash = await bcrypt.hash(password, 10);
            const { rows } = await db.query(
                `INSERT INTO users(tenant_id, username, password_hash, full_name, email, phone_number, role, must_change_password)
                 VALUES (NULL, $1, $2, $3, $4, $5, $6, TRUE)
                 RETURNING id, username, full_name, email, phone_number, role, must_change_password`,
                [username, hash, full_name || '', email || '', phone_number || '', role]
            );
            res.status(201).json(rows[0]);
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ error: 'That platform username is already taken' });
            }
            console.error('[platform/users/create]', err);
            res.status(500).json({ error: 'Could not create platform user' });
        }
    }
);

router.put('/users/:id', requireTenantAdmin, param('id').isInt(), async (req, res) => {
    const { full_name, email, phone_number, role, password, username } = req.body;
    const safeRole = (role && PLATFORM_ROLES.includes(role)) ? role : null;
    const args = [];
    const sets = [];
    function push(col, val) { sets.push(`${col}=$${args.push(val)}`); }
    if (username != null) {
        const nextUsername = String(username).trim();
        const dup = await db.query(
            `SELECT 1 FROM users
              WHERE tenant_id IS NULL
                AND LOWER(username)=LOWER($1)
                AND id<>$2
                AND role IN ('tenantadmin','tenantuser')
              LIMIT 1`,
            [nextUsername, req.params.id]
        );
        if (dup.rowCount) return res.status(409).json({ error: 'That platform username is already taken' });
        push('username', nextUsername);
    }
    push('full_name',    full_name || '');
    push('email',        email || '');
    push('phone_number', phone_number || '');
    sets.push(`role = COALESCE($${args.push(safeRole)}, role)`);
    if (password) {
        const hash = await bcrypt.hash(password, 10);
        sets.push(`password_hash=$${args.push(hash)}`);
    }
    const idParam = args.push(req.params.id);
    // Hard guard: only operate on platform accounts (tenant_id IS NULL,
    // role currently tenantadmin or tenantuser).
    const q = `UPDATE users SET ${sets.join(', ')}
                WHERE id=$${idParam}
                  AND tenant_id IS NULL
                  AND role IN ('tenantadmin','tenantuser')
                RETURNING id, username, full_name, email, phone_number, role, must_change_password`;
    try {
        const { rows } = await db.query(q, args);
        if (!rows[0]) return res.status(404).json({ error: 'Platform user not found' });
        res.json(rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'That platform username is already taken' });
        }
        console.error('[platform/users/update]', err);
        res.status(500).json({ error: 'Could not update platform user' });
    }
});

router.delete('/users/:id', requireTenantAdmin, param('id').isInt(), async (req, res) => {
    if (Number(req.params.id) === req.user.uid) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    // Don't allow deleting the last remaining TenantAdmin — would lock out platform.
    const target = await db.query(
        `SELECT role FROM users
          WHERE id=$1 AND tenant_id IS NULL AND role IN ('tenantadmin','tenantuser')`,
        [req.params.id]
    );
    if (!target.rowCount) return res.status(404).json({ error: 'Platform user not found' });
    if (target.rows[0].role === 'tenantadmin') {
        const others = await db.query(
            `SELECT COUNT(*)::int AS n FROM users
              WHERE tenant_id IS NULL AND role='tenantadmin' AND id <> $1`,
            [req.params.id]
        );
        if (others.rows[0].n === 0) {
            return res.status(400).json({ error: 'Cannot delete the only remaining TenantAdmin' });
        }
    }
    const { rowCount } = await db.query(
        `DELETE FROM users
          WHERE id=$1 AND tenant_id IS NULL AND role IN ('tenantadmin','tenantuser')`,
        [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Platform user not found' });
    res.json({ ok: true });
});

module.exports = router;
