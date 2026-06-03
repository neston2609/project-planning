const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireRole, requireTenant } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireTenant);

function localDateISO(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function isISODate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const d = new Date(`${value}T00:00:00`);
    return !Number.isNaN(d.getTime()) && localDateISO(d) === value;
}

function monthBounds(month) {
    if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return null;
    const [year, monthIndex] = month.split('-').map(Number);
    const start = new Date(year, monthIndex - 1, 1);
    const end = new Date(year, monthIndex, 0);
    return { start: localDateISO(start), end: localDateISO(end) };
}

async function ensureConfig(tenantId, client = db) {
    await client.query(
        `INSERT INTO office_booking_config(tenant_id, max_bookings_per_day, extra_bookings_per_day)
         VALUES ($1,6,3)
         ON CONFLICT (tenant_id) DO NOTHING`,
        [tenantId]
    );
    const { rows } = await client.query(
        `SELECT tenant_id, max_bookings_per_day, extra_bookings_per_day
           FROM office_booking_config
          WHERE tenant_id=$1`,
        [tenantId]
    );
    return rows[0] || { tenant_id: tenantId, max_bookings_per_day: 6, extra_bookings_per_day: 3 };
}

const bookingSelect = `
    SELECT ob.id,
           ob.user_id,
           to_char(ob.booking_date, 'YYYY-MM-DD') AS booking_date,
           ob.is_extra,
           ob.reason,
           ob.created_at,
           u.username,
           u.full_name,
           u.email,
           r.id AS resource_id,
           r.emp_id,
           COALESCE(
             NULLIF(r.nick_name, ''),
             NULLIF(CONCAT_WS(' ', NULLIF(r.first_name, ''), NULLIF(r.last_name, '')), ''),
             NULLIF(u.full_name, ''),
             u.username
           ) AS display_name
      FROM office_bookings ob
      JOIN users u ON u.id = ob.user_id AND u.tenant_id = ob.tenant_id
      LEFT JOIN resources r ON r.user_id = u.id AND r.tenant_id = ob.tenant_id
`;

async function bookingsForDate(tenantId, date, client = db) {
    const { rows } = await client.query(
        `${bookingSelect}
          WHERE ob.tenant_id=$1 AND ob.booking_date=$2::date
          ORDER BY ob.is_extra, display_name, u.username`,
        [tenantId, date]
    );
    return rows;
}

function capacityForDate(bookings, config) {
    const normalCount = bookings.filter(b => !b.is_extra).length;
    const extraCount = bookings.filter(b => b.is_extra).length;
    return {
        normal_count: normalCount,
        extra_count: extraCount,
        normal_available: Math.max(0, Number(config.max_bookings_per_day) - normalCount),
        extra_available: Math.max(0, Number(config.extra_bookings_per_day) - extraCount),
        is_full: normalCount >= Number(config.max_bookings_per_day),
        is_extra_full: extraCount >= Number(config.extra_bookings_per_day)
    };
}

router.get('/',
    query('start').custom(isISODate),
    query('end').custom(isISODate),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        if (req.query.end < req.query.start) return res.status(400).json({ error: 'Invalid date range' });

        const config = await ensureConfig(req.tenantId);
        const { rows } = await db.query(
            `${bookingSelect}
              WHERE ob.tenant_id=$1
                AND ob.booking_date BETWEEN $2::date AND $3::date
              ORDER BY ob.booking_date, ob.is_extra, display_name, u.username`,
            [req.tenantId, req.query.start, req.query.end]
        );
        res.json({ config, today: localDateISO(), bookings: rows });
    }
);

router.get('/summary',
    query('month').custom(value => !!monthBounds(value)),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const bounds = monthBounds(req.query.month);
        const { rows } = await db.query(
            `${bookingSelect}
              WHERE ob.tenant_id=$1
                AND ob.booking_date BETWEEN $2::date AND $3::date
              ORDER BY display_name, ob.booking_date`,
            [req.tenantId, bounds.start, bounds.end]
        );

        const people = new Map();
        for (const row of rows) {
            const key = row.resource_id ? `r:${row.resource_id}` : `u:${row.user_id}`;
            if (!people.has(key)) {
                people.set(key, {
                    key,
                    user_id: row.user_id,
                    resource_id: row.resource_id,
                    display_name: row.display_name,
                    username: row.username,
                    emp_id: row.emp_id,
                    days: [],
                    total_days: 0,
                    extra_days: 0
                });
            }
            const person = people.get(key);
            person.days.push({
                booking_id: row.id,
                booking_date: row.booking_date,
                is_extra: row.is_extra,
                reason: row.reason
            });
            person.total_days += 1;
            if (row.is_extra) person.extra_days += 1;
        }

        res.json({ month: req.query.month, start: bounds.start, end: bounds.end, people: [...people.values()] });
    }
);

router.get('/config', requireRole('admin', 'superadmin'), async (req, res) => {
    res.json(await ensureConfig(req.tenantId));
});

router.put('/config',
    requireRole('admin', 'superadmin'),
    body('max_bookings_per_day').isInt({ min: 0, max: 500 }),
    body('extra_bookings_per_day').isInt({ min: 0, max: 500 }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const maxBookings = Number(req.body.max_bookings_per_day);
        const extraBookings = Number(req.body.extra_bookings_per_day);
        const { rows } = await db.query(
            `INSERT INTO office_booking_config(tenant_id, max_bookings_per_day, extra_bookings_per_day)
             VALUES ($1,$2,$3)
             ON CONFLICT (tenant_id) DO UPDATE
                SET max_bookings_per_day=EXCLUDED.max_bookings_per_day,
                    extra_bookings_per_day=EXCLUDED.extra_bookings_per_day,
                    updated_at=NOW()
             RETURNING tenant_id, max_bookings_per_day, extra_bookings_per_day`,
            [req.tenantId, maxBookings, extraBookings]
        );
        res.json(rows[0]);
    }
);

router.post('/',
    body('booking_date').custom(isISODate),
    body('reason').optional({ nullable: true }).isString().isLength({ max: 2000 }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

        const bookingDate = req.body.booking_date;
        const today = localDateISO();
        if (bookingDate < today) return res.status(400).json({ error: 'Cannot book a past date' });

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const config = await ensureConfig(req.tenantId, client);
            await client.query(
                'SELECT pg_advisory_xact_lock($1, $2)',
                [req.tenantId, Number(bookingDate.replace(/-/g, ''))]
            );
            const existing = await client.query(
                `SELECT id FROM office_bookings
                  WHERE tenant_id=$1 AND user_id=$2 AND booking_date=$3::date`,
                [req.tenantId, req.user.uid, bookingDate]
            );
            if (existing.rows[0]) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'You already booked this date', code: 'ALREADY_BOOKED' });
            }

            const currentBookings = await bookingsForDate(req.tenantId, bookingDate, client);
            const capacity = capacityForDate(currentBookings, config);
            const reason = String(req.body.reason || '').trim();
            let isExtra = false;

            if (capacity.is_full) {
                if (!reason) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({
                        error: 'This date is fully booked',
                        code: 'FULL',
                        can_extra: capacity.extra_available > 0,
                        capacity,
                        bookings: currentBookings
                    });
                }
                if (capacity.is_extra_full) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({
                        error: 'This date is fully booked including extra bookings',
                        code: 'FULL',
                        can_extra: false,
                        capacity,
                        bookings: currentBookings
                    });
                }
                isExtra = true;
            }

            const { rows } = await client.query(
                `INSERT INTO office_bookings(tenant_id, user_id, booking_date, is_extra, reason)
                 VALUES ($1,$2,$3::date,$4,$5)
                 RETURNING id`,
                [req.tenantId, req.user.uid, bookingDate, isExtra, reason]
            );
            const created = await client.query(`${bookingSelect} WHERE ob.id=$1 AND ob.tenant_id=$2`, [rows[0].id, req.tenantId]);
            await client.query('COMMIT');
            res.status(201).json(created.rows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            if (err.code === '23505') return res.status(409).json({ error: 'You already booked this date', code: 'ALREADY_BOOKED' });
            throw err;
        } finally {
            client.release();
        }
    }
);

router.delete('/:id', param('id').isInt(), async (req, res) => {
    const { rows } = await db.query(
        `SELECT id, to_char(booking_date, 'YYYY-MM-DD') AS booking_date
           FROM office_bookings
          WHERE id=$1 AND tenant_id=$2 AND user_id=$3`,
        [req.params.id, req.tenantId, req.user.uid]
    );
    const booking = rows[0];
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.booking_date < localDateISO()) return res.status(400).json({ error: 'Cannot delete a past booking' });

    await db.query('DELETE FROM office_bookings WHERE id=$1 AND tenant_id=$2 AND user_id=$3', [req.params.id, req.tenantId, req.user.uid]);
    res.json({ ok: true });
});

module.exports = router;
