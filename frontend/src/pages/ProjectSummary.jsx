import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api';
import { useYear } from '../YearContext';
import { useAuth, isPlatformRole } from '../auth';
import { baht, formatDate, pct } from '../format';
import StatusPill from '../components/StatusPill';
import {
    BuildingOffice2Icon, CalendarDaysIcon, MagnifyingGlassIcon,
    PresentationChartLineIcon
} from '@heroicons/react/24/outline';

const moneyCols = [
    'software_subscription_revenue',
    'software_subscription_cost',
    'software_subscription_margin',
    'software_perpetual_revenue',
    'software_perpetual_cost',
    'software_perpetual_margin',
    'software_ma_revenue',
    'software_ma_cost',
    'software_ma_margin',
    'service_ma_revenue',
    'implementation_revenue',
    'total_recognized'
];

export default function ProjectSummary() {
    const { user } = useAuth();
    const location = useLocation();
    const platform = isPlatformRole(user);
    const globalYear = useYear();
    const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const queryYear = Number(query.get('year'));
    const queryTenantId = Number(query.get('tenant_id'));
    const [year, setYear] = useState(globalYear.year);
    const [tenants, setTenants] = useState([]);
    const [tenantId, setTenantId] = useState(user?.tenant_id || '');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');

    const cur = new Date().getFullYear();
    const years = useMemo(() => {
        const out = [];
        for (let y = cur - 3; y <= cur + 3; y++) out.push(y);
        return out;
    }, [cur]);

    useEffect(() => {
        if (Number.isInteger(queryYear) && queryYear > 1900) {
            setYear(queryYear);
            if (!platform) globalYear.setYear(queryYear);
        }
        if (platform && Number.isInteger(queryTenantId) && queryTenantId > 0) {
            setTenantId(queryTenantId);
        }
    }, [queryYear, queryTenantId, platform]);

    useEffect(() => {
        if (!platform) {
            setYear(globalYear.year);
            return;
        }
        api.get('/auth/tenants')
            .then(r => {
                setTenants(r.data || []);
                if (!tenantId && r.data?.[0]) setTenantId(r.data[0].id);
            })
            .catch(() => setTenants([]));
    }, [platform, globalYear.year]);

    useEffect(() => {
        if (platform && !tenantId) return;
        setLoading(true);
        const tenantQuery = platform ? `&tenant_id=${tenantId}` : '';
        api.get(`/project-summary?year=${year}${tenantQuery}`)
            .then(r => setData(r.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [year, tenantId, platform]);

    const rows = useMemo(() => {
        let out = data?.rows || [];
        if (status !== 'all') {
            if (status === 'Win') out = out.filter(r => r.status === 'Win' || r.status === 'Backlog');
            else out = out.filter(r => r.status === status);
        }
        if (search) {
            const q = search.toLowerCase();
            out = out.filter(r =>
                (r.project_code || '').toLowerCase().includes(q) ||
                (r.project_description || '').toLowerCase().includes(q) ||
                (r.customer || '').toLowerCase().includes(q)
            );
        }
        return [...out].sort((a, b) => (a.project_code || '').localeCompare(b.project_code || ''));
    }, [data, search, status]);

    const filteredTotals = useMemo(() => {
        const t = {};
        for (const col of moneyCols) t[col] = 0;
        for (const r of rows) {
            for (const col of moneyCols) t[col] += Number(r[col] || 0);
            t.software_subscription_recognize = Number(t.software_subscription_recognize || 0) + Number(r.software_subscription_recognize || 0);
            t.software_ma_recognize = Number(t.software_ma_recognize || 0) + Number(r.software_ma_recognize || 0);
            t.service_ma_recognize = Number(t.service_ma_recognize || 0) + Number(r.service_ma_recognize || 0);
            t.implementation_recognize = Number(t.implementation_recognize || 0) + Number(r.implementation_recognize || 0);
        }
        t.software_subscription_recognize_pct = ratio(t.software_subscription_recognize, t.software_subscription_margin);
        t.software_ma_recognize_pct = ratio(t.software_ma_recognize, t.software_ma_margin);
        t.service_ma_recognize_pct = ratio(t.service_ma_recognize, t.service_ma_revenue);
        t.implementation_recognize_pct = ratio(t.implementation_recognize, t.implementation_revenue);
        return t;
    }, [rows]);

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-extrabold">
                    <span className="brand-mark">Project Summary</span> · {year}
                </h1>
                <span className="text-xs text-slate-500">
                    Project-level recognized totals aligned with Summary.
                </span>
                <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
                    {platform && (
                        <div className="flex items-center gap-2">
                            <BuildingOffice2Icon className="w-5 h-5 text-indigo-500" />
                            <select className="input !w-56 !py-1.5 font-semibold !text-indigo-700"
                                    value={tenantId}
                                    onChange={e => setTenantId(Number(e.target.value))}>
                                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <CalendarDaysIcon className="w-5 h-5 text-indigo-500" />
                        <select className="input !w-24 !py-1.5 font-semibold !text-indigo-700"
                                value={year}
                                onChange={e => {
                                    const next = Number(e.target.value);
                                    setYear(next);
                                    if (!platform) globalYear.setYear(next);
                                }}>
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <button className="btn-ghost !py-1.5"
                                disabled={year === cur}
                                onClick={() => {
                                    setYear(cur);
                                    if (!platform) globalYear.setYear(cur);
                                }}>
                            This Year
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Metric label="Projects" value={rows.length} />
                <Metric label="Tenant" value={data?.tenant?.name || '-'} />
                <Metric label="Total Recognized" value={baht(filteredTotals.total_recognized)} accent="text-emerald-700" />
            </div>

            <div className="card p-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                    <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
                    <input className="input !border-0 !bg-transparent !p-0 focus:!ring-0 flex-1"
                           placeholder="Search project code / description / customer..."
                           value={search}
                           onChange={e => setSearch(e.target.value)} />
                </div>
                <select className="input !w-40" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="all">All status</option>
                    <option value="Pipeline">Pipeline</option>
                    <option value="Win">Win / Backlog</option>
                </select>
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean min-w-[2200px]">
                    <thead>
                        <tr>
                            <th>Project Code</th>
                            <th>Project Description</th>
                            <th>Customer</th>
                            <th>Status</th>
                            <th>Start Date - End Date</th>
                            <th className="text-right">Software Subscription Revenue</th>
                            <th className="text-right">Software Subscription Cost</th>
                            <th className="text-right">Software Subscription Margin</th>
                            <th className="text-right">Software Subscription Recognize</th>
                            <th className="text-right">Software Perpetual Revenue</th>
                            <th className="text-right">Software Perpetual Cost</th>
                            <th className="text-right">Software Perpetual Margin</th>
                            <th className="text-right">Software MA Revenue</th>
                            <th className="text-right">Software MA Cost</th>
                            <th className="text-right">Software MA Margin</th>
                            <th className="text-right">Software MA Recognize</th>
                            <th className="text-right">Service MA Revenue</th>
                            <th className="text-right">Service MA Recognize</th>
                            <th className="text-right">Implementation / Outsource Revenue</th>
                            <th className="text-right">Implementation / Outsource Recognize</th>
                            <th className="text-right">Total Recognized</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={21} className="text-center py-10 text-slate-400 animate-pulse">Loading...</td></tr>
                        )}
                        {!loading && rows.length === 0 && (
                            <tr><td colSpan={21} className="text-center py-10 text-slate-400">No projects for this year.</td></tr>
                        )}
                        {rows.map(r => (
                            <tr key={r.project_id}>
                                <td className="font-mono text-xs font-semibold text-indigo-600">{r.project_code}</td>
                                <td className="max-w-[280px] truncate" title={r.project_description}>{r.project_description}</td>
                                <td className="font-medium">{r.customer || '-'}</td>
                                <td><StatusPill status={r.status} /></td>
                                <td className="text-xs text-slate-500 whitespace-nowrap">
                                    {formatDate(r.start_date)} - {formatDate(r.end_date)}
                                </td>
                                <Money v={r.software_subscription_revenue} />
                                <Money v={r.software_subscription_cost} muted />
                                <Money v={r.software_subscription_margin} strong />
                                <Recognize amount={r.software_subscription_recognize} value={r.software_subscription_recognize_pct} />
                                <Money v={r.software_perpetual_revenue} />
                                <Money v={r.software_perpetual_cost} muted />
                                <Money v={r.software_perpetual_margin} strong />
                                <Money v={r.software_ma_revenue} />
                                <Money v={r.software_ma_cost} muted />
                                <Money v={r.software_ma_margin} strong />
                                <Recognize amount={r.software_ma_recognize} value={r.software_ma_recognize_pct} />
                                <Money v={r.service_ma_revenue} />
                                <Recognize amount={r.service_ma_recognize} value={r.service_ma_recognize_pct} />
                                <Money v={r.implementation_revenue} />
                                <Recognize amount={r.implementation_recognize} value={r.implementation_recognize_pct} />
                                <Money v={r.total_recognized} total />
                            </tr>
                        ))}
                        {!loading && rows.length > 0 && (
                            <tr className="bg-gradient-to-r from-indigo-50 to-pink-50 sticky bottom-0">
                                <td colSpan={5} className="text-right font-bold">Totals</td>
                                <Money v={filteredTotals.software_subscription_revenue} strong />
                                <Money v={filteredTotals.software_subscription_cost} strong muted />
                                <Money v={filteredTotals.software_subscription_margin} strong />
                                <Recognize amount={filteredTotals.software_subscription_recognize} value={filteredTotals.software_subscription_recognize_pct} total />
                                <Money v={filteredTotals.software_perpetual_revenue} strong />
                                <Money v={filteredTotals.software_perpetual_cost} strong muted />
                                <Money v={filteredTotals.software_perpetual_margin} strong />
                                <Money v={filteredTotals.software_ma_revenue} strong />
                                <Money v={filteredTotals.software_ma_cost} strong muted />
                                <Money v={filteredTotals.software_ma_margin} strong />
                                <Recognize amount={filteredTotals.software_ma_recognize} value={filteredTotals.software_ma_recognize_pct} total />
                                <Money v={filteredTotals.service_ma_revenue} strong />
                                <Recognize amount={filteredTotals.service_ma_recognize} value={filteredTotals.service_ma_recognize_pct} total />
                                <Money v={filteredTotals.implementation_revenue} strong />
                                <Recognize amount={filteredTotals.implementation_recognize} value={filteredTotals.implementation_recognize_pct} total />
                                <Money v={filteredTotals.total_recognized} total />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ratio(amount, base) {
    amount = Number(amount || 0);
    base = Number(base || 0);
    return base === 0 ? 0 : amount / base;
}

function Metric({ label, value, accent = 'text-indigo-700' }) {
    return (
        <div className="card p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-indigo-100 text-indigo-700">
                <PresentationChartLineIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
                <div className={`text-xl font-extrabold tabular-nums truncate ${accent}`}>{value}</div>
            </div>
        </div>
    );
}

function Money({ v, muted, strong, total }) {
    const cls = total
        ? 'font-extrabold text-emerald-700'
        : strong
          ? 'font-bold text-slate-800'
          : muted
            ? 'text-slate-500'
            : '';
    return <td className={`text-right tabular-nums ${cls}`}>{baht(v)}</td>;
}

function Recognize({ amount, value, total }) {
    return (
        <td className={`text-right tabular-nums ${total ? 'font-extrabold text-indigo-700' : 'font-bold text-indigo-700'}`}>
            {baht(amount)} <span className="text-xs text-slate-500">({pct(value)})</span>
        </td>
    );
}
