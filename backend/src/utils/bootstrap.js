const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('../db');

/**
 * Apply schema.sql if the `users` table doesn't exist yet, then create
 * the default superadmin if no users exist.
 */
async function bootstrap() {
    // 1) Ensure schema is applied. Cheap to re-run because everything uses IF NOT EXISTS.
    const schemaPath = path.join(__dirname, '..', '..', 'sql', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
        const ddl = fs.readFileSync(schemaPath, 'utf8');
        try {
            await db.query(ddl);
            console.log('[bootstrap] schema applied');
        } catch (err) {
            console.error('[bootstrap] schema apply failed:', err.message);
            throw err;
        }
    }

    // 2) Create default superadmin if no admin/superadmin exists yet.
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM users');
    if (rows[0].n === 0) {
        const username = process.env.SUPERADMIN_USERNAME || 'superadmin';
        const password = process.env.SUPERADMIN_PASSWORD || 'bsmrpa1234';
        const hash = await bcrypt.hash(password, 10);
        await db.query(
            `INSERT INTO users (username, password_hash, full_name, role, must_change_password)
             VALUES ($1, $2, $3, 'superadmin', TRUE)`,
            [username, hash, 'System Superadmin']
        );
        console.log(`[bootstrap] created default superadmin: ${username} (must change password on first login)`);
    }
}

module.exports = { bootstrap };
