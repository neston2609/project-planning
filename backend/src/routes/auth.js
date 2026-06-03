const express = require('express');
const crypto  = require('crypto');
const bcrypt  = require('bcrypt');
const { body, query, validationResult } = require('express-validator');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');
const { ensureDefaultRoles, permissionsForUser } = require('../utils/roles');

const router = express.Router();

const ALLOWED_DOMAIN = '@mfec.co.th';
const REG_TOKEN_TTL_HOURS = 24;

async function getDefaultTenantId() {
    const r = await db.query("SELECT value FROM app_config WHERE key='default_tenant_id'");
    const id = r.rows[0] ? Number(r.rows[0].value) : null;
    return Number.isInteger(id) && id > 0 ? id : null;
}

// ---------- Public list of tenants (for the Login tenant picker) ----------
router.get('/tenants', async (_req, res) => {
    const { rows } = await db.query('SELECT id, name FROM tenants ORDER BY name');
    res.json(rows);
});

router.post('/login',
    body('username').isString().notEmpty(),
    body('password').isString().notEmpty(),
    body('tenant_id').optional({ nullable: true }).isInt({ min: 1 }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

        const { username, password } = req.body;
        const tenantId = (req.body.tenant_id == null || req.body.tenant_id === '') ? null : Number(req.body.tenant_id);
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
        const ua = req.headers['user-agent'] || '';

        try {
            // Platform roles (tenantadmin, tenantuser) live outside any tenant.
            const userQuery = tenantId === null
                ? `SELECT u.*, NULL::text AS tenant_name
                     FROM users u
                    WHERE u.username = $1 AND u.tenant_id IS NULL
                      AND u.role IN ('tenantadmin','tenantuser')`
                : `SELECT u.*, t.name AS tenant_name
                     FROM users u
                     JOIN tenants t ON t.id = u.tenant_id
                    WHERE u.username = $1 AND u.tenant_id = $2`;
            const params = tenantId === null ? [username] : [username, tenantId];
            const { rows } = await db.query(userQuery, params);
            const user = rows[0];
            const ok = user && await bcrypt.compare(password, user.password_hash);

            await db.query(
                `INSERT INTO login_logs(tenant_id, username, ip_address, status, user_agent)
                 VALUES ($1,$2,$3,$4,$5)`,
                [user ? user.tenant_id : tenantId, username, ip, ok ? 'Success' : 'Failed', ua]
            );

            if (!ok) return res.status(401).json({ error: 'Invalid username or password' });
            const roleAccess = await permissionsForUser(user.id, user.tenant_id, user.role);

            const token = signToken({
                uid: user.id,
                username: user.username,
                role: user.role,
                tenant_id: user.tenant_id || null
            });
            return res.json({
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    full_name: user.full_name,
                    role: user.role,
                    tenant_role_id: roleAccess.tenant_role_id,
                    tenant_role_name: roleAccess.tenant_role_name,
                    menu_permissions: roleAccess.menu_permissions,
                    theme_mode: user.theme_mode || 'light',
                    tenant_id: user.tenant_id || null,
                    tenant_name: user.tenant_name || null,
                    must_change_password: user.must_change_password
                }
            });
        } catch (err) {
            console.error('[auth/login]', err);
            return res.status(500).json({ error: 'Login failed' });
        }
    }
);

router.post('/change-password',
    requireAuth,
    body('current_password').isString().notEmpty(),
    body('new_password').isString().isLength({ min: 8 }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

        const { current_password, new_password } = req.body;
        const { rows } = await db.query('SELECT * FROM users WHERE id=$1', [req.user.uid]);
        const user = rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (!await bcrypt.compare(current_password, user.password_hash)) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const hash = await bcrypt.hash(new_password, 10);
        await db.query(
            `UPDATE users SET password_hash=$1, must_change_password=FALSE WHERE id=$2`,
            [hash, user.id]
        );
        res.json({ ok: true });
    }
);

router.patch('/preferences',
    requireAuth,
    body('theme_mode').isIn(['light', 'dark']),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

        const { rows } = await db.query(
            `UPDATE users
                SET theme_mode=$1, updated_at=NOW()
              WHERE id=$2
              RETURNING theme_mode`,
            [req.body.theme_mode, req.user.uid]
        );
        if (!rows[0]) return res.status(404).json({ error: 'User not found' });
        res.json(rows[0]);
    }
);

// ---------- Self-registration (email-verified) ----------
function buildAppOrigin(req) {
    if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/$/, '');
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0];
    const host  = (req.headers['x-forwarded-host']  || req.headers['host']).toString().split(',')[0];
    return `${proto}://${host}`;
}

router.post('/register',
    body('username').isString().trim().isLength({ min: 3, max: 64 })
        .withMessage('Username must be 3-64 characters'),
    body('password').isString().isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters'),
    body('email').isEmail().withMessage('Valid email required')
        .custom((v) => {
            if (!String(v).toLowerCase().endsWith(ALLOWED_DOMAIN)) {
                throw new Error(`Only ${ALLOWED_DOMAIN} email addresses can register`);
            }
            return true;
        }),
    body('full_name').optional().isString(),
    body('phone_number').optional().isString(),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ error: errs.array()[0].msg });

        const username = String(req.body.username).trim();
        const email    = String(req.body.email).trim().toLowerCase();
        const password = String(req.body.password);
        const fullName = String(req.body.full_name || '').trim();
        const phone    = String(req.body.phone_number || '').trim();

        try {
            const tenantId = await getDefaultTenantId();

            const dup = await db.query(
                `SELECT 1 FROM users
                  WHERE (tenant_id=$1 AND username=$2)
                     OR LOWER(email)=$3
                  LIMIT 1`,
                [tenantId, username, email]
            );
            if (dup.rowCount) {
                return res.status(409).json({ error: 'A user with that username (in your team) or email already exists' });
            }

            await db.query(`DELETE FROM pending_registrations WHERE expires_at < NOW()`);

            const pendingDup = await db.query(
                `SELECT 1 FROM pending_registrations
                  WHERE LOWER(email)=$1 OR (tenant_id=$2 AND username=$3) LIMIT 1`,
                [email, tenantId, username]
            );
            if (pendingDup.rowCount) {
                return res.status(409).json({ error: 'A pending registration already exists for that username or email. Check your inbox or wait for it to expire.' });
            }

            const passwordHash = await bcrypt.hash(password, 10);
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + REG_TOKEN_TTL_HOURS * 3600 * 1000);

            await db.query(
                `INSERT INTO pending_registrations(tenant_id, username, email, password_hash, full_name, phone_number, token, expires_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [tenantId, username, email, passwordHash, fullName, phone, token, expiresAt]
            );

            try {
                await sendVerificationEmail({
                    to: email, fullName, username, token,
                    origin: buildAppOrigin(req),
                    tenantId
                });
            } catch (err) {
                await db.query(`DELETE FROM pending_registrations WHERE token=$1`, [token]);
                console.error('[register] mail failure', err);
                if (err.code === 'SMTP_NOT_CONFIGURED') {
                    return res.status(503).json({ error: err.message });
                }
                return res.status(500).json({ error: 'Could not send confirmation email. Please try again later.' });
            }

            res.json({ ok: true, message: `A confirmation link has been sent to ${email}. Click it within ${REG_TOKEN_TTL_HOURS} hours to activate your account.` });
        } catch (err) {
            console.error('[register]', err);
            res.status(500).json({ error: 'Registration failed' });
        }
    }
);

async function sendVerificationEmail({ to, fullName, username, token, origin, tenantId }) {
    const link = `${origin}/verify-email?token=${token}`;
    await sendMail({
        tenantId,
        to,
        subject: 'Planning · Confirm your registration',
        text:
`Hi ${fullName || username},

Welcome. Click the link below within ${REG_TOKEN_TTL_HOURS} hours to confirm your email and activate your account:

${link}

If you didn't request this, just ignore this email - nothing will happen.
`,
        html: `
<p>Hi ${fullName || username},</p>
<p>Welcome. Click the button below within ${REG_TOKEN_TTL_HOURS} hours to confirm your email and activate your account:</p>
<p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Confirm my email</a></p>
<p style="font-size:12px;color:#64748b">If the button doesn't work, copy this link into your browser:<br/><code>${link}</code></p>
<hr/>
<p style="font-size:12px;color:#64748b">If you didn't request this, just ignore this email - nothing will happen.</p>`
    });
}

const RESEND_COOLDOWN_SEC = 60;

router.post('/resend-verification',
    body('email').isEmail().withMessage('Valid email required')
        .custom((v) => {
            if (!String(v).toLowerCase().endsWith(ALLOWED_DOMAIN)) {
                throw new Error(`Only ${ALLOWED_DOMAIN} email addresses can register`);
            }
            return true;
        }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ error: errs.array()[0].msg });

        const email = String(req.body.email).trim().toLowerCase();

        try {
            const existing = await db.query(`SELECT 1 FROM users WHERE LOWER(email)=$1 LIMIT 1`, [email]);
            if (existing.rowCount) {
                return res.status(409).json({ error: 'This email is already activated. Please log in.' });
            }

            await db.query(`DELETE FROM pending_registrations WHERE expires_at < NOW()`);
            const { rows } = await db.query(
                `SELECT * FROM pending_registrations WHERE LOWER(email)=$1 LIMIT 1`, [email]
            );
            const pending = rows[0];
            if (!pending) {
                return res.status(404).json({ error: 'No pending registration found for that email. Please register first.' });
            }

            const ageSec = (Date.now() - new Date(pending.created_at).getTime()) / 1000;
            if (ageSec < RESEND_COOLDOWN_SEC) {
                const wait = Math.ceil(RESEND_COOLDOWN_SEC - ageSec);
                return res.status(429).json({ error: `Please wait ${wait} seconds before requesting another email.` });
            }

            const newToken     = crypto.randomBytes(32).toString('hex');
            const newExpiresAt = new Date(Date.now() + REG_TOKEN_TTL_HOURS * 3600 * 1000);
            await db.query(
                `UPDATE pending_registrations
                    SET token=$1, expires_at=$2, created_at=NOW()
                  WHERE id=$3`,
                [newToken, newExpiresAt, pending.id]
            );

            try {
                await sendVerificationEmail({
                    to: pending.email,
                    fullName: pending.full_name,
                    username: pending.username,
                    token: newToken,
                    origin: buildAppOrigin(req),
                    tenantId: pending.tenant_id
                });
            } catch (err) {
                console.error('[resend-verification] mail failure', err);
                if (err.code === 'SMTP_NOT_CONFIGURED') {
                    return res.status(503).json({ error: err.message });
                }
                return res.status(500).json({ error: 'Could not send confirmation email. Please try again later.' });
            }

            res.json({ ok: true, message: `A new confirmation link has been sent to ${pending.email}.` });
        } catch (err) {
            console.error('[resend-verification]', err);
            res.status(500).json({ error: 'Resend failed' });
        }
    }
);

router.get('/verify-email',
    query('token').isString().isLength({ min: 32, max: 128 }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ error: 'Invalid token' });

        try {
            const { rows } = await db.query(
                `SELECT * FROM pending_registrations WHERE token=$1`, [req.query.token]
            );
            const pending = rows[0];
            if (!pending) return res.status(400).json({ error: 'Invalid or already-used confirmation link' });
            if (new Date(pending.expires_at) < new Date()) {
                await db.query(`DELETE FROM pending_registrations WHERE id=$1`, [pending.id]);
                return res.status(400).json({ error: 'This confirmation link has expired. Please register again.' });
            }

            const tenantId = pending.tenant_id || await getDefaultTenantId();
            const defaultRoles = await ensureDefaultRoles(tenantId);

            const dup = await db.query(
                `SELECT 1 FROM users
                  WHERE (tenant_id=$1 AND username=$2)
                     OR LOWER(email)=LOWER($3) LIMIT 1`,
                [tenantId, pending.username, pending.email]
            );
            if (dup.rowCount) {
                await db.query(`DELETE FROM pending_registrations WHERE id=$1`, [pending.id]);
                return res.status(409).json({ error: 'This username or email was registered separately. Please log in.' });
            }

            await db.query(
                `INSERT INTO users(tenant_id, username, password_hash, full_name, email, phone_number, role, tenant_role_id)
                 VALUES ($1,$2,$3,$4,$5,$6,'user',$7)`,
                [tenantId, pending.username, pending.password_hash, pending.full_name, pending.email, pending.phone_number, defaultRoles.user.id]
            );
            await db.query(`DELETE FROM pending_registrations WHERE id=$1`, [pending.id]);

            res.json({
                ok: true,
                username: pending.username,
                message: 'Your account has been activated. You can now log in.'
            });
        } catch (err) {
            console.error('[verify-email]', err);
            res.status(500).json({ error: 'Verification failed' });
        }
    }
);

router.get('/me', requireAuth, async (req, res) => {
    const { rows } = await db.query(
        `SELECT u.id, u.username, u.full_name, u.email, u.phone_number, u.role,
                u.tenant_role_id, u.must_change_password, u.theme_mode, u.tenant_id, t.name AS tenant_name
           FROM users u
           LEFT JOIN tenants t ON t.id = u.tenant_id
          WHERE u.id=$1`,
        [req.user.uid]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const roleAccess = await permissionsForUser(rows[0].id, rows[0].tenant_id, rows[0].role);
    res.json({ ...rows[0], ...roleAccess });
});

module.exports = router;
