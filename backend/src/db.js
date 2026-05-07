const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.PGHOST     || 'localhost',
    port:     Number(process.env.PGPORT) || 5432,
    user:     process.env.PGUSER     || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'rpa_planning',
    max: 10,
    idleTimeoutMillis: 30_000
});

pool.on('error', (err) => {
    console.error('[pg] unexpected pool error', err);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
    pool
};
