const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireTenant } = require('../middleware/auth');
const { parseLicensePdf } = require('../utils/parseLicensePdf');

const router = express.Router();

/**
 * License Management routes (CR#4 + CR#5 + CR#7). All tenant-scoped:
 * customer_licenses.tenant_id must match the caller's tenant.
 */
router.use(requireAuth, requireTenant);

// ---------- Helpers ----------
function pickThresholdDays(rawValue, fallback = 30) {
    const n = Number(rawValue);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.floor(n);
}

// app_config is GLOBAL (platform-wide) in Phase 1.
async function getThresholdDays() {
    const r = await db.query(
        "SELECT value FROM app_config WHERE key='license_expiring_days' LIMIT 1"
    );
    return pickThresholdDays(r.rows[0]?.value);
}

/** True if customerId belongs to tenantId. */
async function customerInTenant(customerId, tenantId) {
    const r = await db.query(
        'SELECT 1 FROM customers WHERE id=$1 AND tenant_id=$2', [customerId, tenantId]
    );
    return r.rowCount > 0;
}

// ---------- Aggregation endpoint for the License Dashboard ----------
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
                  AND l.expired_date <= CURRENT_DATE + ($2::int)
            )::int AS expiring_soon_count
        FROM customers c
        JOIN customer_licenses l ON l.customer_id = c.id
        WHERE c.tenant_id = $1
        GROUP BY c.id
        ORDER BY c.alias
    `, [req.tenantId, thresholdDays]);

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

// ---------- Drill-in: customer + their licenses ----------
router.get('/customer/:customerId',
    param('customerId').isInt(),
    async (req, res) => {
        const { rows: cRows } = await db.query(
            'SELECT * FROM customers WHERE id=$1 AND tenant_id=$2',
            [req.params.customerId, req.tenantId]
        );
        const customer = cRows[0];
        if (!customer) return res.status(404).json({ error: 'Customer not found' });

        const { rows: lRows } = await db.query(
            `SELECT * FROM customer_licenses
              WHERE customer_id=$1 AND tenant_id=$2
              ORDER BY expired_date ASC NULLS LAST, license_name ASC, id ASC`,
            [req.params.customerId, req.tenantId]
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

// ---------- CR#5: Parse a License Certificate PDF ----------
router.post('/parse-pdf',
    body('file_base64').isString().isLength({ min: 100 })
        .withMessage('file_base64 (PDF bytes, base64-encoded) is required'),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ error: errs.array()[0].msg });

        let raw = String(req.body.file_base64);
        const commaIdx = raw.indexOf(',');
        if (raw.startsWith('data:') && commaIdx > 0) raw = raw.slice(commaIdx + 1);

        let buffer;
        try {
            buffer = Buffer.from(raw, 'base64');
        } catch {
            return res.status(400).json({ error: 'Invalid base64 payload' });
        }
        if (buffer.length < 5 || buffer.slice(0, 5).toString('latin1') !== '%PDF-') {
            return res.status(400).json({ error: 'Payload does not look like a PDF (missing %PDF- header)' });
        }

        try {
            const result = await parseLicensePdf(buffer);
            res.json(result);
        } catch (err) {
            console.error('[licenses/parse-pdf]', err);
            res.status(500).json({ error: 'Failed to parse PDF: ' + (err.message || 'unknown error') });
        }
    }
);

// ---------- CR#5: Bulk insert (used by Import PDF) ----------
router.post('/bulk',
    body('customer_id').isInt(),
    body('licenses').isArray({ min: 1 }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

        const customerId = Number(req.body.customer_id);
        const rowsIn     = req.body.licenses;

        if (!await customerInTenant(customerId, req.tenantId)) {
            return res.status(400).json({ error: 'Customer not found in your team' });
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const inserted = [];
            for (const r of rowsIn) {
                const { rows } = await client.query(
                    `INSERT INTO customer_licenses(tenant_id, customer_id, license_name, vendor, quantity,
                                                   license_key, note, start_date, expired_date)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
                    [req.tenantId, customerId,
                     r.license_name || '', r.vendor || '',
                     r.quantity != null ? Number(r.quantity) : 1,
                     r.license_key || '', r.note || '',
                     r.start_date   || null, r.expired_date || null]
                );
                inserted.push(rows[0]);
            }
            await client.query('COMMIT');
            res.status(201).json({ inserted: inserted.length, rows: inserted });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('[licenses/bulk]', err);
            res.status(500).json({ error: 'Bulk insert failed: ' + (err.message || 'unknown error') });
        } finally {
            client.release();
        }
    }
);

// ---------- CR#7: Extend many licenses at once (atomic) ----------
router.post('/extend-bulk',
    body('customer_id').isInt(),
    body('items').isArray({ min: 1 }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

        const customerId = Number(req.body.customer_id);
        const items      = req.body.items;
        const dateRe     = /^\d{4}-\d{2}-\d{2}$/;

        for (const it of items) {
            if (!Number.isInteger(it?.id) || it.id <= 0) {
                return res.status(400).json({ error: 'Each item needs a positive integer id' });
            }
            if (it.start_date != null && it.start_date !== '' && !dateRe.test(it.start_date)) {
                return res.status(400).json({ error: `Bad start_date for license ${it.id}` });
            }
            if (it.expired_date != null && it.expired_date !== '' && !dateRe.test(it.expired_date)) {
                return res.status(400).json({ error: `Bad expired_date for license ${it.id}` });
            }
        }

        if (!await customerInTenant(customerId, req.tenantId)) {
            return res.status(400).json({ error: 'Customer not found in your team' });
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const updated = [];
            for (const it of items) {
                // tenant_id + customer_id in the WHERE clause keep the update
                // strictly inside the caller's tenant.
                const { rows } = await client.query(
                    `UPDATE customer_licenses
                        SET start_date=$1, expired_date=$2
                      WHERE id=$3 AND customer_id=$4 AND tenant_id=$5
                      RETURNING *`,
                    [it.start_date || null, it.expired_date || null,
                     it.id, customerId, req.tenantId]
                );
                if (rows[0]) updated.push(rows[0]);
            }
            await client.query('COMMIT');
            res.json({ updated: updated.length, rows: updated });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('[licenses/extend-bulk]', err);
            res.status(500).json({ error: 'Extend failed: ' + (err.message || 'unknown error') });
        } finally {
            client.release();
        }
    }
);

// ---------- Plain list (CRUD support) ----------
router.get('/',
    query('customer_id').optional().isInt(),
    async (req, res) => {
        const cid = req.query.customer_id ? Number(req.query.customer_id) : null;
        const sql = cid
            ? `SELECT l.*, c.alias AS customer_alias
                 FROM customer_licenses l
                 JOIN customers c ON c.id = l.customer_id
                WHERE l.tenant_id=$1 AND l.customer_id=$2
                ORDER BY l.expired_date ASC NULLS LAST, l.license_name ASC, l.id ASC`
            : `SELECT l.*, c.alias AS customer_alias
                 FROM customer_licenses l
                 JOIN customers c ON c.id = l.customer_id
                WHERE l.tenant_id=$1
                ORDER BY c.alias ASC, l.expired_date ASC NULLS LAST, l.id ASC`;
        const { rows } = cid
            ? await db.query(sql, [req.tenantId, cid])
            : await db.query(sql, [req.tenantId]);
        res.json(rows);
    }
);

router.get('/:id', param('id').isInt(), async (req, res) => {
    const { rows } = await db.query(
        `SELECT l.*, c.alias AS customer_alias
           FROM customer_licenses l
           JOIN customers c ON c.id = l.customer_id
          WHERE l.id=$1 AND l.tenant_id=$2`,
        [req.params.id, req.tenantId]
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
    if (!await customerInTenant(Number(b.customer_id), req.tenantId)) {
        return res.status(400).json({ error: 'Customer not found in your team' });
    }
    const { rows } = await db.query(
        `INSERT INTO customer_licenses(tenant_id, customer_id, license_name, vendor, quantity,
                                       license_key, note, start_date, expired_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [req.tenantId, b.customer_id, b.license_name || '', b.vendor || '',
         b.quantity != null ? Number(b.quantity) : 1,
         b.license_key || '', b.note || '',
         b.start_date || null, b.expired_date || null]
    );
    res.status(201).json(rows[0]);
});

router.put('/:id', param('id').isInt(), licenseValidators, async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const b = req.body;
    if (!await customerInTenant(Number(b.customer_id), req.tenantId)) {
        return res.status(400).json({ error: 'Customer not found in your team' });
    }
    const { rows } = await db.query(
        `UPDATE customer_licenses
            SET customer_id=$1, license_name=$2, vendor=$3, quantity=$4,
                license_key=$5, note=$6, start_date=$7, expired_date=$8
          WHERE id=$9 AND tenant_id=$10 RETURNING *`,
        [b.customer_id, b.license_name || '', b.vendor || '',
         b.quantity != null ? Number(b.quantity) : 1,
         b.license_key || '', b.note || '',
         b.start_date || null, b.expired_date || null,
         req.params.id, req.tenantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});

router.delete('/:id', param('id').isInt(), async (req, res) => {
    const { rowCount } = await db.query(
        'DELETE FROM customer_licenses WHERE id=$1 AND tenant_id=$2',
        [req.params.id, req.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

module.exports = router;
