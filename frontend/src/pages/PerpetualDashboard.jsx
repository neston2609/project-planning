import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { useYear } from '../YearContext';
import StatusPill from '../components/StatusPill';
import DashboardHeader from '../components/DashboardHeader';
import ProgressCell from '../components/ProgressCell';
import { baht, formatDate } from '../format';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function PerpetualDashboard() {
    const { year } = useYear();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('All');

    useEffect(() => {
        setLoading(true);
        api.get(`/dashboards/perpetual-ma?year=${year}`)
            .then(r => setRows(r.data.rows))
            .finally(() => setLoading(false));
    }, [year]);

    const filtered = useMemo(() => rows.filter(r => {
        if (typeFilter !== 'All' && r.item_type !== typeFilter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (r.project_code || '').toLowerCase().includes(q) ||
               (r.description || '').toLowerCase().includes(q) ||
               (r.customer || '').toLowerCase().includes(q) ||
               (r.item_name || '').toLowerCase().includes(q);
    }), [rows, search, typeFilter]);

    const totals = filtered.reduce((a, r) => ({
        rev: a.rev + (r.recognize_revenue || 0),
        gm:  a.gm  + (r.recognize_gross_margin || 0),
        gross: a.gross + (r.revenue || 0)
    }), { rev: 0, gm: 0, gross: 0 });

    const licenseCount = rows.filter(r => r.item_type === 'License').length;
    const maCount = rows.filter(r => r.item_type === 'MA').length;

    return (
        <div className="space-y-5">
            <DashboardHeader
                title={`Perpetual License / Software MA · ${year}`}
                subtitle="License recognized 100% in start year; MA pro-rated by contract days."
                tiles={[
                    { label: 'License Items', value: licenseCount, accent: 'blue', hint: 'item_type = License' },
                    { label: 'SW MA Items', value: maCount, accent: 'purple', hint: 'item_type = MA' },
                    { label: 'Recognized Revenue', value: totals.rev, accent: 'green' },
                    { label: 'Recognized GM', value: totals.gm, accent: 'amber' }
                ]}
                currency={true} />

            <div className="card p-3 flex items-center gap-3">
                <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
                <input className="input !border-0 !bg-transparent !p-0 focus:!ring-0 flex-1"
                    placeholder="Search code / description / customer / item name..."
                    value={search} onChange={e => setSearch(e.target.value)} />
                <div className="flex bg-slate-100 rounded-lg p-1 text-xs">
                    {['All', 'License', 'MA'].map(t => (
                        <button key={t} onClick={() => setTypeFilter(t)}
                            className={`px-3 py-1 rounded-md font-medium transition ${
                                typeFilter === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}>
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead>
                        <tr>
                            <th>Code</th><th>Description</th><th>Customer</th><th>Status</th>
                            <th>Item Name</th><th>Type</th><th>Period</th>
                            <th className="text-right">Revenue</th><th className="text-right">Cost</th>
                            <th className="text-right">GM</th><th className="min-w-[150px]">% Recognize</th>
                            <th className="text-right">Rec. Revenue</th><th className="text-right">Rec. GM</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={13} className="text-center py-10 text-slate-400 animate-pulse">Loading...</td></tr>}
                        {!loading && filtered.length === 0 && <tr><td colSpan={13} className="text-center py-10 text-slate-400">No data</td></tr>}
                        {filtered.map(r => (
                            <tr key={r.id}>
                                <td className="font-mono text-xs font-semibold text-indigo-600">{r.project_code}</td>
                                <td className="max-w-[180px] truncate" title={r.description}>{r.description}</td>
                                <td className="font-medium">{r.customer || '-'}</td>
                                <td><StatusPill status={r.status} /></td>
                                <td>{r.item_name}</td>
                                <td>
                                    <span className={`pill ${r.item_type === 'License'
                                        ? 'bg-blue-50 text-blue-700 ring-blue-200'
                                        : 'bg-purple-50 text-purple-700 ring-purple-200'}`}>
                                        {r.item_type}
                                    </span>
                                </td>
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
                                <td colSpan={7} className="text-right font-bold">Totals</td>
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
