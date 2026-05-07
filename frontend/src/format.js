export const baht = (n) => {
    const v = Number(n || 0);
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v);
};

export const pct = (n) => {
    const v = Number(n || 0);
    return `${(v * 100).toFixed(1)}%`;
};

export const formatDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return dt.toISOString().slice(0, 10);
};

export const statusClass = (status) =>
    status === 'Win' || status === 'Backlog' ? 'pill-win'
  : status === 'Pipeline' ? 'pill-pipe'
  : 'pill-loss';

/**
 * Split a list of dashboard rows into Pipeline vs. Win/Backlog buckets.
 * `grossField` lets us pick which gross-revenue field to sum for the totals row
 * (e.g. 'license_revenue' for Subscription, 'revenue' for everything else).
 * Returns: { pipelineRev, pipelineGm, winRev, winGm, totalRev, totalGm, gross }
 */
export function splitTotals(rows, grossField = 'revenue') {
    const t = { pipelineRev: 0, pipelineGm: 0, winRev: 0, winGm: 0,
                totalRev: 0, totalGm: 0, gross: 0 };
    for (const r of rows) {
        const rev = Number(r.recognize_revenue) || 0;
        const gm  = Number(r.recognize_gross_margin) || 0;
        const gross = Number(r[grossField]) || 0;
        t.totalRev += rev; t.totalGm += gm; t.gross += gross;
        if (r.status === 'Pipeline') { t.pipelineRev += rev; t.pipelineGm += gm; }
        else if (r.status === 'Win' || r.status === 'Backlog') { t.winRev += rev; t.winGm += gm; }
    }
    return t;
}
