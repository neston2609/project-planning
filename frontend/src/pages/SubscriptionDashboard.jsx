import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { useYear } from '../YearContext';
import StatusPill from '../components/StatusPill';
import DashboardHeader from '../components/DashboardHeader';
import ProgressCell from '../components/ProgressCell';
import { baht, formatDate } from '../format';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function SubscriptionDashboard() {
    const { year } = useYear();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        setLoading(true);
        api.get(`/dashboards/subscriptions?year=${year}`)
            .then(r => setRows(r.data.rows))
            .finally(() => setLoading(false));
    }, [year]);

    const filtered = useMemo(() => rows.filter(r => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (r.project_code || '').toLowerCase().includes(q) ||
               (r.description || '').toLowerCase().includes(q) ||
               (r.customer || '').toLowerCase().includes(q) ||
               (r.license_name || '').toLowerCase().includes(q);
    }), [rows, search]);

    const totals = filtered.reduce((a, r) => ({
        rev: a.rev + (r.recognize_revenue || 0),
        gm:  a.gm  + (r.recognize_gross_margin || 0),
        gross: a.gross + (r.license_revenue || 0)
    }), { rev: 0, gm: 0, gross: 0 });

    return (
        <div className="space-y-5">
            <DashboardHeader
                title={`Subscription License · ${year}`}
                subtitle="Pro-rata recognition based on contract days falling in the selected year."
                tiles={[
                    { label: 'Projects', value: filtered.length, accent: 'blue', hint: 'Visible rows' },
                    { label: 'Total Revenue (Contract)', value: totals.gross, accent: 'purple' },
                    { label: 'Recognized Revenue', value: totals.rev, accent: 'green' },
                    { label: 'Recognized Gross Margin', value: totals.gm, accent: 'amber' }
                ]}
                currency={true} />

            <div className="card p-3 flex items-center gap-2">
                <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
                <input className="input !border-0 !bg-transparent !p-0 focus:!ring-0"
                    placeholder="Search by code, description, customer, license name..."
                    value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Description</th>
                            <th>Customer</th>
                            <th>Status</th>
                            <th>License Name</th>
                            <th>Period</th>
                            <th className="text-right">Revenue</th>
                            <th className="text-right">Cost</th>
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
                            <tr key={r.project_id}>
                                <td className="font-mono text-xs font-semibold text-indigo-600">{r.project_code}</td>
                                <td className="max-w-[240px] truncate" title={r.description}>{r.description}</td>
                                <td className="font-medium">{r.customer || '-'}</td>
                                <td><StatusPill status={r.status} /></td>
                                <td>{r.license_name}</td>
                                <td className="text-xs text-slate-500 whitespace-nowrap">
                                    {formatDate(r.license_start_date)}<br/>{formatDate(r.license_end_date)}
                                </td>
                                <td className="text-right tabular-nums">{baht(r.license_revenue)}</td>
                                <td className="text-right tabular-nums text-slate-500">{baht(r.license_cost)}</td>
                                <td className="text-right tabular-nums font-medium">{baht(r.license_gross_margin)}</td>
                                <td><ProgressCell value={r.pct_recognize} /></td>
                                <td className="text-right tabular-nums font-bold text-emerald-700">{baht(r.recognize_revenue)}</td>
                                <td className="text-right tabular-nums font-bold text-indigo-700">{baht(r.recognize_gross_margin)}</td>
                            </tr>
                        ))}
                        {!loading && filtered.length > 0 && (
                            <tr className="bg-gradient-to-r from-indigo-50 to-pink-50 sticky bottom-0">
                                <td colSpan={6} className="text-right font-bold">Totals</td>
                                <td className="text-right tabular-nums font-bold">{baht(totals.gross)}</td>
                                <td colSpan={3}></td>
                                <td className="text-right tabular-nums font-extrabold text-emerald-700">{baht(totals.rev)}</td>
                                <td className="text-right tabular-nums font-extrabold text-indigo-700">{baht(totals.gm)}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
