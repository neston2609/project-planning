const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireTenant } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireTenant);

const DEFAULT_EXPIRY_DAYS = 30;
const EXPIRING_SOON_DAYS = 7;
const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];

function cleanContent(value) {
    return String(value || '').trim().slice(0, 500);
}

function cleanColor(value) {
    const color = String(value || '').trim().toLowerCase();
    return COLORS.includes(color) ? color : 'yellow';
}

async function expiryDays(tenantId, client = db) {
    const { rows } = await client.query(
        "SELECT value FROM tenant_config WHERE tenant_id=$1 AND key='post_it_expiry_days'",
        [tenantId]
    );
    const n = Number(rows[0]?.value || DEFAULT_EXPIRY_DAYS);
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_EXPIRY_DAYS;
}

function mapNote(row, userId) {
    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilExpiry = expiresAt
        ? Math.ceil((expiresAt.getTime() - today.getTime()) / 86400000)
        : null;
    return {
        id: row.id,
        content: row.content,
        color: row.color,
        expires_at: row.expires_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        is_mine: Number(row.user_id) === Number(userId),
        days_until_expiry: daysUntilExpiry
    };
}

router.get('/', async (req, res) => {
    const [days, notes] = await Promise.all([
        expiryDays(req.tenantId),
        db.query(
            `SELECT id, user_id, content, color, expires_at, created_at, updated_at
               FROM post_it_notes
              WHERE tenant_id=$1
                AND expires_at >= CURRENT_DATE
              ORDER BY created_at ASC, id ASC`,
            [req.tenantId]
        )
    ]);
    res.json({
        config: {
            expiry_days: days,
            expiring_soon_days: EXPIRING_SOON_DAYS
        },
        notes: notes.rows.map(row => mapNote(row, req.user.uid))
    });
});

router.get('/mine/expiring', async (req, res) => {
    const { rows } = await db.query(
        `SELECT id, user_id, content, color, expires_at, created_at, updated_at
           FROM post_it_notes
          WHERE tenant_id=$1
            AND user_id=$2
            AND expires_at >= CURRENT_DATE
            AND expires_at < CURRENT_DATE + ($3::int * INTERVAL '1 day')
          ORDER BY expires_at ASC, id ASC`,
        [req.tenantId, req.user.uid, EXPIRING_SOON_DAYS + 1]
    );
    res.json(rows.map(row => mapNote(row, req.user.uid)));
});

router.post('/',
    body('content').isString().trim().notEmpty().isLength({ max: 500 }),
    body('color').optional().isString(),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ error: 'Message is required and must be 500 characters or fewer' });

        const days = await expiryDays(req.tenantId);
        const { rows } = await db.query(
            `INSERT INTO post_it_notes(tenant_id, user_id, content, color, expires_at)
             VALUES ($1,$2,$3,$4,CURRENT_DATE + ($5::int * INTERVAL '1 day'))
             RETURNING id, user_id, content, color, expires_at, created_at, updated_at`,
            [req.tenantId, req.user.uid, cleanContent(req.body.content), cleanColor(req.body.color), days]
        );
        res.status(201).json(mapNote(rows[0], req.user.uid));
    }
);

router.post('/:id/extend',
    param('id').isInt(),
    async (req, res) => {
        const days = await expiryDays(req.tenantId);
        const { rows } = await db.query(
            `UPDATE post_it_notes
                SET expires_at=CURRENT_DATE + ($1::int * INTERVAL '1 day'),
                    updated_at=NOW()
              WHERE id=$2 AND tenant_id=$3 AND user_id=$4
              RETURNING id, user_id, content, color, expires_at, created_at, updated_at`,
            [days, req.params.id, req.tenantId, req.user.uid]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Post-It not found' });
        res.json(mapNote(rows[0], req.user.uid));
    }
);

router.delete('/:id',
    param('id').isInt(),
    async (req, res) => {
        const { rowCount } = await db.query(
            `DELETE FROM post_it_notes
              WHERE id=$1 AND tenant_id=$2 AND user_id=$3`,
            [req.params.id, req.tenantId, req.user.uid]
        );
        if (!rowCount) return res.status(404).json({ error: 'Post-It not found' });
        res.json({ ok: true });
    }
);

module.exports = router;
