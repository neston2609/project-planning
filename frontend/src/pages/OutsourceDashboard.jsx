import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { useYear } from '../YearContext';
import StatusPill from '../components/StatusPill';
import DashboardHeader from '../components/DashboardHeader';
import ProgressCell from '../components/ProgressCell';
import { baht, formatDate, splitTotals } from '../format';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function OutsourceDashboard() {
    const { year } = useYear();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        setLoading(true);
        api.get(`/dashboards/outsource?year=${year}`)
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
                title={`Outsource · ${year}`}
                subtitle="Man-Month: revenue is the sum of monthly entries (100% recognized). Man-Year: pro-rata."
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
                            <th>Type</th><th>Period</th>
                            <th className="text-right">Revenue (Year)</th>
                            <th className="text-right">Cost (Year)</th>
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
                                <td className="max-w-[220px] truncate" title={r.description}>{r.description}</td>
                                <td className="font-medium">{r.customer || '-'}</td>
                                <td><StatusPill status={r.status} /></td>
                                <td>
                                    <span className={`pill ${r.outsource_type === 'Man-Month'
                                        ? 'bg-cyan-50 text-cyan-700 ring-cyan-200'
                                        : 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200'}`}>
                                        {r.outsource_type}
                                    </span>
                                </td>
                                <td className="text-xs text-slate-500 whitespace-nowrap">
                                    {r.outsource_type === 'Man-Year'
                                        ? <>{formatDate(r.start_date)}<br/>{formatDate(r.end_date)}</>
                                        : <span className="italic">monthly</span>}
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
