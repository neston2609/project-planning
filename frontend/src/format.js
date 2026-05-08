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
 * Filter + sort a list of dashboard rows.
 *  - search: case-insensitive substring matched against `searchFields`.
 *  - status: 'all' | 'Pipeline' | 'Win' (Win matches both Win and Backlog).
 *  - sortBy: 'customer' | 'project_code' | 'revenue_desc' | 'revenue_asc'.
 *  - revenueField: which numeric field is the "Revenue" for sorting.
 */
export function applyFiltersAndSort(rows, opts = {}) {
    const {
        search = '', status = 'all', sortBy = 'project_code',
        revenueField = 'revenue',
        searchFields = ['project_code', 'description', 'customer']
    } = opts;

    let out = rows;
    if (status && status !== 'all') {
        if (status === 'Win') out = out.filter(r => r.status === 'Win' || r.status === 'Backlog');
        else                  out = out.filter(r => r.status === status);
    }
    if (search) {
        const q = search.toLowerCase();
        out = out.filter(r => searchFields.some(f => (r[f] || '').toString().toLowerCase().includes(q)));
    }

    const cmpStr = (a, b) => (a || '').localeCompare(b || '');
    const cmpNum = (a, b) => (Number(a) || 0) - (Number(b) || 0);
    const tie = (a, b) => cmpStr(a.project_code, b.project_code);
    const sorted = [...out];
    switch (sortBy) {
        case 'project_code':
            sorted.sort((a, b) => cmpStr(a.project_code, b.project_code)); break;
        case 'project_code_desc':
            sorted.sort((a, b) => cmpStr(b.project_code, a.project_code)); break;
        case 'customer':
            sorted.sort((a, b) => cmpStr(a.customer, b.customer) || tie(a, b)); break;
        case 'customer_desc':
            sorted.sort((a, b) => cmpStr(b.customer, a.customer) || tie(a, b)); break;
        case 'status':
            sorted.sort((a, b) => cmpStr(a.status, b.status) || tie(a, b)); break;
        case 'revenue_desc':
            sorted.sort((a, b) => cmpNum(b[revenueField], a[revenueField]) || tie(a, b)); break;
        case 'revenue_asc':
            sorted.sort((a, b) => cmpNum(a[revenueField], b[revenueField]) || tie(a, b)); break;
        case 'rec_revenue_desc':
            sorted.sort((a, b) => cmpNum(b.recognize_revenue, a.recognize_revenue) || tie(a, b)); break;
        case 'rec_revenue_asc':
            sorted.sort((a, b) => cmpNum(a.recognize_revenue, b.recognize_revenue) || tie(a, b)); break;
        case 'rec_gm_desc':
            sorted.sort((a, b) => cmpNum(b.recognize_gross_margin, a.recognize_gross_margin) || tie(a, b)); break;
        case 'rec_gm_asc':
            sorted.sort((a, b) => cmpNum(a.recognize_gross_margin, b.recognize_gross_margin) || tie(a, b)); break;
    }
    return sorted;
}

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
