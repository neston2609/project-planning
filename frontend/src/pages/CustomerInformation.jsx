import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import HoverImage from '../components/HoverImage';
import { useYear } from '../YearContext';
import { baht } from '../format';
import {
    MagnifyingGlassIcon, EnvelopeIcon, PhoneIcon, UserIcon,
    BanknotesIcon, ClockIcon
} from '@heroicons/react/24/outline';

/**
 * Customer Information
 *
 * Card grid (one card per customer) showing:
 *   - Logo (with hover-zoom preview)
 *   - Alias / full name / contact / email / phone
 *   - Revenue Summary (status=Win projects in the selected year)
 *   - Pipeline Summary (status=Pipeline projects in the selected year)
 *
 * Aggregation: we already have five backend dashboard endpoints that compute
 * `recognize_revenue` / `recognize_gross_margin` per row for the selected year.
 * Each row carries a `customer` field (the alias) and a `status`. We pull all
 * five lists in parallel and group their rows by customer alias.
 */
export default function CustomerInformation() {
    const { year } = useYear();
    const [customers, setCustomers] = useState([]);
    const [aggregates, setAggregates] = useState(new Map()); // alias → AggBucket
    const [loading, setLoading] = useState(true);
    const [search, setSearch]   = useState('');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        Promise.all([
            api.get('/customers'),
            api.get(`/dashboards/subscriptions?year=${year}`),
            api.get(`/dashboards/perpetual-ma?year=${year}`),
            api.get(`/dashboards/service-ma?year=${year}`),
            api.get(`/dashboards/implementation?year=${year}`),
            api.get(`/dashboards/outsource?year=${year}`)
        ]).then(([c, s, p, m, i, o]) => {
            if (cancelled) return;
            setCustomers(c.data);

            const agg = new Map();
            const bucket = () => ({
                winRev: 0, winGm: 0, winProjects: new Set(),
                pipelineRev: 0, pipelineGm: 0, pipelineProjects: new Set()
            });

            const allRows = [
                ...s.data.rows, ...p.data.rows, ...m.data.rows,
                ...i.data.rows, ...o.data.rows
            ];

            for (const r of allRows) {
                const key = r.customer || ''; // empty key = "no customer"
                if (!agg.has(key)) agg.set(key, bucket());
                const b   = agg.get(key);
                const rev = Number(r.recognize_revenue) || 0;
                const gm  = Number(r.recognize_gross_margin) || 0;
                if (r.status === 'Win') {
                    b.winRev += rev;
                    b.winGm  += gm;
                    b.winProjects.add(r.project_id);
                } else if (r.status === 'Pipeline') {
                    b.pipelineRev += rev;
                    b.pipelineGm  += gm;
                    b.pipelineProjects.add(r.project_id);
                }
            }
            setAggregates(agg);
        }).catch(() => {
            if (!cancelled) { setCustomers([]); setAggregates(new Map()); }
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });

        return () => { cancelled = true; };
    }, [year]);

    const filtered = useMemo(() => {
        let out = customers;
        if (search) {
            const q = search.toLowerCase();
            out = out.filter(c =>
                (c.alias         || '').toLowerCase().includes(q) ||
                (c.full_name     || '').toLowerCase().includes(q) ||
                (c.contact_name  || '').toLowerCase().includes(q) ||
                (c.contact_email || '').toLowerCase().includes(q)
            );
        }
        return [...out].sort((a, b) => (a.alias || '').localeCompare(b.alias || ''));
    }, [customers, search]);

    // Top-line totals across all visible customers
    const totals = useMemo(() => {
        const t = { winRev: 0, pipelineRev: 0, winCount: 0, pipelineCount: 0 };
        for (const c of filtered) {
            const a = aggregates.get(c.alias);
            if (!a) continue;
            t.winRev      += a.winRev;
            t.pipelineRev += a.pipelineRev;
            t.winCount      += a.winProjects.size;
            t.pipelineCount += a.pipelineProjects.size;
        }
        return t;
    }, [filtered, aggregates]);

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-3xl font-extrabold">
                    <span className="brand-mark">Customer Information</span> · {year}
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                    {customers.length} {customers.length === 1 ? 'customer' : 'customers'} ·
                    Revenue Summary covers Win projects only.
                </p>
            </div>

            {/* Roll-up tiles for the visible set */}
            {!loading && filtered.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="card p-4 flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                            <BanknotesIcon className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Revenue Summary (Win)</div>
                            <div className="text-2xl font-extrabold tabular-nums text-emerald-700 truncate">{baht(totals.winRev)}</div>
                            <div className="text-xs text-slate-500">{totals.winCount} {totals.winCount === 1 ? 'project' : 'projects'}</div>
                        </div>
                    </div>
                    <div className="card p-4 flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                            <ClockIcon className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Pipeline Summary</div>
                            <div className="text-2xl font-extrabold tabular-nums text-amber-700 truncate">{baht(totals.pipelineRev)}</div>
                            <div className="text-xs text-slate-500">{totals.pipelineCount} {totals.pipelineCount === 1 ? 'project' : 'projects'}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Search bar */}
            <div className="card p-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                    <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
                    <input className="input !border-0 !bg-transparent !p-0 focus:!ring-0 flex-1"
                        placeholder="Search by alias / full name / contact / email..."
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>
            </div>

            {/* Cards grid */}
            {loading ? (
                <p className="text-slate-500 animate-pulse">Loading...</p>
            ) : filtered.length === 0 ? (
                <p className="text-slate-500">No customers match your filter.</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filtered.map(c => (
                        <CustomerCard key={c.id} c={c}
                                      agg={aggregates.get(c.alias) || EMPTY_AGG} />
                    ))}
                </div>
            )}
        </div>
    );
}

const EMPTY_AGG = {
    winRev: 0, winGm: 0, winProjects: new Set(),
    pipelineRev: 0, pipelineGm: 0, pipelineProjects: new Set()
};

function CustomerCard({ c, agg }) {
    const initials = (c.alias || '').slice(0, 2).toUpperCase() || '?';
    return (
        <div className="card p-5 fade-in hover:-translate-y-0.5 hover:shadow-lg transition-all">
            <div className="flex items-start gap-4">
                <HoverImage previewSrc={c.logo_data} previewAlt={c.alias} previewSize={320}>
                    {c.logo_data ? (
                        <img src={c.logo_data} alt={c.alias}
                             className="w-16 h-16 rounded-xl object-contain border-2 border-white shadow bg-white" />
                    ) : (
                        <div className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow"
                             style={{ backgroundColor: c.color_hex || '#6366f1' }}>
                            {initials}
                        </div>
                    )}
                </HoverImage>
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 truncate" title={c.full_name || c.alias}>
                        {c.alias}
                    </div>
                    {c.full_name && (
                        <div className="text-xs text-slate-500 truncate">{c.full_name}</div>
                    )}
                    <div className="mt-1 inline-flex items-center gap-1 pill bg-indigo-50 text-indigo-700 ring-indigo-200">
                        <span className="inline-block w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: c.color_hex || '#6366f1' }} />
                        {c.color_hex || '—'}
                    </div>
                </div>
            </div>

            {/* Contact block */}
            <div className="mt-4 space-y-1.5 text-sm">
                {c.contact_name && (
                    <div className="flex items-center gap-2 text-slate-600">
                        <UserIcon className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">{c.contact_name}</span>
                    </div>
                )}
                {c.contact_email && (
                    <div className="flex items-center gap-2 text-slate-600 min-w-0">
                        <EnvelopeIcon className="w-4 h-4 text-slate-400 shrink-0" />
                        <a href={`mailto:${c.contact_email}`} className="truncate text-indigo-600 hover:underline">
                            {c.contact_email}
                        </a>
                    </div>
                )}
                {c.contact_phone && (
                    <div className="flex items-center gap-2 text-slate-600">
                        <PhoneIcon className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">{c.contact_phone}</span>
                    </div>
                )}
                {!c.contact_name && !c.contact_email && !c.contact_phone && (
                    <div className="text-xs text-slate-400 italic">No contact information.</div>
                )}
            </div>

            {/* Year summary tiles */}
            <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2.5">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 flex items-center gap-1">
                        <BanknotesIcon className="w-3.5 h-3.5" /> Revenue (Win)
                    </div>
                    <div className="text-base font-extrabold tabular-nums text-emerald-900 mt-1 truncate"
                         title={baht(agg.winRev)}>
                        {baht(agg.winRev)}
                    </div>
                    <div className="text-[10px] text-emerald-700/70 mt-0.5 truncate"
                         title={`Recognize Gross Margin ${baht(agg.winGm)}`}>
                        GM {baht(agg.winGm)} · {agg.winProjects.size} {agg.winProjects.size === 1 ? 'project' : 'projects'}
                    </div>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-2.5">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-amber-700 flex items-center gap-1">
                        <ClockIcon className="w-3.5 h-3.5" /> Pipeline
                    </div>
                    <div className="text-base font-extrabold tabular-nums text-amber-900 mt-1 truncate"
                         title={baht(agg.pipelineRev)}>
                        {baht(agg.pipelineRev)}
                    </div>
                    <div className="text-[10px] text-amber-700/70 mt-0.5 truncate"
                         title={`Recognize Gross Margin ${baht(agg.pipelineGm)}`}>
                        GM {baht(agg.pipelineGm)} · {agg.pipelineProjects.size} {agg.pipelineProjects.size === 1 ? 'project' : 'projects'}
                    </div>
                </div>
            </div>
        </div>
    );
}
