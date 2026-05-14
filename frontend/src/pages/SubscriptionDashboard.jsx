import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { useYear } from '../YearContext';
import { useAuth, isAdmin } from '../auth';
import StatusPill from '../components/StatusPill';
import DashboardHeader from '../components/DashboardHeader';
import ProgressCell from '../components/ProgressCell';
import { baht, formatDate, splitTotals, applyFiltersAndSort } from '../format';
import FilterBar from '../components/FilterBar';
import CopyProjectModal from '../components/CopyProjectModal';
import CustomerLicensesModal from '../components/CustomerLicensesModal';
import { DocumentDuplicateIcon, KeyIcon } from '@heroicons/react/24/outline';

export default function SubscriptionDashboard() {
    const { year } = useYear();
    const { user } = useAuth();
    const canCopy = isAdmin(user);

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [sortBy, setSortBy] = useState('project_code');
    const [copySourceId, setCopySourceId] = useState(null);
    const [licensesCustomerId, setLicensesCustomerId] = useState(null);

    function reload() {
        setLoading(true);
        api.get(`/dashboards/subscriptions?year=${year}`)
            .then(r => setRows(r.data.rows))
            .finally(() => setLoading(false));
    }
    useEffect(() => { reload(); }, [year]);

    const filtered = useMemo(() => applyFiltersAndSort(rows, {
        search, status, sortBy,
        revenueField: 'license_revenue',
        searchFields: ['project_code', 'description', 'customer']
    }), [rows, search, status, sortBy]);

    const t = splitTotals(filtered, 'license_revenue');

    return (
        <div className="space-y-5">
            <DashboardHeader
                title={`Subscription License · ${year}`}
                subtitle="Pro-rata recognition based on contract days falling in the selected year."
                tiles={[
                    { label: 'Pipeline · Rec. Revenue', value: t.pipelineRev, accent: 'amber' },
                    { label: 'Pipeline · Rec. Gross Margin', value: t.pipelineGm, accent: 'rose' },
                    { label: 'Win · Rec. Revenue', value: t.winRev, accent: 'green' },
                    { label: 'Win · Rec. Gross Margin', value: t.winGm, accent: 'blue' }
                ]} />

            <FilterBar
                search={search} onSearchChange={setSearch}
                searchPlaceholder="Search by code / description / customer..."
                status={status} onStatusChange={setStatus}
                sortBy={sortBy} onSortByChange={setSortBy} />

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead>
                        <tr>
                            <th>Code</th>
                            {canCopy && <th className="w-12"></th>}
                            <th>Description</th><th>Customer</th><th>Status</th>
                            <th className="text-center">Licenses</th><th>Period</th>
                            <th className="text-right">Revenue</th><th className="text-right">Cost</th><th className="text-right">GM</th>
                            <th className="min-w-[150px]">% Recognize</th>
                            <th className="text-right">Rec. Revenue</th><th className="text-right">Rec. GM</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={canCopy ? 13 : 12} className="text-center py-10 text-slate-400 animate-pulse">Loading...</td></tr>}
                        {!loading && filtered.length === 0 && <tr><td colSpan={canCopy ? 13 : 12} className="text-center py-10 text-slate-400">No data</td></tr>}
                        {filtered.map(r => (
                            <tr key={r.project_id}>
                                <td className="font-mono text-xs font-semibold text-indigo-600">{r.project_code}</td>
                                {canCopy && (
                                    <td>
                                        <button type="button"
                                                className="btn-ghost !p-1 !h-7"
                                                title="Copy this project (creates DUM-prefixed dummy with dates +1 year)"
                                                onClick={() => setCopySourceId(r.project_id)}>
                                            <DocumentDuplicateIcon className="w-4 h-4 text-indigo-500" />
                                        </button>
                                    </td>
                                )}
                                <td className="max-w-[240px] truncate" title={r.description}>{r.description}</td>
                                <td className="font-medium">{r.customer || '-'}</td>
                                <td><StatusPill status={r.status} /></td>
                                <td className="text-center">
                                    {r.customer_id ? (
                                        <button type="button"
                                                className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-50 hover:bg-indigo-100 hover:scale-110 active:scale-95 ring-1 ring-indigo-200 text-indigo-700 transition shadow-sm"
                                                title={`View licenses of ${r.customer || 'this customer'}`}
                                                onClick={() => setLicensesCustomerId(r.customer_id)}>
                                            <KeyIcon className="w-5 h-5" />
                                        </button>
                                    ) : (
                                        <span className="text-slate-300" title="No customer">—</span>
                                    )}
                                </td>
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
                                <td colSpan={canCopy ? 7 : 6} className="text-right font-bold">Totals</td>
                                <td className="text-right tabular-nums font-bold">{baht(t.gross)}</td>
                                <td colSpan={3}></td>
                                <td className="text-right tabular-nums font-extrabold text-emerald-700">{baht(t.totalRev)}</td>
                                <td className="text-right tabular-nums font-extrabold text-indigo-700">{baht(t.totalGm)}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {copySourceId && (
                <CopyProjectModal
                    sourceProjectId={copySourceId}
                    onClose={() => setCopySourceId(null)}
                    onCreated={() => { setCopySourceId(null); reload(); }}
                />
            )}

            {licensesCustomerId && (
                <CustomerLicensesModal
                    customerId={licensesCustomerId}
                    onClose={() => setLicensesCustomerId(null)}
                />
            )}
        </div>
    );
}
