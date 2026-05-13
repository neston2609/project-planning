const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
// Every endpoint requires a logged-in user (user / admin / superadmin).
router.use(requireAuth);

// ---------- helpers ----------
async function getExpiringThreshold() {
    const { rows } = await db.query(
        "SELECT value FROM app_config WHERE key='license_expiring_days'"
    );
    const n = Number(rows[0]?.value);
    return Number.isInteger(n) && n >= 0 ? n : 30;
}

const licenseValidators = [
    body('customer_id').isInt({ min: 1 }),
    body('license_name').optional().isString(),
    body('vendor').optional().isString(),
    body('quantity').optional().isInt({ min: 0 }),
    body('license_key').optional().isString(),
    body('note').optional().isString(),
    body('start_date').optional({ nullable: true }).isISO8601(),
    body('expired_date').optional({ nullable: true }).isISO8601()
];

// ---------- License Dashboard data ----------
// Returns one row per customer (only customers that have at least one license)
// plus a `widgets` object with the three top-line counts.
router.get('/dashboard', async (req, res) => {
    const N = await getExpiringThreshold();
    const { rows } = await db.query(`
        SELECT
            c.id            AS customer_id,
            c.alias,
            c.full_name,
            c.logo_data,
            c.color_hex,
            c.account_manager,
            COUNT(l.id)::int                                                      AS total_licenses,
            MAX(l.start_date)                                                     AS latest_start,
            MAX(l.expired_date)                                                   AS latest_expired,
            (COUNT(*) FILTER (WHERE l.expired_date IS NOT NULL
                                AND l.expired_date < CURRENT_DATE))::int          AS expired_count,
            (COUNT(*) FILTER (WHERE l.expired_date IS NOT NULL
                                AND l.expired_date >= CURRENT_DATE
                                AND l.expired_date <= CURRENT_DATE + ($1 || ' days')::INTERVAL))::int
                                                                                   AS expiring_soon_count
          FROM customers c
          JOIN customer_licenses l ON l.customer_id = c.id
         GROUP BY c.id, c.alias, c.full_name, c.logo_data, c.color_hex, c.account_manager
         ORDER BY c.alias
    `, [String(N)]);

    const widgets = {
        total_customers:           rows.length,
        customers_expired:         rows.filter(r => r.expired_count > 0).length,
        customers_expiring_soon:   rows.filter(r => r.expiring_soon_count > 0).length
    };

    res.json({ threshold_days: N, widgets, rows });
});

// ---------- Per-customer license detail (drill-down) ----------
router.get('/by-customer/:customerId', param('customerId').isInt(), async (req, res) => {
    const cid = Number(req.params.customerId);
    const N = await getExpiringThreshold();

    const cust = await db.query(
        `SELECT id, alias, full_name, account_manager, contact_name, contact_email,
                contact_phone, color_hex, logo_data
           FROM customers WHERE id=$1`,
        [cid]
    );
    if (!cust.rows[0]) return res.status(404).json({ error: 'Customer not found' });

    const { rows: licenses } = await db.query(
        `SELECT l.*,
                CASE
                    WHEN l.expired_date IS NULL THEN 'unknown'
                    WHEN l.expired_date < CURRENT_DATE THEN 'expired'
                    WHEN l.expired_date <= CURRENT_DATE + ($2 || ' days')::INTERVAL THEN 'expiring_soon'
                    ELSE 'ok'
                END AS status
           FROM customer_licenses l
          WHERE l.customer_id=$1
          ORDER BY
              CASE
                  WHEN l.expired_date IS NULL THEN 9
                  WHEN l.expired_date < CURRENT_DATE THEN 0
                  WHEN l.expired_date <= CURRENT_DATE + ($2 || ' days')::INTERVAL THEN 1
                  ELSE 2
              END,
              l.expired_date NULLS LAST,
              l.license_name`,
        [cid, String(N)]
    );

    res.json({ customer: cust.rows[0], threshold_days: N, licenses });
});

// ---------- Admin: list / CRUD ----------
// Admin pages use this to manage licenses.

// List all licenses, optionally filtered by customer_id.
router.get('/', async (req, res) => {
    const cid = req.query.customer_id ? Number(req.query.customer_id) : null;
    let q, args;
    if (cid) {
        q = `SELECT l.*, c.alias AS customer_alias
               FROM customer_licenses l
               JOIN customers c ON c.id = l.customer_id
              WHERE l.customer_id = $1
              ORDER BY l.license_name, l.id`;
        args = [cid];
    } else {
        q = `SELECT l.*, c.alias AS customer_alias
               FROM customer_licenses l
               JOIN customers c ON c.id = l.customer_id
              ORDER BY c.alias, l.license_name, l.id`;
        args = [];
    }
    const { rows } = await db.query(q, args);
    res.json(rows);
});

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

router.post('/', licenseValidators, async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const b = req.body;
    try {
        const { rows } = await db.query(
            `INSERT INTO customer_licenses
                (customer_id, license_name, vendor, quantity, license_key, note,
                 start_date, expired_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [b.customer_id, b.license_name || '', b.vendor || '',
             b.quantity == null ? 1 : Number(b.quantity),
             b.license_key || '', b.note || '',
             b.start_date || null, b.expired_date || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23503') return res.status(400).json({ error: 'Customer not found' });
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
         b.quantity == null ? 1 : Number(b.quantity),
         b.license_key || '', b.note || '',
         b.start_date || null, b.expired_date || null,
         req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});

router.delete('/:id', param('id').isInt(), async (req, res) => {
    const { rowCount } = await db.query(
        'DELETE FROM customer_licenses WHERE id=$1', [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

module.exports = router;
