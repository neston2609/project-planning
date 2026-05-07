require('dotenv').config();
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

const app = express();

app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: false
}));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('tiny'));
app.use(softAuth);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth',       authRouter);
app.use('/api/customers',  customersRouter);
app.use('/api/resources',  resourcesRouter);
app.use('/api/projects',   projectsRouter);
app.use('/api/dashboards', dashboardsRouter);
app.use('/api/admin',      adminRouter);

// Generic error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
    console.error('[err]', err);
    if (res.headersSent) return;
    res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 5000;
(async () => {
    try {
        await bootstrap();
    } catch (err) {
        console.error('[startup] bootstrap failed; continuing without auto schema init.');
        // We continue, since the operator may have applied the schema manually.
    }
    app.listen(PORT, () => console.log(`[rpa-planning] backend listening on :${PORT}`));
})();
