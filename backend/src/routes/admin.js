const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ---------- Users (Superadmin only) ----------
router.get('/users', requireRole('superadmin'), async (_req, res) => {
    const { rows } = await db.query(
        `SELECT id, username, full_name, email, phone_number, role,
                must_change_password, created_at FROM users ORDER BY username`
    );
    res.json(rows);
});

router.post('/users', requireRole('superadmin'),
    body('username').isString().isLength({ min: 1, max: 64 }),
    body('password').isString().isLength({ min: 8 }),
    body('role').isIn(['user','admin','superadmin']),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const { username, password, full_name, email, phone_number, role } = req.body;
        try {
            const hash = await bcrypt.hash(password, 10);
            const { rows } = await db.query(
                `INSERT INTO users(username, password_hash, full_name, email, phone_number, role)
                 VALUES ($1,$2,$3,$4,$5,$6)
                 RETURNING id, username, full_name, email, phone_number, role`,
                [username, hash, full_name || '', email || '', phone_number || '', role]
            );
            res.status(201).json(rows[0]);
        } catch (err) {
            if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
            throw err;
        }
    }
);

router.put('/users/:id', requireRole('superadmin'), param('id').isInt(), async (req, res) => {
    const { full_name, email, phone_number, role, password } = req.body;
    let q, args;
    if (password) {
        const hash = await bcrypt.hash(password, 10);
        q = `UPDATE users SET full_name=$1, email=$2, phone_number=$3, role=COALESCE($4, role),
                              password_hash=$5 WHERE id=$6
             RETURNING id, username, full_name, email, phone_number, role`;
        args = [full_name || '', email || '', phone_number || '', role || null, hash, req.params.id];
    } else {
        q = `UPDATE users SET full_name=$1, email=$2, phone_number=$3, role=COALESCE($4, role)
             WHERE id=$5 RETURNING id, username, full_name, email, phone_number, role`;
        args = [full_name || '', email || '', phone_number || '', role || null, req.params.id];
    }
    const { rows } = await db.query(q, args);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});

router.delete('/users/:id', requireRole('superadmin'), param('id').isInt(), async (req, res) => {
    if (Number(req.params.id) === req.user.uid) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    const { rowCount } = await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

router.get('/login-logs', requireRole('superadmin'), async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const { rows } = await db.query(
        `SELECT * FROM login_logs ORDER BY login_at DESC LIMIT $1`, [limit]
    );
    res.json(rows);
});

// ---------- Year config ----------
router.get('/year-config', async (_req, res) => {
    const { rows } = await db.query('SELECT * FROM year_config ORDER BY year DESC');
    res.json(rows);
});

router.put('/year-config/:year', param('year').isInt(),
    body('headcount').isInt({ min: 0 }),
    body('revenue_per_headcount').isFloat({ min: 0 }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const { rows } = await db.query(
            `INSERT INTO year_config(year, headcount, revenue_per_headcount)
             VALUES ($1,$2,$3)
             ON CONFLICT (year) DO UPDATE
               SET headcount=EXCLUDED.headcount,
                   revenue_per_headcount=EXCLUDED.revenue_per_headcount,
                   updated_at=NOW()
             RETURNING *`,
            [req.params.year, req.body.headcount, req.body.revenue_per_headcount]
        );
        res.json(rows[0]);
    }
);

// ---------- App config (default year + arbitrary KV) ----------
router.get('/app-config', async (_req, res) => {
    const { rows } = await db.query('SELECT * FROM app_config');
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

router.put('/app-config/:key', param('key').isString(), async (req, res) => {
    const { rows } = await db.query(
        `INSERT INTO app_config(key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
         RETURNING *`,
        [req.params.key, String(req.body.value ?? '')]
    );
    res.json(rows[0]);
});

// ---------- SMTP config ----------
router.get('/smtp', async (_req, res) => {
    const { rows } = await db.query('SELECT * FROM smtp_config WHERE id=1');
    if (!rows[0]) return res.json({});
    const r = rows[0];
    // Hide password from responses
    res.json({ ...r, password: r.password ? '********' : '' });
});

router.post('/smtp/test',
    body('recipient').isEmail().withMessage('Valid recipient email required'),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ error: errs.array()[0].msg });

        const { rows } = await db.query('SELECT * FROM smtp_config WHERE id=1');
        const cfg = rows[0];
        if (!cfg || !cfg.host) {
            return res.status(400).json({ error: 'SMTP not configured. Please save settings first.' });
        }
        if (!cfg.username || !cfg.password) {
            return res.status(400).json({ error: 'SMTP username/password missing. Save credentials first.' });
        }

        try {
            const transporter = nodemailer.createTransport({
                host: cfg.host,
                port: Number(cfg.port) || 587,
                secure: !!cfg.secure,
                auth: { user: cfg.username, pass: cfg.password }
            });

            // verify() catches connection / auth issues before send
            await transporter.verify();

            const info = await transporter.sendMail({
                from: `"${cfg.from_name || 'RPA Planning'}" <${cfg.from_email || cfg.username}>`,
                to: req.body.recipient,
                subject: 'RPA Planning · SMTP test',
                text:
`Hello,

This is a test email sent from RPA Planning to verify your SMTP configuration.

If you can read this, your SMTP settings work correctly.

Sent at ${new Date().toISOString()}
By: ${req.user?.username || 'unknown'}
`,
                html: `
<p>Hello,</p>
<p>This is a <strong>test email</strong> sent from RPA Planning to verify your SMTP configuration.</p>
<p>If you can read this, your SMTP settings work correctly. ✅</p>
<hr/>
<p style="color:#64748b;font-size:12px">
Sent at ${new Date().toISOString()}<br/>
By: ${req.user?.username || 'unknown'}
</p>`
            });

            res.json({ ok: true, messageId: info.messageId, accepted: info.accepted });
        } catch (err) {
            console.error('[smtp test]', err);
            // nodemailer errors carry useful info — surface a tidy message
            const msg = err.code
                ? `${err.code}: ${err.message}`
                : (err.message || 'SMTP test failed');
            res.status(500).json({ error: msg });
        }
    }
);

router.put('/smtp', async (req, res) => {
    const b = req.body || {};
    // If password is masked, keep existing
    let pwd = b.password;
    if (pwd === '********' || pwd === undefined) {
        const cur = await db.query('SELECT password FROM smtp_config WHERE id=1');
        pwd = cur.rows[0]?.password || '';
    }
    const { rows } = await db.query(
        `UPDATE smtp_config
            SET host=$1, port=$2, secure=$3, username=$4, password=$5,
                from_email=$6, from_name=$7, updated_at=NOW()
          WHERE id=1 RETURNING *`,
        [b.host || 'smtp.gmail.com', b.port || 587, !!b.secure,
         b.username || '', pwd, b.from_email || '', b.from_name || 'RPA Planning']
    );
    const out = { ...rows[0], password: rows[0].password ? '********' : '' };
    res.json(out);
});

module.exports = router;
