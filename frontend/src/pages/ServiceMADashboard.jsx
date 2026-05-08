import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { useYear } from '../YearContext';
import StatusPill from '../components/StatusPill';
import DashboardHeader from '../components/DashboardHeader';
import ProgressCell from '../components/ProgressCell';
import { baht, formatDate, splitTotals, applyFiltersAndSort } from '../format';
import FilterBar from '../components/FilterBar';

export default function ServiceMADashboard() {
    const { year } = useYear();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [sortBy, setSortBy] = useState('project_code');

    useEffect(() => {
        setLoading(true);
        api.get(`/dashboards/service-ma?year=${year}`)
            .then(r => setRows(r.data.rows))
            .finally(() => setLoading(false));
    }, [year]);

    const filtered = useMemo(() => applyFiltersAndSort(rows, {
        search, status, sortBy, revenueField: 'revenue'
    }), [rows, search, status, sortBy]);

    const t = splitTotals(filtered, 'revenue');

    return (
        <div className="space-y-5">
            <DashboardHeader
                title={`Service MA · ${year}`}
                subtitle="Pro-rata recognition based on contract days falling in the selected year."
                tiles={[
                    { label: 'Pipeline · Rec. Revenue', value: t.pipelineRev, accent: 'amber' },
                    { label: 'Pipeline · Rec. Gross Margin', value: t.pipelineGm, accent: 'rose' },
                    { label: 'Win · Rec. Revenue', value: t.winRev, accent: 'green' },
                    { label: 'Win · Rec. Gross Margin', value: t.winGm, accent: 'blue' }
                ]} />

            <FilterBar
                search={search} onSearchChange={setSearch}
                status={status} onStatusChange={setStatus}
                sortBy={sortBy} onSortByChange={setSortBy} />

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead>
                        <tr>
                            <th>Code</th><th>Description</th><th>Customer</th><th>Status</th>
                            <th>Service MA Description</th><th>Period</th>
                            <th className="text-right">Revenue</th><th className="text-right">Cost</th>
                            <th className="text-right">GM</th>
                            <th className="min-w-[150px]">% Recognize</th>
                            <th className="text-right">Rec. Revenue</th>
                            <th className="text-right">Rec. GM</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={12} className="text-center py-10 text-slate-400 animate-pulse">Loading...</td></tr>}
                        {!loading && filtered.length === 0 && <tr><td colSpan={12} className="text-center py-10 text-slate-400">No data</td></tr>}
                        {filtered.map(r => (
                            <tr key={r.id}>
                                <td className="font-mono text-xs font-semibold text-indigo-600">{r.project_code}</td>
                                <td className="max-w-[200px] truncate" title={r.description}>{r.description}</td>
                                <td className="font-medium">{r.customer || '-'}</td>
                                <td><StatusPill status={r.status} /></td>
                                <td>{r.service_ma_description}</td>
                                <td className="text-xs text-slate-500 whitespace-nowrap">
                                    {formatDate(r.start_date)}<br/>{formatDate(r.end_date)}
                                </td>
                                <td className="text-right tabular-nums">{baht(r.revenue)}</td>
                                <td className="text-right tabular-nums text-slate-500">{baht(r.cost)}</td>
                                <td className="text-right tabular-nums font-medium">{baht(r.gross_margin)}</td>
                                <td><ProgressCell value={r.pct_recognize} /></td>
                                <td className="text-right tabular-nums font-bold text-emerald-700">{baht(r.recognize_revenue)}</td>
                                <td className="text-right tabular-nums font-bold text-indigo-700">{baht(r.recognize_gross_margin)}</td>
                            </tr>
                        ))}
                        {!loading && filtered.length > 0 && (
                            <tr className="bg-gradient-to-r from-indigo-50 to-pink-50 sticky bottom-0">
                                <td colSpan={6} className="text-right font-bold">Totals</td>
                                <td className="text-right tabular-nums font-bold">{baht(t.gross)}</td>
                                <td colSpan={3}></td>
                                <td className="text-right tabular-nums font-extrabold text-emerald-700">{baht(t.totalRev)}</td>
                                <td className="text-right tabular-nums font-extrabold text-indigo-700">{baht(t.totalGm)}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
