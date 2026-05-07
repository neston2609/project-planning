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
