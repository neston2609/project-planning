const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * License Management routes (CR#4)
 *
 * - GET  /api/licenses                       List all (optional ?customer_id=N)
 * - GET  /api/licenses/dashboard             Aggregated per-customer summary for the dashboard
 *                                             (uses configurable threshold, default 30 days)
 * - GET  /api/licenses/customer/:customerId  Drill-in: customer details + their licenses
 * - GET  /api/licenses/:id                   Single license
 * - POST /api/licenses                       Create
 * - PUT  /api/licenses/:id                   Update
 * - DELETE /api/licenses/:id                 Delete
 *
 * All routes require auth. Following the pattern of customers.js / resources.js,
 * write operations are not further role-gated here; the frontend hides write
 * controls for the 'user' role.
 */

router.use(requireAuth);

// --- Helpers ---

function pickThresholdDays(rawValue, fallback = 30) {
    const n = Number(rawValue);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.floor(n);
}

async function getThresholdDays() {
    const r = await db.query(
        `SELECT value FROM app_config WHERE key='license_expiring_days' LIMIT 1`
    );
    return pickThresholdDays(r.rows[0]?.value);
}

// --- Aggregation endpoint for the License Dashboard ---
//
// Returns:
// {
//   threshold_days: 30,
//   today: 'YYYY-MM-DD',
//   customers: [
//     {
//       customer_id, alias, full_name, color_hex, logo_data, account_manager, contact_email, contact_phone,
//       total_licenses, latest_start_date, latest_expired_date,
//       expired_count, expiring_soon_count
//     }, ...
//   ],
//   totals: {
//     total_customers,
//     customers_with_expired,
//     customers_with_expiring_soon
//   }
// }
router.get('/dashboard', async (req, res) => {
    const overrideDays = req.query.days != null ? pickThresholdDays(req.query.days, null) : null;
    const thresholdDays = overrideDays ?? await getThresholdDays();

    const { rows } = await db.query(`
        SELECT
            c.id          AS customer_id,
            c.alias,
            c.full_name,
            c.color_hex,
            c.logo_data,
            c.account_manager,
            c.contact_email,
            c.contact_phone,
            COUNT(l.id)::int                                                             AS total_licenses,
            MAX(l.start_date)                                                             AS latest_start_date,
            MAX(l.expired_date)                                                           AS latest_expired_date,
            COUNT(*) FILTER (WHERE l.expired_date IS NOT NULL AND l.expired_date <  CURRENT_DATE)::int AS expired_count,
            COUNT(*) FILTER (
                WHERE l.expired_date IS NOT NULL
                  AND l.expired_date >= CURRENT_DATE
                  AND l.expired_date <= CURRENT_DATE + ($1::int)
            )::int AS expiring_soon_count
        FROM customers c
        JOIN customer_licenses l ON l.customer_id = c.id
        GROUP BY c.id
        ORDER BY c.alias
    `, [thresholdDays]);

    const customers = rows.map(r => ({
        customer_id: r.customer_id,
        alias: r.alias,
        full_name: r.full_name,
        color_hex: r.color_hex,
        logo_data: r.logo_data,
        account_manager: r.account_manager,
        contact_email: r.contact_email,
        contact_phone: r.contact_phone,
        total_licenses: Number(r.total_licenses),
        latest_start_date: r.latest_start_date,
        latest_expired_date: r.latest_expired_date,
        expired_count: Number(r.expired_count),
        expiring_soon_count: Number(r.expiring_soon_count)
    }));

    const totals = {
        total_customers: customers.length,
        customers_with_expired:       customers.filter(c => c.expired_count       > 0).length,
        customers_with_expiring_soon: customers.filter(c => c.expiring_soon_count > 0).length
    };

    res.json({
        threshold_days: thresholdDays,
        today: new Date().toISOString().slice(0, 10),
        customers,
        totals
    });
});

// --- Drill-in: customer + their licenses ---
router.get('/customer/:customerId',
    param('customerId').isInt(),
    async (req, res) => {
        const { rows: cRows } = await db.query(
            `SELECT * FROM customers WHERE id=$1`, [req.params.customerId]
        );
        const customer = cRows[0];
        if (!customer) return res.status(404).json({ error: 'Customer not found' });

        const { rows: lRows } = await db.query(
            `SELECT * FROM customer_licenses
              WHERE customer_id=$1
              ORDER BY expired_date ASC NULLS LAST, license_name ASC, id ASC`,
            [req.params.customerId]
        );

        const thresholdDays = await getThresholdDays();
        res.json({
            customer,
            licenses: lRows,
            threshold_days: thresholdDays,
            today: new Date().toISOString().slice(0, 10)
        });
    }
);

// --- Plain list (CRUD support) ---
router.get('/',
    query('customer_id').optional().isInt(),
    async (req, res) => {
        const cid = req.query.customer_id ? Number(req.query.customer_id) : null;
        const sql = cid
            ? `SELECT l.*, c.alias AS customer_alias
                 FROM customer_licenses l
                 JOIN customers c ON c.id = l.customer_id
                WHERE l.customer_id=$1
                ORDER BY l.expired_date ASC NULLS LAST, l.license_name ASC, l.id ASC`
            : `SELECT l.*, c.alias AS customer_alias
                 FROM customer_licenses l
                 JOIN customers c ON c.id = l.customer_id
                ORDER BY c.alias ASC, l.expired_date ASC NULLS LAST, l.id ASC`;
        const { rows } = cid
            ? await db.query(sql, [cid])
            : await db.query(sql);
        res.json(rows);
    }
);

router.get('/:id', param('id').isInt(), async (req, res) => {
    const { rows } = await db.query(
        `SELECT l.*, c.alias AS customer_alias
           FROM customer_licenses l
           JOIN customers c ON c.id = l.customer_id
          WHERE l.id=$1`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});

const licenseValidators = [
    body('customer_id').isInt().withMessage('customer_id required'),
    body('license_name').optional().isString(),
    body('vendor').optional().isString(),
    body('quantity').optional().isInt({ min: 0 }),
    body('license_key').optional().isString(),
    body('note').optional().isString(),
    body('start_date').optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}$/),
    body('expired_date').optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}$/)
];

router.post('/', licenseValidators, async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const b = req.body;
    try {
        const { rows } = await db.query(
            `INSERT INTO customer_licenses(customer_id, license_name, vendor, quantity,
                                           license_key, note, start_date, expired_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [b.customer_id, b.license_name || '', b.vendor || '',
             b.quantity != null ? Number(b.quantity) : 1,
             b.license_key || '', b.note || '',
             b.start_date || null, b.expired_date || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23503') return res.status(400).json({ error: 'Customer does not exist' });
        throw err;
    }
});

router.put('/:id', param('id').isInt(), licenseValidators, async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const b = req.body;
    const { rows } = await db.query(
        `UPDATE customer_licenses
            SET customer_id=$1, license_name=$2, vendor=$3, quantity=$4,
                license_key=$5, note=$6, start_date=$7, expired_date=$8
          WHERE id=$9 RETURNING *`,
        [b.customer_id, b.license_name || '', b.vendor || '',
         b.quantity != null ? Number(b.quantity) : 1,
         b.license_key || '', b.note || '',
         b.start_date || null, b.expired_date || null,
         req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});

router.delete('/:id', param('id').isInt(), async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM customer_licenses WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

module.exports = router;
