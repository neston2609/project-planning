const db = require('../db');

const DEFAULT_PIPELINE_WIN_PCT = 50;
const DEFAULT_PIPELINE_THRESHOLD_PCT = 50;

function normalizePercent(value, fallback = DEFAULT_PIPELINE_WIN_PCT) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(100, Math.max(0, n));
}

function revenueProjectWhere(alias = 'p', paramIndex = 2) {
    return `(${alias}.status <> 'Loss' AND (${alias}.status <> 'Pipeline' OR COALESCE(${alias}.pipeline_win_pct, ${DEFAULT_PIPELINE_WIN_PCT}) > $${paramIndex}::numeric))`;
}

async function getPipelineThresholdPct(tenantId) {
    const { rows } = await db.query(
        "SELECT value FROM tenant_config WHERE tenant_id=$1 AND key='pipeline_win_threshold_pct'",
        [tenantId]
    );
    return normalizePercent(rows[0]?.value, DEFAULT_PIPELINE_THRESHOLD_PCT);
}

async function getPipelineThresholdsByTenant() {
    const { rows } = await db.query(
        "SELECT tenant_id, value FROM tenant_config WHERE key='pipeline_win_threshold_pct'"
    );
    const out = new Map();
    for (const row of rows) {
        out.set(row.tenant_id, normalizePercent(row.value, DEFAULT_PIPELINE_THRESHOLD_PCT));
    }
    return out;
}

function projectCountsForRevenue(row, thresholdsByTenant = new Map()) {
    if (!row || row.status === 'Loss') return false;
    if (row.status !== 'Pipeline') return true;
    const threshold = thresholdsByTenant.get(row.tenant_id) ?? DEFAULT_PIPELINE_THRESHOLD_PCT;
    return normalizePercent(row.pipeline_win_pct, DEFAULT_PIPELINE_WIN_PCT) > threshold;
}

module.exports = {
    DEFAULT_PIPELINE_WIN_PCT,
    DEFAULT_PIPELINE_THRESHOLD_PCT,
    normalizePercent,
    revenueProjectWhere,
    getPipelineThresholdPct,
    getPipelineThresholdsByTenant,
    projectCountsForRevenue
};
