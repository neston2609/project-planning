import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { useYear } from '../YearContext';
import StatusPill from '../components/StatusPill';
import DashboardHeader from '../components/DashboardHeader';
import ProgressCell from '../components/ProgressCell';
import { baht, formatDate, splitTotals } from '../format';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function ImplementationDashboard() {
    const { year } = useYear();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        setLoading(true);
        api.get(`/dashboards/implementation?year=${year}`)
            .then(r => setRows(r.data.rows))
            .finally(() => setLoading(false));
    }, [year]);

    const filtered = useMemo(() => rows.filter(r => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (r.project_code || '').toLowerCase().includes(q) ||
               (r.description || '').toLowerCase().includes(q) ||
               (r.customer || '').toLowerCase().includes(q);
    }), [rows, search]);

    const t = splitTotals(filtered, 'revenue');

    return (
        <div className="space-y-5">
            <DashboardHeader
                title={`Implementation · ${year}`}
                subtitle="Recognized as the delta between this year's progress % and last year's progress %."
                tiles={[
                    { label: 'Pipeline · Rec. Revenue', value: t.pipelineRev, accent: 'amber' },
                    { label: 'Pipeline · Rec. Gross Margin', value: t.pipelineGm, accent: 'rose' },
                    { label: 'Win · Rec. Revenue', value: t.winRev, accent: 'green' },
                    { label: 'Win · Rec. Gross Margin', value: t.winGm, accent: 'blue' }
                ]} />

            <div className="card p-3 flex items-center gap-2">
                <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
                <input className="input !border-0 !bg-transparent !p-0 focus:!ring-0"
                    placeholder="Search by code / description / customer..."
                    value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead>
                        <tr>
                            <th>Code</th><th>Description</th><th>Customer</th><th>Status</th>
                            <th>Pipeline Target</th>
                            <th className="text-right">Revenue</th><th className="text-right">Cost</th>
                            <th className="text-right">GM</th>
                            <th className="min-w-[120px]">% Last Yr</th>
                            <th className="min-w-[120px]">% This Yr</th>
                            <th className="min-w-[120px]">% Recognize</th>
                            <th className="text-right">Rec. Revenue</th>
                            <th className="text-right">Rec. GM</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={13} className="text-center py-10 text-slate-400 animate-pulse">Loading...</td></tr>}
                        {!loading && filtered.length === 0 && <tr><td colSpan={13} className="text-center py-10 text-slate-400">No data</td></tr>}
                        {filtered.map(r => (
                            <tr key={r.project_id}>
                                <td className="font-mono text-xs font-semibold text-indigo-600">{r.project_code}</td>
                                <td className="max-w-[260px] truncate" title={r.description}>{r.description}</td>
                                <td className="font-medium">{r.customer || '-'}</td>
                                <td><StatusPill status={r.status} /></td>
                                <td className="text-xs text-slate-500">{formatDate(r.pipeline_target_date)}</td>
                                <td className="text-right tabular-nums">{baht(r.revenue)}</td>
                                <td className="text-right tabular-nums text-slate-500">{baht(r.cost)}</td>
                                <td className="text-right tabular-nums font-medium">{baht(r.gross_margin)}</td>
                                <td><ProgressCell value={r.progress_last_year_pct} tone="auto" /></td>
                                <td><ProgressCell value={r.progress_this_year_pct} tone="auto" /></td>
                                <td><ProgressCell value={r.pct_recognize} tone="auto" /></td>
                                <td className="text-right tabular-nums font-bold text-emerald-700">{baht(r.recognize_revenue)}</td>
                                <td className="text-right tabular-nums font-bold text-indigo-700">{baht(r.recognize_gross_margin)}</td>
                            </tr>
                        ))}
                        {!loading && filtered.length > 0 && (
                            <tr className="bg-gradient-to-r from-indigo-50 to-pink-50 sticky bottom-0">
                                <td colSpan={5} className="text-right font-bold">Totals</td>
                                <td className="text-right tabular-nums font-bold">{baht(t.gross)}</td>
                                <td colSpan={5}></td>
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
