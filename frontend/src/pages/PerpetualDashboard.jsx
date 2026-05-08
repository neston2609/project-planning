import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { useYear } from '../YearContext';
import StatusPill from '../components/StatusPill';
import DashboardHeader from '../components/DashboardHeader';
import ProgressCell from '../components/ProgressCell';
import { baht, formatDate, splitTotals, applyFiltersAndSort } from '../format';
import FilterBar from '../components/FilterBar';

export default function PerpetualDashboard() {
    const { year } = useYear();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [sortBy, setSortBy] = useState('project_code');
    const [typeFilter, setTypeFilter] = useState('All');

    useEffect(() => {
        setLoading(true);
        api.get(`/dashboards/perpetual-ma?year=${year}`)
            .then(r => setRows(r.data.rows))
            .finally(() => setLoading(false));
    }, [year]);

    const filtered = useMemo(() => {
        const typed = typeFilter === 'All' ? rows : rows.filter(r => r.item_type === typeFilter);
        return applyFiltersAndSort(typed, {
            search, status, sortBy,
            revenueField: 'revenue',
            searchFields: ['project_code', 'description', 'customer', 'item_name']
        });
    }, [rows, search, status, sortBy, typeFilter]);

    const t = splitTotals(filtered, 'revenue');

    return (
        <div className="space-y-5">
            <DashboardHeader
                title={`Perpetual License / Software MA · ${year}`}
                subtitle="License recognized 100% in start year; MA pro-rated by contract days."
                tiles={[
                    { label: 'Pipeline · Rec. Revenue', value: t.pipelineRev, accent: 'amber' },
                    { label: 'Pipeline · Rec. Gross Margin', value: t.pipelineGm, accent: 'rose' },
                    { label: 'Win · Rec. Revenue', value: t.winRev, accent: 'green' },
                    { label: 'Win · Rec. Gross Margin', value: t.winGm, accent: 'blue' }
                ]} />

            <FilterBar
                search={search} onSearchChange={setSearch}
                searchPlaceholder="Search code / description / customer / item name..."
                status={status} onStatusChange={setStatus}
                sortBy={sortBy} onSortByChange={setSortBy}>
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
            </FilterBar>

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
