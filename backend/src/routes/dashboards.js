const express = require('express');
const db = require('../db');
const { requireAuth, requireTenant } = require('../middleware/auth');
const {
    recognizeSubscription, recognizePerpetualMA, recognizeServiceMA,
    recognizeImplementation, recognizeOutsource
} = require('../utils/revenue');
const { getPipelineThresholdPct, revenueProjectWhere } = require('../utils/pipeline');

const router = express.Router();
// All dashboard endpoints require a logged-in user bound to a tenant.
router.use(requireAuth, requireTenant);

function pickYear(req) {
    const y = Number(req.query.year);
    return Number.isInteger(y) && y > 1900 ? y : new Date().getUTCFullYear();
}

function statusBucket(status) {
    if (status === 'Pipeline') return 'Pipeline';
    if (status === 'Win' || status === 'Backlog') return 'BacklogWin';
    return null; // Loss -> excluded
}

function hasRecognition(calc) {
    return Number(calc?.pct_recognize || 0) > 0;
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

// ---------- Subscription Dashboard ----------
router.get('/subscriptions', async (req, res) => {
    const year = pickYear(req);
    const threshold = await getPipelineThresholdPct(req.tenantId);
    const { rows } = await db.query(`
        SELECT p.id AS project_id, p.project_code, p.description, p.status,
               p.customer_id,
               c.alias AS customer_alias, c.full_name AS customer_full_name,
               s.*
          FROM project_subscriptions s
          JOIN projects p  ON p.id = s.project_id
          LEFT JOIN customers c ON c.id = p.customer_id
         WHERE ${revenueProjectWhere('p', 2)} AND p.tenant_id = $1
         ORDER BY p.project_code
    `, [req.tenantId, threshold]);
    const out = rows.map(r => {
        const calc = recognizeSubscription(r, year);
        return {
            project_id: r.project_id,
            project_code: r.project_code,
            description: r.description,
            customer_id: r.customer_id,
            customer: r.customer_alias,
            status: r.status,
            license_name: r.license_name,
            license_start_date: r.license_start_date,
            license_end_date: r.license_end_date,
            license_revenue: Number(r.license_revenue),
            license_cost:    Number(r.license_cost),
            license_gross_margin: calc.gross_margin,
            pct_recognize:        calc.pct_recognize,
            recognize_revenue:    calc.recognize_revenue,
            recognize_gross_margin: calc.recognize_gm
        };
    }).filter(r => r.pct_recognize > 0);
    res.json({ year, rows: out });
});

// ---------- Perpetual / SW MA Dashboard ----------
router.get('/perpetual-ma', async (req, res) => {
    const year = pickYear(req);
    const threshold = await getPipelineThresholdPct(req.tenantId);
    const { rows } = await db.query(`
        SELECT p.id AS project_id, p.project_code, p.description, p.status,
               c.alias AS customer_alias,
               m.*
          FROM project_perpetual_ma m
          JOIN projects p  ON p.id = m.project_id
          LEFT JOIN customers c ON c.id = p.customer_id
         WHERE ${revenueProjectWhere('p', 2)} AND p.tenant_id = $1
         ORDER BY p.project_code, m.id
    `, [req.tenantId, threshold]);
    const out = rows.map(r => {
        const calc = recognizePerpetualMA(r, year);
        return {
            project_id: r.project_id,
            project_code: r.project_code,
            description: r.description,
            customer: r.customer_alias,
            status: r.status,
            item_name: r.item_name,
            item_type: r.item_type,
            start_date: r.start_date,
            end_date: r.end_date,
            revenue: Number(r.revenue),
            cost:    Number(r.cost),
            gross_margin: calc.gross_margin,
            pct_recognize: calc.pct_recognize,
            recognize_revenue: calc.recognize_revenue,
            recognize_gross_margin: calc.recognize_gm
        };
    }).filter(r => r.pct_recognize > 0);
    res.json({ year, rows: out });
});

// ---------- Service MA Dashboard ----------
router.get('/service-ma', async (req, res) => {
    const year = pickYear(req);
    const threshold = await getPipelineThresholdPct(req.tenantId);
    const { rows } = await db.query(`
        SELECT p.id AS project_id, p.project_code, p.status,
               p.description AS project_description,
               c.alias AS customer_alias,
               s.*
          FROM project_service_ma s
          JOIN projects p  ON p.id = s.project_id
          LEFT JOIN customers c ON c.id = p.customer_id
         WHERE ${revenueProjectWhere('p', 2)} AND p.tenant_id = $1
         ORDER BY p.project_code, s.id
    `, [req.tenantId, threshold]);
    const out = rows.map(r => {
        const calc = recognizeServiceMA(r, year);
        const subDesc = (r.description || '').trim();
        const desc    = subDesc || r.project_description || '';
        return {
            project_id: r.project_id, project_code: r.project_code,
            description: desc, customer: r.customer_alias,
            status: r.status,
            service_ma_description: subDesc,
            start_date: r.start_date, end_date: r.end_date,
            revenue: Number(r.revenue), cost: Number(r.cost),
            gross_margin: calc.gross_margin,
            pct_recognize: calc.pct_recognize,
            recognize_revenue: calc.recognize_revenue,
            recognize_gross_margin: calc.recognize_gm
        };
    }).filter(r => r.pct_recognize > 0);
    res.json({ year, rows: out });
});

// ---------- Implementation Dashboard ----------
router.get('/implementation', async (req, res) => {
    const year = pickYear(req);
    const threshold = await getPipelineThresholdPct(req.tenantId);
    const { rows } = await db.query(`
        SELECT p.id AS project_id, p.project_code, p.status, p.pipeline_target_date,
               p.project_start_date, p.project_end_date,
               p.description AS project_description,
               c.alias AS customer_alias,
               i.*
          FROM project_implementation i
          JOIN projects p  ON p.id = i.project_id
          LEFT JOIN customers c ON c.id = p.customer_id
         WHERE ${revenueProjectWhere('p', 2)} AND p.tenant_id = $1
         ORDER BY p.project_code
    `, [req.tenantId, threshold]);
    const out = rows.map(r => {
        const calc = recognizeImplementation(r, year);
        const subDesc = (r.description || '').trim();
        const desc    = subDesc || r.project_description || '';
        return {
            project_id: r.project_id, project_code: r.project_code,
            description: desc, customer: r.customer_alias,
            status: r.status, pipeline_target_date: r.pipeline_target_date,
            project_start_date: r.project_start_date,
            project_end_date: r.project_end_date,
            revenue: Number(r.revenue), cost: Number(r.cost),
            gross_margin: calc.gross_margin,
            progress_last_year_pct: Number(r.progress_last_year_pct),
            progress_this_year_pct: Number(r.progress_this_year_pct),
            pct_recognize: calc.pct_recognize,
            recognize_revenue: calc.recognize_revenue,
            recognize_gross_margin: calc.recognize_gm
        };
    }).filter(r => hasRecognition(r) && overlapsYear(r.project_start_date, r.project_end_date, year));
    res.json({ year, rows: out });
});

// ---------- Outsource Dashboard ----------
router.get('/outsource', async (req, res) => {
    const year = pickYear(req);
    const threshold = await getPipelineThresholdPct(req.tenantId);
    const { rows: outsRows } = await db.query(`
        SELECT p.id AS project_id, p.project_code, p.status,
               p.description AS project_description,
               c.alias AS customer_alias,
               o.*
          FROM project_outsource o
          JOIN projects p  ON p.id = o.project_id
          LEFT JOIN customers c ON c.id = p.customer_id
         WHERE ${revenueProjectWhere('p', 2)} AND p.tenant_id = $1
         ORDER BY p.project_code
    `, [req.tenantId, threshold]);

    const monthly = await db.query(
        `SELECT pom.project_outsource_id,
                COALESCE(SUM(pom.revenue),0)::numeric AS revenue,
                COALESCE(SUM(pom.cost),0)::numeric    AS cost
          FROM project_outsource_monthly pom
          JOIN project_outsource o ON o.id = pom.project_outsource_id
          JOIN projects p          ON p.id = o.project_id
          WHERE pom.year = $1 AND p.tenant_id = $2 AND ${revenueProjectWhere('p', 3)}
          GROUP BY pom.project_outsource_id`,
        [year, req.tenantId, threshold]
    );
    const monthlySum = new Map(monthly.rows.map(r => [r.project_outsource_id, r]));

    const out = outsRows.map(r => {
        let revenue = Number(r.revenue || 0);
        let cost    = Number(r.cost    || 0);
        if (r.outsource_type === 'Man-Month') {
            const m = monthlySum.get(r.id);
            revenue = Number(m ? m.revenue : 0);
            cost    = Number(m ? m.cost    : 0);
        }
        const calc = recognizeOutsource({ ...r, revenue, cost }, year);
        const subDesc = (r.description || '').trim();
        const desc    = subDesc || r.project_description || '';
        return {
            project_id: r.project_id, project_code: r.project_code,
            description: desc, customer: r.customer_alias,
            status: r.status,
            outsource_type: r.outsource_type,
            start_date: r.start_date, end_date: r.end_date,
            revenue, cost,
            gross_margin: calc.gross_margin,
            pct_recognize: calc.pct_recognize,
            recognize_revenue: calc.recognize_revenue,
            recognize_gross_margin: calc.recognize_gm
        };
    }).filter(r => r.pct_recognize > 0);
    res.json({ year, rows: out });
});

// ---------- Summarized / Total Dashboard ----------
router.get('/summary', async (req, res) => {
    const year = pickYear(req);
    const tenantId = req.tenantId;
    const threshold = await getPipelineThresholdPct(tenantId);

    const subs = (await internal('subscriptions', year, tenantId, threshold)).rows;
    const perp = (await internal('perpetual-ma',  year, tenantId, threshold)).rows;
    const sv   = (await internal('service-ma',    year, tenantId, threshold)).rows;
    const impl = (await internal('implementation',year, tenantId, threshold)).rows;
    const outs = (await internal('outsource',     year, tenantId, threshold)).rows;

    const buckets = {
        pipeline_license_revenue: 0,
        pipeline_service_revenue: 0,
        backlog_win_license_revenue: 0,
        backlog_win_service_revenue: 0
    };

    function add(value, sectionKey, status) {
        const bucket = statusBucket(status);
        if (!bucket) return;
        if (bucket === 'Pipeline') {
            if (sectionKey === 'license') buckets.pipeline_license_revenue += value;
            if (sectionKey === 'service') buckets.pipeline_service_revenue += value;
        } else {
            if (sectionKey === 'license') buckets.backlog_win_license_revenue += value;
            if (sectionKey === 'service') buckets.backlog_win_service_revenue += value;
        }
    }

    for (const r of subs) add(Number(r.recognize_gm) || 0, 'license', r.status);
    for (const r of perp) add(Number(r.recognize_gm) || 0, 'license', r.status);
    for (const r of sv)   add(Number(r.recognize_revenue) || 0, 'service', r.status);
    for (const r of impl) add(Number(r.recognize_revenue) || 0, 'service', r.status);
    for (const r of outs) add(Number(r.recognize_revenue) || 0, 'service', r.status);

    const total = buckets.pipeline_license_revenue + buckets.pipeline_service_revenue +
                  buckets.backlog_win_license_revenue + buckets.backlog_win_service_revenue;

    // Target = headcount * revenue_per_headcount (tenant-scoped year_config)
    const yc = await db.query(
        'SELECT * FROM year_config WHERE tenant_id=$1 AND year=$2',
        [tenantId, year]
    );
    const headcount = Number(yc.rows[0]?.headcount || 0);
    const rph       = Number(yc.rows[0]?.revenue_per_headcount || 0);
    const target_revenue = headcount * rph;
    const remaining_gap  = Math.max(0, target_revenue - total);

    res.json({
        year, ...buckets,
        total_revenue: total,
        headcount, revenue_per_headcount: rph,
        target_revenue, remaining_gap,
        details: {
            subscriptions: subs, perpetual_ma: perp, service_ma: sv,
            implementation: impl, outsource: outs
        }
    });
});

// In-process data fetch for the summary roll-up. tenant-scoped.
async function internal(kind, year, tenantId, threshold) {
    if (kind === 'subscriptions') {
        const { rows } = await db.query(`
            SELECT p.status, s.*  FROM project_subscriptions s
              JOIN projects p ON p.id = s.project_id
             WHERE ${revenueProjectWhere('p', 2)} AND p.tenant_id = $1`, [tenantId, threshold]);
        return { rows: rows.map(r => ({ ...recognizeSubscription(r, year), status: r.status }))
            .filter(hasRecognition) };
    }
    if (kind === 'perpetual-ma') {
        const { rows } = await db.query(`
            SELECT p.status, m.*  FROM project_perpetual_ma m
              JOIN projects p ON p.id = m.project_id
             WHERE ${revenueProjectWhere('p', 2)} AND p.tenant_id = $1`, [tenantId, threshold]);
        return { rows: rows.map(r => ({ ...recognizePerpetualMA(r, year), status: r.status }))
            .filter(hasRecognition) };
    }
    if (kind === 'service-ma') {
        const { rows } = await db.query(`
            SELECT p.status, s.*  FROM project_service_ma s
              JOIN projects p ON p.id = s.project_id
             WHERE ${revenueProjectWhere('p', 2)} AND p.tenant_id = $1`, [tenantId, threshold]);
        return { rows: rows.map(r => ({ ...recognizeServiceMA(r, year), status: r.status }))
            .filter(hasRecognition) };
    }
    if (kind === 'implementation') {
        const { rows } = await db.query(`
            SELECT p.status, p.project_start_date, p.project_end_date, i.*  FROM project_implementation i
              JOIN projects p ON p.id = i.project_id
             WHERE ${revenueProjectWhere('p', 2)} AND p.tenant_id = $1`, [tenantId, threshold]);
        return { rows: rows.map(r => ({ ...recognizeImplementation(r, year), status: r.status,
                project_start_date: r.project_start_date, project_end_date: r.project_end_date }))
            .filter(r => hasRecognition(r) && overlapsYear(r.project_start_date, r.project_end_date, year)) };
    }
    if (kind === 'outsource') {
        const { rows: o } = await db.query(`
            SELECT p.status, o.*  FROM project_outsource o
              JOIN projects p ON p.id = o.project_id
             WHERE ${revenueProjectWhere('p', 2)} AND p.tenant_id = $1`, [tenantId, threshold]);
        const { rows: m } = await db.query(`
            SELECT pom.project_outsource_id,
                   COALESCE(SUM(pom.revenue),0)::numeric AS rev,
                   COALESCE(SUM(pom.cost),0)::numeric    AS cst
              FROM project_outsource_monthly pom
              JOIN project_outsource o ON o.id = pom.project_outsource_id
              JOIN projects p          ON p.id = o.project_id
             WHERE pom.year = $1 AND p.tenant_id = $2 AND ${revenueProjectWhere('p', 3)}
             GROUP BY pom.project_outsource_id`, [year, tenantId, threshold]);
        const map = new Map(m.map(x => [x.project_outsource_id, x]));
        return { rows: o.map(r => {
            const isMM = r.outsource_type === 'Man-Month';
            const sum = map.get(r.id);
            const revenue = isMM ? Number(sum?.rev || 0) : Number(r.revenue || 0);
            const cost    = isMM ? Number(sum?.cst || 0) : Number(r.cost    || 0);
            return { ...recognizeOutsource({ ...r, revenue, cost }, year), status: r.status };
        }).filter(hasRecognition) };
    }
    return { rows: [] };
}

module.exports = router;
