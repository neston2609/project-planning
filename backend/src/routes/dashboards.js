const express = require('express');
const db = require('../db');
const {
    recognizeSubscription, recognizePerpetualMA, recognizeServiceMA,
    recognizeImplementation, recognizeOutsource
} = require('../utils/revenue');

const router = express.Router();

function pickYear(req) {
    const y = Number(req.query.year);
    return Number.isInteger(y) && y > 1900 ? y : new Date().getUTCFullYear();
}

function statusBucket(status) {
    if (status === 'Pipeline') return 'Pipeline';
    if (status === 'Win' || status === 'Backlog') return 'BacklogWin';
    return null; // Loss → excluded
}

// ---------- Subscription Dashboard ----------
router.get('/subscriptions', async (req, res) => {
    const year = pickYear(req);
    const { rows } = await db.query(`
        SELECT p.id AS project_id, p.project_code, p.description, p.status,
               c.alias AS customer_alias, c.full_name AS customer_full_name,
               s.*
          FROM project_subscriptions s
          JOIN projects p  ON p.id = s.project_id
          LEFT JOIN customers c ON c.id = p.customer_id
         WHERE p.status <> 'Loss'
         ORDER BY p.project_code
    `);
    const out = rows.map(r => {
        const calc = recognizeSubscription(r, year);
        return {
            project_id: r.project_id,
            project_code: r.project_code,
            description: r.description,
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
    });
    res.json({ year, rows: out });
});

// ---------- Perpetual / SW MA Dashboard ----------
router.get('/perpetual-ma', async (req, res) => {
    const year = pickYear(req);
    const { rows } = await db.query(`
        SELECT p.id AS project_id, p.project_code, p.description, p.status,
               c.alias AS customer_alias,
               m.*
          FROM project_perpetual_ma m
          JOIN projects p  ON p.id = m.project_id
          LEFT JOIN customers c ON c.id = p.customer_id
         WHERE p.status <> 'Loss'
         ORDER BY p.project_code, m.id
    `);
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
    });
    res.json({ year, rows: out });
});

// ---------- Service MA Dashboard ----------
router.get('/service-ma', async (req, res) => {
    const year = pickYear(req);
    const { rows } = await db.query(`
        SELECT p.id AS project_id, p.project_code, p.description, p.status,
               c.alias AS customer_alias,
               s.*
          FROM project_service_ma s
          JOIN projects p  ON p.id = s.project_id
          LEFT JOIN customers c ON c.id = p.customer_id
         WHERE p.status <> 'Loss'
         ORDER BY p.project_code, s.id
    `);
    const out = rows.map(r => {
        const calc = recognizeServiceMA(r, year);
        return {
            project_id: r.project_id, project_code: r.project_code,
            description: r.description, customer: r.customer_alias,
            status: r.status,
            service_ma_description: r.description ? r.description : '',
            start_date: r.start_date, end_date: r.end_date,
            revenue: Number(r.revenue), cost: Number(r.cost),
            gross_margin: calc.gross_margin,
            pct_recognize: calc.pct_recognize,
            recognize_revenue: calc.recognize_revenue,
            recognize_gross_margin: calc.recognize_gm
        };
    });
    res.json({ year, rows: out });
});

// ---------- Implementation Dashboard ----------
router.get('/implementation', async (req, res) => {
    const year = pickYear(req);
    const { rows } = await db.query(`
        SELECT p.id AS project_id, p.project_code, p.description, p.status, p.pipeline_target_date,
               c.alias AS customer_alias,
               i.*
          FROM project_implementation i
          JOIN projects p  ON p.id = i.project_id
          LEFT JOIN customers c ON c.id = p.customer_id
         WHERE p.status <> 'Loss'
         ORDER BY p.project_code
    `);
    const out = rows.map(r => {
        const calc = recognizeImplementation(r, year);
        return {
            project_id: r.project_id, project_code: r.project_code,
            description: r.description, customer: r.customer_alias,
            status: r.status, pipeline_target_date: r.pipeline_target_date,
            revenue: Number(r.revenue), cost: Number(r.cost),
            gross_margin: calc.gross_margin,
            progress_last_year_pct: Number(r.progress_last_year_pct),
            progress_this_year_pct: Number(r.progress_this_year_pct),
            pct_recognize: calc.pct_recognize,
            recognize_revenue: calc.recognize_revenue,
            recognize_gross_margin: calc.recognize_gm
        };
    });
    res.json({ year, rows: out });
});

// ---------- Outsource Dashboard ----------
router.get('/outsource', async (req, res) => {
    const year = pickYear(req);
    const { rows: outsRows } = await db.query(`
        SELECT p.id AS project_id, p.project_code, p.description, p.status,
               c.alias AS customer_alias,
               o.*
          FROM project_outsource o
          JOIN projects p  ON p.id = o.project_id
          LEFT JOIN customers c ON c.id = p.customer_id
         WHERE p.status <> 'Loss'
         ORDER BY p.project_code
    `);

    const monthly = await db.query(
        `SELECT project_outsource_id, COALESCE(SUM(revenue),0)::numeric AS revenue,
                                       COALESCE(SUM(cost),0)::numeric    AS cost
           FROM project_outsource_monthly
          WHERE year = $1 GROUP BY project_outsource_id`,
        [year]
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
        return {
            project_id: r.project_id, project_code: r.project_code,
            description: r.description, customer: r.customer_alias,
            status: r.status,
            outsource_type: r.outsource_type,
            start_date: r.start_date, end_date: r.end_date,
            revenue, cost,
            gross_margin: calc.gross_margin,
            pct_recognize: calc.pct_recognize,
            recognize_revenue: calc.recognize_revenue,
            recognize_gross_margin: calc.recognize_gm
        };
    });
    res.json({ year, rows: out });
});

// ---------- Summarized / Total Dashboard ----------
router.get('/summary', async (req, res) => {
    const year = pickYear(req);

    // Reuse the per-section computations.
    const subs = (await internal('subscriptions', year)).rows;
    const perp = (await internal('perpetual-ma',  year)).rows;
    const sv   = (await internal('service-ma',    year)).rows;
    const impl = (await internal('implementation',year)).rows;
    const outs = (await internal('outsource',     year)).rows;

    const buckets = {
        pipeline_license_revenue: 0,   // sum of recognize GM for Subscription + Perpetual + SW MA, status=Pipeline
        pipeline_service_revenue: 0,   // sum of recognize REV for Service MA + Outsource + Implementation, status=Pipeline
        backlog_win_license_revenue: 0,// sum of recognize GM for Subscription + Perpetual,  status=Win/Backlog
        backlog_win_service_revenue: 0 // sum of recognize REV for Service MA + Outsource + Implementation, status=Win/Backlog
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

    // License-side (use recognize GROSS MARGIN per spec)
    for (const r of subs) add(r.recognize_gross_margin, 'license', r.status);
    for (const r of perp) add(r.recognize_gross_margin, 'license', r.status);
    // Service-side (use recognize REVENUE)
    for (const r of sv)   add(r.recognize_revenue, 'service', r.status);
    for (const r of impl) add(r.recognize_revenue, 'service', r.status);
    for (const r of outs) add(r.recognize_revenue, 'service', r.status);

    const total = buckets.pipeline_license_revenue + buckets.pipeline_service_revenue +
                  buckets.backlog_win_license_revenue + buckets.backlog_win_service_revenue;

    // Target = headcount * revenue_per_headcount
    const yc = await db.query('SELECT * FROM year_config WHERE year=$1', [year]);
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

// Tiny helper that re-runs each handler's data fetch in-process by reaching
// into our own request handlers. We re-implement the same SELECT here to
// avoid the request-cycle dance.
async function internal(kind, year) {
    if (kind === 'subscriptions') {
        const { rows } = await db.query(`
            SELECT p.status, s.*  FROM project_subscriptions s
              JOIN projects p ON p.id = s.project_id
             WHERE p.status <> 'Loss'`);
        return { rows: rows.map(r => ({ ...recognizeSubscription(r, year), status: r.status })) };
    }
    if (kind === 'perpetual-ma') {
        const { rows } = await db.query(`
            SELECT p.status, m.*  FROM project_perpetual_ma m
              JOIN projects p ON p.id = m.project_id
             WHERE p.status <> 'Loss'`);
        return { rows: rows.map(r => ({ ...recognizePerpetualMA(r, year), status: r.status })) };
    }
    if (kind === 'service-ma') {
        const { rows } = await db.query(`
            SELECT p.status, s.*  FROM project_service_ma s
              JOIN projects p ON p.id = s.project_id
             WHERE p.status <> 'Loss'`);
        return { rows: rows.map(r => ({ ...recognizeServiceMA(r, year), status: r.status })) };
    }
    if (kind === 'implementation') {
        const { rows } = await db.query(`
            SELECT p.status, i.*  FROM project_implementation i
              JOIN projects p ON p.id = i.project_id
             WHERE p.status <> 'Loss'`);
        return { rows: rows.map(r => ({ ...recognizeImplementation(r, year), status: r.status })) };
    }
    if (kind === 'outsource') {
        const { rows: o } = await db.query(`
            SELECT p.status, o.*  FROM project_outsource o
              JOIN projects p ON p.id = o.project_id
             WHERE p.status <> 'Loss'`);
        const { rows: m } = await db.query(`
            SELECT project_outsource_id, COALESCE(SUM(revenue),0)::numeric AS rev,
                                          COALESCE(SUM(cost),0)::numeric    AS cst
              FROM project_outsource_monthly WHERE year=$1 GROUP BY project_outsource_id`, [year]);
        const map = new Map(m.map(x => [x.project_outsource_id, x]));
        return { rows: o.map(r => {
            const isMM = r.outsource_type === 'Man-Month';
            const sum = map.get(r.id);
            const revenue = isMM ? Number(sum?.rev || 0) : Number(r.revenue || 0);
            const cost    = isMM ? Number(sum?.cst || 0) : Number(r.cost    || 0);
            return { ...recognizeOutsource({ ...r, revenue, cost }, year), status: r.status };
        }) };
    }
    return { rows: [] };
}

module.exports = router;
