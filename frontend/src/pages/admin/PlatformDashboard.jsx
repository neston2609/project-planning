import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import { baht } from '../../format';
import {
    PresentationChartLineIcon, FlagIcon, BanknotesIcon,
    BuildingOffice2Icon, CalendarDaysIcon
} from '@heroicons/react/24/outline';

/**
 * BSM Dashboard — cross-tenant revenue summary.
 * Visible to BOTH 'tenantadmin' and 'tenantuser' (read-only).
 */
export default function PlatformDashboard() {
    const cur = new Date().getFullYear();
    const [year, setYear]   = useState(cur);
    const [data, setData]   = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.get(`/platform/dashboard?year=${year}`)
            .then(r => setData(r.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [year]);

    const tenants = data?.tenants || [];
    const g       = data?.grand_totals || {};
    const years   = useMemo(() => {
        const a = []; for (let y = cur - 3; y <= cur + 3; y++) a.push(y); return a;
    }, [cur]);
    const reachedPct = g.target_revenue > 0
        ? Math.min(100, (g.total_revenue / g.target_revenue) * 100) : 0;

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-extrabold">
                    <span className="brand-mark">BSM Dashboard</span> · {year}
                </h1>
                <span className="text-xs text-slate-500">
                    Revenue rolled up across every team (tenant).
                </span>
                <div className="ml-auto flex items-center gap-2">
                    <CalendarDaysIcon className="w-5 h-5 text-indigo-500" />
                    <label className="text-sm text-slate-600">Year</label>
                    <select className="input !w-24 !py-1.5 font-semibold !text-indigo-700"
                            value={year} onChange={e => setYear(Number(e.target.value))}>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button className="btn-ghost !py-1.5"
                            disabled={year === cur}
                            onClick={() => setYear(cur)}>
                        This Year
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Widget label="Teams" value={tenants.length}
                        icon={BuildingOffice2Icon} accentBg="bg-indigo-100" accentFg="text-indigo-700" />
                <Widget label="Recognized Revenue" value={baht(g.total_revenue || 0)}
                        icon={PresentationChartLineIcon} accentBg="bg-emerald-100" accentFg="text-emerald-700" />
                <Widget label="Target Revenue" value={baht(g.target_revenue || 0)}
                        icon={FlagIcon} accentBg="bg-violet-100" accentFg="text-violet-700" />
                <Widget label={g.remaining_gap > 0 ? 'Remaining' : 'Surplus'}
                        value={baht(g.remaining_gap || 0)}
                        icon={BanknotesIcon}
                        accentBg={g.remaining_gap > 0 ? 'bg-amber-100' : 'bg-emerald-100'}
                        accentFg={g.remaining_gap > 0 ? 'text-amber-700'  : 'text-emerald-700'} />
            </div>

            {/* Progress bar */}
            <div className="card p-5">
                <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-slate-700">Progress to platform target</div>
                    <div className="text-sm tabular-nums font-bold text-indigo-600">{reachedPct.toFixed(1)}%</div>
                </div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                         style={{ width: `${reachedPct}%`, backgroundImage: 'var(--grad-brand)' }} />
                </div>
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr>
                        <th>Team</th>
                        <th className="text-right">Pipeline License (GM)</th>
                        <th className="text-right">Pipeline Service (Rev)</th>
                        <th className="text-right">Win License (GM)</th>
                        <th className="text-right">Win Service (Rev)</th>
                        <th className="text-right">Total</th>
                        <th className="text-right">Target</th>
                        <th className="text-right">Gap</th>
                    </tr></thead>
                    <tbody>
                        {loading && <tr><td colSpan={8} className="text-center py-10 text-slate-400 animate-pulse">Loading...</td></tr>}
                        {!loading && tenants.length === 0 && (
                            <tr><td colSpan={8} className="text-center py-10 text-slate-400">No tenants yet.</td></tr>
                        )}
                        {tenants.map(t => (
                            <tr key={t.tenant_id}>
                                <td>
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                                             style={{ backgroundImage: 'var(--grad-brand)' }}>
                                            <BuildingOffice2Icon className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <Link className="font-semibold text-indigo-700 hover:text-indigo-900 hover:underline"
                                                  to={`/project-summary?tenant_id=${t.tenant_id}&year=${year}`}>
                                                {t.tenant_name}
                                            </Link>
                                            <div className="text-[10px] text-slate-400">
                                                HC {t.headcount} × {baht(t.revenue_per_headcount)}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="text-right tabular-nums">{baht(t.pipeline_license_revenue)}</td>
                                <td className="text-right tabular-nums">{baht(t.pipeline_service_revenue)}</td>
                                <td className="text-right tabular-nums">{baht(t.backlog_win_license_revenue)}</td>
                                <td className="text-right tabular-nums">{baht(t.backlog_win_service_revenue)}</td>
                                <td className="text-right tabular-nums font-bold text-emerald-700">{baht(t.total_revenue)}</td>
                                <td className="text-right tabular-nums text-slate-500">{baht(t.target_revenue)}</td>
                                <td className="text-right tabular-nums">
                                    {t.remaining_gap > 0
                                        ? <span className="text-amber-700 font-semibold">{baht(t.remaining_gap)}</span>
                                        : <span className="text-emerald-700 font-semibold">— met —</span>}
                                </td>
                            </tr>
                        ))}
                        {!loading && tenants.length > 0 && (
                            <tr className="bg-gradient-to-r from-indigo-50 to-pink-50 sticky bottom-0">
                                <td className="font-bold">Grand Total</td>
                                <td className="text-right tabular-nums font-bold">{baht(g.pipeline_license_revenue)}</td>
                                <td className="text-right tabular-nums font-bold">{baht(g.pipeline_service_revenue)}</td>
                                <td className="text-right tabular-nums font-bold">{baht(g.backlog_win_license_revenue)}</td>
                                <td className="text-right tabular-nums font-bold">{baht(g.backlog_win_service_revenue)}</td>
                                <td className="text-right tabular-nums font-extrabold text-emerald-700">{baht(g.total_revenue)}</td>
                                <td className="text-right tabular-nums font-extrabold text-violet-700">{baht(g.target_revenue)}</td>
                                <td className="text-right tabular-nums font-extrabold text-indigo-700">{baht(g.remaining_gap)}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Widget({ icon: Icon, label, value, accentBg, accentFg }) {
    return (
        <div className="card p-4 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${accentBg} ${accentFg}`}>
                <Icon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
                <div className={`text-2xl font-extrabold tabular-nums truncate ${accentFg}`}>{value}</div>
            </div>
        </div>
    );
}
