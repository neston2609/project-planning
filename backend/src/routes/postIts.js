const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireTenant } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireTenant);

const DEFAULT_EXPIRY_DAYS = 30;
const DEFAULT_BOARD_SIZE = 40;
const EXPIRING_SOON_DAYS = 7;
const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange', 'mint', 'lavender', 'peach', 'cream', 'gray', 'teal', 'indigo', 'coral'];
const FONT_COLORS = ['slate', 'blue', 'red', 'green', 'purple', 'brown', 'navy', 'cyan', 'orange', 'pink', 'gray'];
const FONT_SIZES = ['sm', 'md', 'lg', 'xl'];

function stripHtml(value) {
    return String(value || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function cleanContent(value) {
    return String(value || '')
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/\son\w+="[^"]*"/gi, '')
        .replace(/\son\w+='[^']*'/gi, '')
        .replace(/javascript:/gi, '')
        .trim()
        .slice(0, 4000);
}

function cleanReply(value) {
    return String(value || '').trim().slice(0, 1000);
}

function cleanColor(value) {
    const color = String(value || '').trim().toLowerCase();
    return COLORS.includes(color) ? color : 'yellow';
}

function cleanFontColor(value) {
    const color = String(value || '').trim().toLowerCase();
    return FONT_COLORS.includes(color) ? color : 'slate';
}

function cleanFontSize(value) {
    const size = String(value || '').trim().toLowerCase();
    return FONT_SIZES.includes(size) ? size : 'md';
}

async function expiryDays(tenantId, client = db) {
    const { rows } = await client.query(
        "SELECT value FROM tenant_config WHERE tenant_id=$1 AND key='post_it_expiry_days'",
        [tenantId]
    );
    const n = Number(rows[0]?.value || DEFAULT_EXPIRY_DAYS);
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_EXPIRY_DAYS;
}

async function boardSize(tenantId, client = db) {
    const { rows } = await client.query(
        "SELECT value FROM tenant_config WHERE tenant_id=$1 AND key='post_it_board_size'",
        [tenantId]
    );
    const n = Number(rows[0]?.value || DEFAULT_BOARD_SIZE);
    return Number.isInteger(n) && n >= 1 && n <= 100 ? n : DEFAULT_BOARD_SIZE;
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
        font_color: row.font_color || 'slate',
        font_size: row.font_size || 'md',
        expires_at: row.expires_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        is_mine: Number(row.user_id) === Number(userId),
        reply_count: Number(row.reply_count || 0),
        days_until_expiry: daysUntilExpiry
    };
}

function mapReply(row) {
    return {
        id: row.id,
        content: row.content,
        created_at: row.created_at
    };
}

router.get('/', async (req, res) => {
    const [days, size, notes] = await Promise.all([
        expiryDays(req.tenantId),
        boardSize(req.tenantId),
        db.query(
            `SELECT n.id, n.user_id, n.content, n.color, n.font_color, n.font_size,
                    n.expires_at, n.created_at, n.updated_at,
                    COUNT(r.id)::int AS reply_count
               FROM post_it_notes n
               LEFT JOIN post_it_replies r
                 ON r.note_id=n.id AND r.tenant_id=n.tenant_id
              WHERE n.tenant_id=$1
                AND n.expires_at >= CURRENT_DATE
              GROUP BY n.id
              ORDER BY n.created_at ASC, n.id ASC`,
            [req.tenantId]
        )
    ]);
    res.json({
        config: {
            expiry_days: days,
            board_size: size,
            expiring_soon_days: EXPIRING_SOON_DAYS
        },
        notes: notes.rows.map(row => mapNote(row, req.user.uid))
    });
});

router.get('/mine/expiring', async (req, res) => {
    const { rows } = await db.query(
        `SELECT id, user_id, content, color, font_color, font_size, expires_at, created_at, updated_at
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
    body('content').isString().trim().notEmpty().isLength({ max: 4000 }),
    body('color').optional().isString(),
    body('font_color').optional().isString(),
    body('font_size').optional().isString(),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ error: 'Message is required and must be 4000 characters or fewer' });
        const content = cleanContent(req.body.content);
        if (!stripHtml(content)) return res.status(400).json({ error: 'Message is required' });

        const days = await expiryDays(req.tenantId);
        const { rows } = await db.query(
            `INSERT INTO post_it_notes(tenant_id, user_id, content, color, font_color, font_size, expires_at)
             VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE + ($7::int * INTERVAL '1 day'))
             RETURNING id, user_id, content, color, font_color, font_size, expires_at, created_at, updated_at`,
            [
                req.tenantId,
                req.user.uid,
                content,
                cleanColor(req.body.color),
                cleanFontColor(req.body.font_color),
                cleanFontSize(req.body.font_size),
                days
            ]
        );
        res.status(201).json(mapNote(rows[0], req.user.uid));
    }
);

router.get('/:id/replies',
    param('id').isInt(),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ error: 'Invalid Post-It' });

        const noteResult = await db.query(
            `SELECT n.id, n.user_id, n.content, n.color, n.font_color, n.font_size,
                    n.expires_at, n.created_at, n.updated_at,
                    COUNT(r.id)::int AS reply_count
               FROM post_it_notes n
               LEFT JOIN post_it_replies r
                 ON r.note_id=n.id AND r.tenant_id=n.tenant_id
              WHERE n.id=$1
                AND n.tenant_id=$2
                AND n.expires_at >= CURRENT_DATE
              GROUP BY n.id`,
            [req.params.id, req.tenantId]
        );
        if (!noteResult.rows[0]) return res.status(404).json({ error: 'Post-It not found' });

        const replies = await db.query(
            `SELECT id, content, created_at
               FROM post_it_replies
              WHERE tenant_id=$1
                AND note_id=$2
              ORDER BY created_at ASC, id ASC`,
            [req.tenantId, req.params.id]
        );

        res.json({
            note: mapNote(noteResult.rows[0], req.user.uid),
            replies: replies.rows.map(mapReply)
        });
    }
);

router.post('/:id/replies',
    param('id').isInt(),
    body('content').isString().trim().notEmpty().isLength({ max: 1000 }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ error: 'Reply is required and must be 1000 characters or fewer' });
        const content = cleanReply(req.body.content);
        if (!content) return res.status(400).json({ error: 'Reply is required' });

        const note = await db.query(
            `SELECT id
               FROM post_it_notes
              WHERE id=$1
                AND tenant_id=$2
                AND expires_at >= CURRENT_DATE`,
            [req.params.id, req.tenantId]
        );
        if (!note.rows[0]) return res.status(404).json({ error: 'Post-It not found' });

        const { rows } = await db.query(
            `INSERT INTO post_it_replies(tenant_id, note_id, user_id, content)
             VALUES ($1,$2,$3,$4)
             RETURNING id, content, created_at`,
            [req.tenantId, req.params.id, req.user.uid, content]
        );
        res.status(201).json(mapReply(rows[0]));
    }
);

router.put('/:id',
    param('id').isInt(),
    body('content').isString().trim().notEmpty().isLength({ max: 4000 }),
    body('color').optional().isString(),
    body('font_color').optional().isString(),
    body('font_size').optional().isString(),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ error: 'Message is required and must be 4000 characters or fewer' });
        const content = cleanContent(req.body.content);
        if (!stripHtml(content)) return res.status(400).json({ error: 'Message is required' });

        const { rows } = await db.query(
            `UPDATE post_it_notes
                SET content=$1,
                    color=$2,
                    font_color=$3,
                    font_size=$4,
                    updated_at=NOW()
              WHERE id=$5 AND tenant_id=$6 AND user_id=$7
              RETURNING id, user_id, content, color, font_color, font_size, expires_at, created_at, updated_at`,
            [
                content,
                cleanColor(req.body.color),
                cleanFontColor(req.body.font_color),
                cleanFontSize(req.body.font_size),
                req.params.id,
                req.tenantId,
                req.user.uid
            ]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Post-It not found' });
        res.json(mapNote(rows[0], req.user.uid));
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
              RETURNING id, user_id, content, color, font_color, font_size, expires_at, created_at, updated_at`,
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
