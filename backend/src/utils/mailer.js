const nodemailer = require('nodemailer');
const db = require('../db');

/**
 * Create a nodemailer transport from the saved smtp_config row.
 * Throws if SMTP isn't configured yet.
 */
async function makeTransport() {
    const { rows } = await db.query('SELECT * FROM smtp_config WHERE id=1');
    const cfg = rows[0];
    if (!cfg || !cfg.host || !cfg.username || !cfg.password) {
        const err = new Error('SMTP not configured. An admin needs to set credentials in Admin → SMTP first.');
        err.code = 'SMTP_NOT_CONFIGURED';
        throw err;
    }
    const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: Number(cfg.port) || 587,
        secure: !!cfg.secure,
        auth: { user: cfg.username, pass: cfg.password }
    });
    return { transporter, cfg };
}

async function sendMail({ to, subject, text, html }) {
    const { transporter, cfg } = await makeTransport();
    const fromName = cfg.from_name || 'RPA Planning';
    const fromAddr = cfg.from_email || cfg.username;
    return transporter.sendMail({
        from: `"${fromName}" <${fromAddr}>`,
        to, subject, text, html
    });
}

module.exports = { sendMail, makeTransport };
