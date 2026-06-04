const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

console.log('[startup] env loaded — PGHOST=%s PGPORT=%s PGUSER=%s PGDATABASE=%s PGPASSWORD=%s PORT=%s',
    process.env.PGHOST || '(unset)',
    process.env.PGPORT || '(unset)',
    process.env.PGUSER || '(unset)',
    process.env.PGDATABASE || '(unset)',
    process.env.PGPASSWORD ? `(${process.env.PGPASSWORD.length} chars)` : '(unset!)',
    process.env.PORT || '(unset, using default 6000)');

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { bootstrap }   = require('./utils/bootstrap');
const { softAuth }    = require('./middleware/auth');
const authRouter      = require('./routes/auth');
const customersRouter = require('./routes/customers');
const resourcesRouter = require('./routes/resources');
const projectsRouter  = require('./routes/projects').router;
const dashboardsRouter= require('./routes/dashboards');
const adminRouter     = require('./routes/admin');
const licensesRouter  = require('./routes/licenses');
const tenantsRouter   = require('./routes/tenants');
const platformRouter  = require('./routes/platform');
const projectSummaryRouter = require('./routes/projectSummary');
const officeBookingsRouter = require('./routes/officeBookings');
const knowledgeBaseRouter = require('./routes/knowledgeBase');
const postItsRouter = require('./routes/postIts');

const app = express();

app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: false
}));
app.use(express.json({ limit: '15mb' }));
app.use(morgan('tiny'));
app.use(softAuth);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth',       authRouter);
app.use('/api/customers',  customersRouter);
app.use('/api/resources',  resourcesRouter);
app.use('/api/projects',   projectsRouter);
app.use('/api/dashboards', dashboardsRouter);
app.use('/api/admin',      adminRouter);
app.use('/api/licenses',   licensesRouter);
app.use('/api/tenants',    tenantsRouter);
app.use('/api/platform',   platformRouter);
app.use('/api/project-summary', projectSummaryRouter);
app.use('/api/office-bookings', officeBookingsRouter);
app.use('/api/knowledge-base', knowledgeBaseRouter);
app.use('/api/post-its', postItsRouter);

const fs = require('fs');
const distDir = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir, { maxAge: '30d', index: false }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
    console.log('[startup] serving built frontend from', distDir);
}

app.use((err, req, res, _next) => {
    console.error('[err]', err);
    if (res.headersSent) return;
    res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 6000;
(async () => {
    try {
        await bootstrap();
    } catch (err) {
        console.error('[startup] bootstrap failed; continuing without auto schema init.');
    }
    app.listen(PORT, () => console.log(`[rpa-planning] backend listening on :${PORT}`));
})();
