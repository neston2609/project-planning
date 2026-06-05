const express = require('express');
const db = require('../db');
const { requireAuth, tenantOf } = require('../middleware/auth');
const {
    listProjectAttachments,
    getProjectAttachment,
    sendProjectAttachment
} = require('../utils/projectAttachments');
const {
    recognizeSubscription, recognizePerpetualMA, recognizeServiceMA,
    recognizeImplementation, recognizeOutsource
} = require('../utils/revenue');
const { getPipelineThresholdPct, revenueProjectWhere } = require('../utils/pipeline');

const router = express.Router();
router.use(requireAuth);

function pickYear(req) {
    const y = Number(req.query.year);
    return Number.isInteger(y) && y > 1900 ? y : new Date().getUTCFullYear();
}

function toDate(d) {
    if (d === null || d === undefined || d === '') return null;
    if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
    const s = String(d);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
}

function overlapsYear(start, end, year) {
    start = toDate(start);
    end = toDate(end);
    if (!start && !end) return false;

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));
    const effectiveStart = start || end;
    const effectiveEnd = end || start;

    return effectiveStart <= yearEnd && effectiveEnd >= yearStart;
}

function pct(amount, base) {
    amount = Number(amount || 0);
    base = Number(base || 0);
    return base === 0 ? 0 : amount / base;
}

function emptyRow(project) {
    return {
        project_id: project.id,
        project_code: project.project_code,
        project_description: project.description || '',
        customer: project.customer_alias || '',
        status: project.status,
        start_date: project.project_start_date,
        end_date: project.project_end_date,
        attachment_count: Number(project.attachment_count || 0),
        in_selected_year: false,
        project_value: 0,

        software_subscription_revenue: 0,
        software_subscription_cost: 0,
        software_subscription_margin: 0,
        software_subscription_recognize: 0,
        software_subscription_recognize_pct: 0,

        software_perpetual_revenue: 0,
        software_perpetual_cost: 0,
        software_perpetual_margin: 0,

        software_ma_revenue: 0,
        software_ma_cost: 0,
        software_ma_margin: 0,
        software_ma_recognize: 0,
        software_ma_recognize_pct: 0,

        service_ma_revenue: 0,
        service_ma_recognize: 0,
        service_ma_recognize_pct: 0,

        implementation_revenue: 0,
        implementation_recognize: 0,
        implementation_recognize_pct: 0,

        total_recognized: 0,
        has_recognized_activity: false
    };
}

const totalKeys = [
    'project_value',
    'software_subscription_revenue',
    'software_subscription_cost',
    'software_subscription_margin',
    'software_subscription_recognize',
    'software_perpetual_revenue',
    'software_perpetual_cost',
    'software_perpetual_margin',
    'software_ma_revenue',
    'software_ma_cost',
    'software_ma_margin',
    'software_ma_recognize',
    'service_ma_revenue',
    'service_ma_recognize',
    'implementation_revenue',
    'implementation_recognize',
    'total_recognized'
];

function addTotals(t, r) {
    for (const key of totalKeys) t[key] += Number(r[key] || 0);
}

function resolveTenantId(req) {
    const role = req.user && req.user.role;
    const isPlatform = role === 'tenantadmin' || role === 'tenantuser';
    if (isPlatform) {
        const tid = Number(req.query.tenant_id);
        return Number.isInteger(tid) && tid > 0 ? tid : null;
    }
    return tenantOf(req);
}

async function projectBelongsToTenant(projectId, tenantId) {
    const { rowCount } = await db.query(
        'SELECT 1 FROM projects WHERE id=$1 AND tenant_id=$2',
        [projectId, tenantId]
    );
    return rowCount > 0;
}

router.get('/:projectId/attachments', async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id is required for platform users' });
    if (!await projectBelongsToTenant(req.params.projectId, tenantId)) {
        return res.status(404).json({ error: 'Project not found' });
    }
    res.json(await listProjectAttachments(db, req.params.projectId, tenantId));
});

router.get('/attachments/:attachmentId/download', async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id is required for platform users' });
    const row = await getProjectAttachment(db, req.params.attachmentId, tenantId);
    if (!row) return res.status(404).json({ error: 'Attachment not found' });
    sendProjectAttachment(res, row, false);
});

router.get('/attachments/:attachmentId/preview', async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id is required for platform users' });
    const row = await getProjectAttachment(db, req.params.attachmentId, tenantId);
    if (!row) return res.status(404).json({ error: 'Attachment not found' });
    sendProjectAttachment(res, row, true);
});

router.get('/', async (req, res) => {
    const year = pickYear(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
        return res.status(400).json({ error: 'tenant_id is required for platform users' });
    }

    const tenant = await db.query('SELECT id, name FROM tenants WHERE id=$1', [tenantId]);
    if (!tenant.rowCount) return res.status(404).json({ error: 'Tenant not found' });
    const threshold = await getPipelineThresholdPct(tenantId);

    const { rows: projects } = await db.query(`
        SELECT p.*, c.alias AS customer_alias, COALESCE(att.n, 0)::int AS attachment_count
          FROM projects p
          LEFT JOIN customers c ON c.id = p.customer_id
          LEFT JOIN (
            SELECT project_id, COUNT(*) AS n
              FROM project_attachments
             WHERE tenant_id=$1
            GROUP BY project_id
          ) att ON att.project_id = p.id
         WHERE p.tenant_id=$1 AND ${revenueProjectWhere('p', 2)}
         ORDER BY p.project_code
    `, [tenantId, threshold]);

    const byProject = new Map(projects.map(p => [p.id, emptyRow(p)]));
    for (const row of byProject.values()) {
        row.in_selected_year = overlapsYear(row.start_date, row.end_date, year);
    }

    const [subs, perp, service, impl, outs, monthly, allMonthly] = await Promise.all([
        db.query(`
            SELECT p.id AS project_id, s.*
              FROM project_subscriptions s
              JOIN projects p ON p.id = s.project_id
             WHERE p.tenant_id=$1 AND ${revenueProjectWhere('p', 2)}`, [tenantId, threshold]),
        db.query(`
            SELECT p.id AS project_id, m.*
              FROM project_perpetual_ma m
              JOIN projects p ON p.id = m.project_id
             WHERE p.tenant_id=$1 AND ${revenueProjectWhere('p', 2)}`, [tenantId, threshold]),
        db.query(`
            SELECT p.id AS project_id, s.*
              FROM project_service_ma s
              JOIN projects p ON p.id = s.project_id
             WHERE p.tenant_id=$1 AND ${revenueProjectWhere('p', 2)}`, [tenantId, threshold]),
        db.query(`
            SELECT p.id AS project_id, i.*
              FROM project_implementation i
              JOIN projects p ON p.id = i.project_id
             WHERE p.tenant_id=$1 AND ${revenueProjectWhere('p', 2)}`, [tenantId, threshold]),
        db.query(`
            SELECT p.id AS project_id, o.*
              FROM project_outsource o
              JOIN projects p ON p.id = o.project_id
             WHERE p.tenant_id=$1 AND ${revenueProjectWhere('p', 2)}`, [tenantId, threshold]),
        db.query(`
            SELECT pom.project_outsource_id,
                   COALESCE(SUM(pom.revenue),0)::numeric AS revenue,
                   COALESCE(SUM(pom.cost),0)::numeric AS cost
              FROM project_outsource_monthly pom
              JOIN project_outsource o ON o.id = pom.project_outsource_id
              JOIN projects p ON p.id = o.project_id
             WHERE p.tenant_id=$1 AND pom.year=$2 AND ${revenueProjectWhere('p', 3)}
             GROUP BY pom.project_outsource_id`, [tenantId, year, threshold])
        ,
        db.query(`
            SELECT pom.project_outsource_id,
                   COALESCE(SUM(pom.revenue),0)::numeric AS revenue
              FROM project_outsource_monthly pom
              JOIN project_outsource o ON o.id = pom.project_outsource_id
              JOIN projects p ON p.id = o.project_id
             WHERE p.tenant_id=$1 AND ${revenueProjectWhere('p', 2)}
             GROUP BY pom.project_outsource_id`, [tenantId, threshold])
    ]);

    for (const r of subs.rows) {
        const row = byProject.get(r.project_id);
        if (!row) continue;
        const calc = recognizeSubscription(r, year);
        row.project_value += Number(r.license_revenue || 0);
        row.software_subscription_revenue += Number(r.license_revenue || 0);
        row.software_subscription_cost += Number(r.license_cost || 0);
        row.software_subscription_margin += Number(calc.gross_margin || 0);
        row.software_subscription_recognize += Number(calc.recognize_gm || 0);
        row.total_recognized += Number(calc.recognize_gm || 0);
        if (calc.pct_recognize > 0) row.has_recognized_activity = true;
    }

    for (const r of perp.rows) {
        const row = byProject.get(r.project_id);
        if (!row) continue;
        const calc = recognizePerpetualMA(r, year);
        const revenue = Number(r.revenue || 0);
        const cost = Number(r.cost || 0);
        const gm = Number(calc.gross_margin || 0);
        row.project_value += revenue;
        if (r.item_type === 'License') {
            row.software_perpetual_revenue += Number(calc.recognize_revenue || 0);
            row.software_perpetual_cost += Number(calc.recognize_cost || 0);
            row.software_perpetual_margin += Number(calc.recognize_gm || 0);
        } else {
            row.software_ma_revenue += revenue;
            row.software_ma_cost += cost;
            row.software_ma_margin += gm;
            row.software_ma_recognize += Number(calc.recognize_gm || 0);
        }
        row.total_recognized += Number(calc.recognize_gm || 0);
        if (calc.pct_recognize > 0) row.has_recognized_activity = true;
    }

    for (const r of service.rows) {
        const row = byProject.get(r.project_id);
        if (!row) continue;
        const calc = recognizeServiceMA(r, year);
        row.project_value += Number(r.revenue || 0);
        row.service_ma_revenue += Number(r.revenue || 0);
        row.service_ma_recognize += Number(calc.recognize_revenue || 0);
        row.total_recognized += Number(calc.recognize_revenue || 0);
        if (calc.pct_recognize > 0) row.has_recognized_activity = true;
    }

    for (const r of impl.rows) {
        const row = byProject.get(r.project_id);
        if (!row) continue;
        const calc = recognizeImplementation(r, year);
        row.project_value += Number(r.revenue || 0);
        if (row.in_selected_year) {
            row.implementation_revenue += Number(r.revenue || 0);
            row.implementation_recognize += Number(calc.recognize_revenue || 0);
            row.total_recognized += Number(calc.recognize_revenue || 0);
            if (calc.pct_recognize > 0) row.has_recognized_activity = true;
        }
    }

    const monthlyMap = new Map(monthly.rows.map(r => [r.project_outsource_id, r]));
    const allMonthlyMap = new Map(allMonthly.rows.map(r => [r.project_outsource_id, r]));
    for (const r of outs.rows) {
        const row = byProject.get(r.project_id);
        if (!row) continue;
        const isMM = r.outsource_type === 'Man-Month';
        const sum = monthlyMap.get(r.id);
        const totalSum = allMonthlyMap.get(r.id);
        const revenue = isMM ? Number(sum?.revenue || 0) : Number(r.revenue || 0);
        const cost = isMM ? Number(sum?.cost || 0) : Number(r.cost || 0);
        row.project_value += isMM ? Number(totalSum?.revenue || 0) : Number(r.revenue || 0);
        const calc = recognizeOutsource({ ...r, revenue, cost }, year);
        row.implementation_revenue += revenue;
        row.implementation_recognize += Number(calc.recognize_revenue || 0);
        row.total_recognized += Number(calc.recognize_revenue || 0);
        if (calc.pct_recognize > 0) row.has_recognized_activity = true;
    }

    const rows = [...byProject.values()]
        .filter(r => r.in_selected_year || r.has_recognized_activity)
        .map(r => ({
            ...r,
            software_subscription_recognize_pct: pct(
                r.software_subscription_recognize,
                r.software_subscription_margin
            ),
            software_ma_recognize_pct: pct(r.software_ma_recognize, r.software_ma_margin),
            service_ma_recognize_pct: pct(r.service_ma_recognize, r.service_ma_revenue),
            implementation_recognize_pct: pct(r.implementation_recognize, r.implementation_revenue)
        }));

    const totals = emptyRow({
        id: null, project_code: 'TOTAL', description: '', status: '',
        project_start_date: null, project_end_date: null, customer_alias: ''
    });
    for (const row of rows) addTotals(totals, row);
    totals.software_subscription_recognize_pct = pct(
        totals.software_subscription_recognize,
        totals.software_subscription_margin
    );
    totals.software_ma_recognize_pct = pct(totals.software_ma_recognize, totals.software_ma_margin);
    totals.service_ma_recognize_pct = pct(totals.service_ma_recognize, totals.service_ma_revenue);
    totals.implementation_recognize_pct = pct(totals.implementation_recognize, totals.implementation_revenue);

    res.json({
        year,
        tenant: tenant.rows[0],
        rows,
        totals
    });
});

module.exports = router;
