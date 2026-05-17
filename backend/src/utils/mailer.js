const nodemailer = require('nodemailer');
const db = require('../db');

/**
 * Create a nodemailer transport from the saved per-tenant smtp_config row.
 * Throws SMTP_NOT_CONFIGURED if the tenant hasn't set up SMTP yet.
 */
async function makeTransport(tenantId) {
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
        const err = new Error('SMTP requires a tenant context.');
        err.code = 'SMTP_NOT_CONFIGURED';
        throw err;
    }
    const { rows } = await db.query('SELECT * FROM smtp_config WHERE tenant_id=$1', [tenantId]);
    const cfg = rows[0];
    if (!cfg || !cfg.host || !cfg.username || !cfg.password) {
        const err = new Error('SMTP not configured for this team. An admin needs to set credentials in Admin -> SMTP first.');
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

async function sendMail({ tenantId, to, subject, text, html }) {
    const { transporter, cfg } = await makeTransport(tenantId);
    const fromName = cfg.from_name || 'Planning';
    const fromAddr = cfg.from_email || cfg.username;
    return transporter.sendMail({
        from: `"${fromName}" <${fromAddr}>`,
        to, subject, text, html
    });
}

module.exports = { sendMail, makeTransport };
