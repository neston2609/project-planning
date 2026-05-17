const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireRole, requireTenant } = require('../middleware/auth');

const router = express.Router();
// All admin routes are tenant-scoped. The global TenantAdmin manages tenants
// and team users via /api/tenants, not these per-tenant admin endpoints.
router.use(requireAuth, requireTenant);

// ---------- Users (Superadmin only, within the caller's tenant) ----------
router.get('/users', requireRole('superadmin'), async (req, res) => {
    const { rows } = await db.query(
        `SELECT id, username, full_name, email, phone_number, role,
                must_change_password, created_at
           FROM users
          WHERE tenant_id=$1
          ORDER BY username`,
        [req.tenantId]
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
                `INSERT INTO users(tenant_id, username, password_hash, full_name, email, phone_number, role)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)
                 RETURNING id, username, full_name, email, phone_number, role`,
                [req.tenantId, username, hash, full_name || '', email || '', phone_number || '', role]
            );
            res.status(201).json(rows[0]);
        } catch (err) {
            if (err.code === '23505') return res.status(409).json({ error: 'Username already exists in this team' });
            throw err;
        }
    }
);

router.put('/users/:id', requireRole('superadmin'), param('id').isInt(), async (req, res) => {
    const { full_name, email, phone_number, role, password } = req.body;
    const safeRole = (role && ['user','admin','superadmin'].includes(role)) ? role : null;
    let q, args;
    if (password) {
        const hash = await bcrypt.hash(password, 10);
        q = `UPDATE users SET full_name=$1, email=$2, phone_number=$3, role=COALESCE($4, role),
                              password_hash=$5
             WHERE id=$6 AND tenant_id=$7
             RETURNING id, username, full_name, email, phone_number, role`;
        args = [full_name || '', email || '', phone_number || '', safeRole, hash, req.params.id, req.tenantId];
    } else {
        q = `UPDATE users SET full_name=$1, email=$2, phone_number=$3, role=COALESCE($4, role)
             WHERE id=$5 AND tenant_id=$6
             RETURNING id, username, full_name, email, phone_number, role`;
        args = [full_name || '', email || '', phone_number || '', safeRole, req.params.id, req.tenantId];
    }
    const { rows } = await db.query(q, args);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});

router.delete('/users/:id', requireRole('superadmin'), param('id').isInt(), async (req, res) => {
    if (Number(req.params.id) === req.user.uid) {
        return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    const { rowCount } = await db.query(
        'DELETE FROM users WHERE id=$1 AND tenant_id=$2',
        [req.params.id, req.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

router.get('/login-logs', requireRole('superadmin'), async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const { rows } = await db.query(
        `SELECT * FROM login_logs WHERE tenant_id=$1 ORDER BY login_at DESC LIMIT $2`,
        [req.tenantId, limit]
    );
    res.json(rows);
});

// ---------- Year config (tenant-scoped) ----------
router.get('/year-config', async (req, res) => {
    const { rows } = await db.query(
        'SELECT * FROM year_config WHERE tenant_id=$1 ORDER BY year DESC',
        [req.tenantId]
    );
    res.json(rows);
});

router.put('/year-config/:year', param('year').isInt(),
    body('headcount').isInt({ min: 0 }),
    body('revenue_per_headcount').isFloat({ min: 0 }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const { rows } = await db.query(
            `INSERT INTO year_config(tenant_id, year, headcount, revenue_per_headcount)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (tenant_id, year) DO UPDATE
               SET headcount=EXCLUDED.headcount,
                   revenue_per_headcount=EXCLUDED.revenue_per_headcount,
                   updated_at=NOW()
             RETURNING *`,
            [req.tenantId, req.params.year, req.body.headcount, req.body.revenue_per_headcount]
        );
        res.json(rows[0]);
    }
);

// ---------- App config (per-tenant tenant_config KV) ----------
// Phase 4: 'default_year' and 'license_expiring_days' live in tenant_config.
// The GET response keeps the same shape as before (flat key->value map) so
// the existing frontend doesn't need to change.
router.get('/app-config', async (req, res) => {
    const { rows } = await db.query(
        'SELECT key, value FROM tenant_config WHERE tenant_id=$1',
        [req.tenantId]
    );
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

router.put('/app-config/:key', param('key').isString(), async (req, res) => {
    const { rows } = await db.query(
        `INSERT INTO tenant_config(tenant_id, key, value) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
         RETURNING tenant_id, key, value`,
        [req.tenantId, req.params.key, String(req.body.value ?? '')]
    );
    res.json(rows[0]);
});

// ---------- SMTP config (PER TENANT) ----------
router.get('/smtp', async (req, res) => {
    const { rows } = await db.query('SELECT * FROM smtp_config WHERE tenant_id=$1', [req.tenantId]);
    if (!rows[0]) {
        // Return defaults so the form has something sensible to render.
        return res.json({
            tenant_id: req.tenantId,
            host: 'smtp.gmail.com', port: 587, secure: false,
            username: '', password: '', from_email: '', from_name: 'Planning'
        });
    }
    const r = rows[0];
    res.json({ ...r, password: r.password ? '********' : '' });
});

router.post('/smtp/test',
    body('recipient').isEmail().withMessage('Valid recipient email required'),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ error: errs.array()[0].msg });

        const { rows } = await db.query('SELECT * FROM smtp_config WHERE tenant_id=$1', [req.tenantId]);
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
            await transporter.verify();

            const info = await transporter.sendMail({
                from: `"${cfg.from_name || 'Planning'}" <${cfg.from_email || cfg.username}>`,
                to: req.body.recipient,
                subject: 'Planning · SMTP test',
                text:
`Hello,

This is a test email sent to verify your team's SMTP configuration.

If you can read this, your SMTP settings work correctly.

Sent at ${new Date().toISOString()}
By: ${req.user?.username || 'unknown'}
`,
                html: `
<p>Hello,</p>
<p>This is a <strong>test email</strong> sent to verify your team's SMTP configuration.</p>
<p>If you can read this, your SMTP settings work correctly.</p>
<hr/>
<p style="color:#64748b;font-size:12px">
Sent at ${new Date().toISOString()}<br/>
By: ${req.user?.username || 'unknown'}
</p>`
            });
            res.json({ ok: true, messageId: info.messageId, accepted: info.accepted });
        } catch (err) {
            console.error('[smtp test]', err);
            const msg = err.code ? `${err.code}: ${err.message}` : (err.message || 'SMTP test failed');
            res.status(500).json({ error: msg });
        }
    }
);

router.put('/smtp', async (req, res) => {
    const b = req.body || {};
    let pwd = b.password;
    if (pwd === '********' || pwd === undefined) {
        const cur = await db.query('SELECT password FROM smtp_config WHERE tenant_id=$1', [req.tenantId]);
        pwd = cur.rows[0]?.password || '';
    }
    const { rows } = await db.query(
        `INSERT INTO smtp_config(tenant_id, host, port, secure, username, password, from_email, from_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (tenant_id) DO UPDATE
           SET host=EXCLUDED.host, port=EXCLUDED.port, secure=EXCLUDED.secure,
               username=EXCLUDED.username, password=EXCLUDED.password,
               from_email=EXCLUDED.from_email, from_name=EXCLUDED.from_name,
               updated_at=NOW()
         RETURNING *`,
        [req.tenantId, b.host || 'smtp.gmail.com', b.port || 587, !!b.secure,
         b.username || '', pwd, b.from_email || '', b.from_name || 'Planning']
    );
    const out = { ...rows[0], password: rows[0].password ? '********' : '' };
    res.json(out);
});

module.exports = router;
