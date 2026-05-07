const express = require('express');
const bcrypt  = require('bcrypt');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login',
    body('username').isString().notEmpty(),
    body('password').isString().notEmpty(),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

        const { username, password } = req.body;
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
        const ua = req.headers['user-agent'] || '';

        try {
            const { rows } = await db.query('SELECT * FROM users WHERE username=$1', [username]);
            const user = rows[0];
            const ok = user && await bcrypt.compare(password, user.password_hash);

            await db.query(
                `INSERT INTO login_logs(username, ip_address, status, user_agent) VALUES ($1,$2,$3,$4)`,
                [username, ip, ok ? 'Success' : 'Failed', ua]
            );

            if (!ok) return res.status(401).json({ error: 'Invalid username or password' });

            const token = signToken({ uid: user.id, username: user.username, role: user.role });
            return res.json({
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    full_name: user.full_name,
                    role: user.role,
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

router.get('/me', requireAuth, async (req, res) => {
    const { rows } = await db.query(
        `SELECT id, username, full_name, email, phone_number, role, must_change_password
         FROM users WHERE id=$1`,
        [req.user.uid]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});

module.exports = router;
