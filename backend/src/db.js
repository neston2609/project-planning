const { Pool, types } = require('pg');

// Return DATE (oid 1082) as plain 'YYYY-MM-DD' instead of a JS Date in local
// time. Avoids timezone drift in revenue recognition math.
types.setTypeParser(1082, (val) => val);

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
