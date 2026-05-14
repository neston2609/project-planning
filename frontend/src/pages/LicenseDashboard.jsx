import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import HoverImage from '../components/HoverImage';
import Modal from '../components/Modal';
import { formatDate } from '../format';
import {
    BuildingOffice2Icon, ExclamationTriangleIcon, ClockIcon,
    MagnifyingGlassIcon, KeyIcon, EnvelopeIcon, PhoneIcon, BriefcaseIcon
} from '@heroicons/react/24/outline';

/**
 * License Dashboard (user-visible).
 *
 * Pulls a per-customer aggregation from /api/licenses/dashboard. For each
 * customer with at least one license, shows totals + flags expired /
 * expiring-soon (within configurable threshold; default 30 days).
 *
 * Color rules:
 *   - red   row: customer has at least one expired license
 *   - amber row: customer has at least one expiring-soon license (and none expired)
 *
 * Click a row → drill-in modal with the customer info card on top + each
 * license listed below.
 */
export default function LicenseDashboard() {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch]   = useState('');
    const [drillId, setDrillId] = useState(null);

    function reload() {
        setLoading(true);
        api.get('/licenses/dashboard')
            .then(r => setData(r.data))
            .finally(() => setLoading(false));
    }
    useEffect(() => { reload(); }, []);

    const filtered = useMemo(() => {
        if (!data) return [];
        const q = search.trim().toLowerCase();
        let out = data.customers;
        if (q) {
            out = out.filter(c =>
                (c.alias || '').toLowerCase().includes(q) ||
                (c.full_name || '').toLowerCase().includes(q) ||
                (c.account_manager || '').toLowerCase().includes(q)
            );
        }
        // Sort: red first, then yellow, then green; alpha tie-break.
        return [...out].sort((a, b) => {
            const ra = a.expired_count > 0 ? 0 : (a.expiring_soon_count > 0 ? 1 : 2);
            const rb = b.expired_count > 0 ? 0 : (b.expiring_soon_count > 0 ? 1 : 2);
            return ra - rb || (a.alias || '').localeCompare(b.alias || '');
        });
    }, [data, search]);

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-3xl font-extrabold">
                    <span className="brand-mark">License Dashboard</span>
                </h1>
                {data && (
                    <p className="text-sm text-slate-500 mt-1">
                        Threshold for "Expiring Soon" is <strong>{data.threshold_days} days</strong>.
                        Configure in Admin → App Config.
                    </p>
                )}
            </div>

            {/* ------ Top widgets ------ */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Widget loading={loading} icon={BuildingOffice2Icon}
                        label="Total Customers" value={data?.totals?.total_customers ?? 0}
                        accentBg="bg-indigo-100" accentFg="text-indigo-700" />
                <Widget loading={loading} icon={ExclamationTriangleIcon}
                        label="Customers w/ Expired License" value={data?.totals?.customers_with_expired ?? 0}
                        accentBg="bg-red-100" accentFg="text-red-700" />
                <Widget loading={loading} icon={ClockIcon}
                        label="Customers w/ Expiring Soon" value={data?.totals?.customers_with_expiring_soon ?? 0}
                        accentBg="bg-amber-100" accentFg="text-amber-700" />
            </div>

            {/* ------ Filter bar ------ */}
            <div className="card p-3 flex items-center gap-2">
                <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
                <input className="input !border-0 !bg-transparent !p-0 focus:!ring-0 flex-1"
                       placeholder="Search customer / account manager..."
                       value={search} onChange={e => setSearch(e.target.value)} />
                <span className="text-xs text-slate-500">
                    {filtered.length} {filtered.length === 1 ? 'customer' : 'customers'}
                </span>
            </div>

            {/* ------ Table ------ */}
            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr>
                        <th></th>
                        <th>Customer</th>
                        <th className="text-center">Licenses</th>
                        <th>Latest Start</th>
                        <th>Latest Expired</th>
                        <th className="text-right">Expired</th>
                        <th className="text-right">Expiring Soon</th>
                    </tr></thead>
                    <tbody>
                        {loading && <tr><td colSpan={7} className="text-center py-10 text-slate-400 animate-pulse">Loading...</td></tr>}
                        {!loading && filtered.length === 0 && (
                            <tr><td colSpan={7} className="text-center py-10 text-slate-400">No customers with licenses.</td></tr>
                        )}
                        {filtered.map(c => (
                            <DashboardRow key={c.customer_id} c={c} onOpen={() => setDrillId(c.customer_id)} />
                        ))}
                    </tbody>
                </table>
            </div>

            {drillId && <DrillInModal customerId={drillId} onClose={() => setDrillId(null)} />}
        </div>
    );
}

function Widget({ loading, icon: Icon, label, value, accentBg, accentFg }) {
    return (
        <div className="card p-4 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${accentBg} ${accentFg}`}>
                <Icon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
                <div className={`text-2xl font-extrabold tabular-nums ${accentFg}`}>
                    {loading ? '…' : value}
                </div>
            </div>
        </div>
    );
}

function DashboardRow({ c, onOpen }) {
    const expired = c.expired_count > 0;
    const soon    = !expired && c.expiring_soon_count > 0;
    const rowCls  = expired
        ? 'bg-red-50 hover:bg-red-100 border-l-4 border-red-500 cursor-pointer'
        : soon
            ? 'bg-amber-50 hover:bg-amber-100 border-l-4 border-amber-500 cursor-pointer'
            : 'hover:bg-slate-50 cursor-pointer';
    return (
        <tr className={rowCls} onClick={onOpen}>
            <td>
                <HoverImage previewSrc={c.logo_data} previewAlt={c.alias} previewSize={320}>
                    {c.logo_data
                        ? <img src={c.logo_data} alt={c.alias}
                               className="w-9 h-9 rounded-lg object-contain border border-slate-200 bg-white" />
                        : <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                               style={{ backgroundColor: c.color_hex }}>
                              {(c.alias || '').slice(0, 2).toUpperCase()}
                          </div>}
                </HoverImage>
            </td>
            <td>
                <div className="font-semibold">{c.alias}</div>
                <div className="text-xs text-slate-500 truncate max-w-[260px]">{c.full_name}</div>
            </td>
            <td className="text-center">
                <button type="button"
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-50 hover:bg-indigo-100 hover:scale-110 active:scale-95 ring-1 ring-indigo-200 text-indigo-700 transition shadow-sm"
                        title={`View ${c.total_licenses} license${c.total_licenses === 1 ? '' : 's'}`}
                        onClick={(e) => { e.stopPropagation(); onOpen(); }}>
                    <KeyIcon className="w-5 h-5" />
                </button>
            </td>
            <td className="text-xs text-slate-600 whitespace-nowrap">{formatDate(c.latest_start_date) || '—'}</td>
            <td className="text-xs text-slate-600 whitespace-nowrap">{formatDate(c.latest_expired_date) || '—'}</td>
            <td className="text-right tabular-nums">
                {c.expired_count > 0
                    ? <span className="pill bg-red-100 text-red-700 ring-red-200 inline-flex items-center gap-1">
                          <ExclamationTriangleIcon className="w-3 h-3" /> {c.expired_count}
                      </span>
                    : <span className="text-slate-400">0</span>}
            </td>
            <td className="text-right tabular-nums">
                {c.expiring_soon_count > 0
                    ? <span className="pill bg-amber-100 text-amber-700 ring-amber-200 inline-flex items-center gap-1">
                          <ClockIcon className="w-3 h-3" /> {c.expiring_soon_count}
                      </span>
                    : <span className="text-slate-400">0</span>}
            </td>
        </tr>
    );
}

// ---------- Drill-in modal: customer info on top + license details below ----------

function DrillInModal({ customerId, onClose }) {
    const [data, setData]   = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.get(`/licenses/customer/${customerId}`)
            .then(r => setData(r.data))
            .finally(() => setLoading(false));
    }, [customerId]);

    const customer = data?.customer;
    const licenses = data?.licenses || [];
    const today    = data?.today || new Date().toISOString().slice(0, 10);
    const threshold= data?.threshold_days ?? 30;

    function classify(l) {
        if (!l.expired_date) return 'ok';
        if (l.expired_date < today) return 'expired';
        const diffDays = Math.ceil((new Date(l.expired_date) - new Date(today)) / 86_400_000);
        return diffDays <= threshold ? 'soon' : 'ok';
    }

    return (
        <Modal open onClose={onClose} size="xl"
               title={customer ? `${customer.alias} — License Details` : 'License Details'}
               footer={<button className="btn-primary" onClick={onClose}>Close</button>}>
            {loading || !customer ? (
                <p className="text-slate-500 animate-pulse">Loading...</p>
            ) : (
                <div className="space-y-4">
                    {/* Customer info card */}
                    <div className="card p-5 bg-gradient-to-br from-indigo-50/40 to-pink-50/40">
                        <div className="flex items-start gap-4">
                            <HoverImage previewSrc={customer.logo_data} previewAlt={customer.alias} previewSize={320}>
                                {customer.logo_data
                                    ? <img src={customer.logo_data} alt={customer.alias}
                                           className="w-20 h-20 rounded-xl object-contain border-2 border-white shadow bg-white" />
                                    : <div className="w-20 h-20 rounded-xl flex items-center justify-center text-white text-xl font-bold shadow"
                                           style={{ backgroundColor: customer.color_hex || '#6366f1' }}>
                                          {(customer.alias || '').slice(0, 2).toUpperCase()}
                                      </div>}
                            </HoverImage>
                            <div className="flex-1 min-w-0">
                                <div className="text-2xl font-extrabold">{customer.alias}</div>
                                {customer.full_name && (
                                    <div className="text-sm text-slate-600 truncate">{customer.full_name}</div>
                                )}
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600">
                                    {customer.account_manager && (
                                        <div className="flex items-center gap-1.5">
                                            <BriefcaseIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                            <span className="uppercase tracking-wider text-slate-400">AM:</span>
                                            <span className="font-medium text-slate-700 truncate">{customer.account_manager}</span>
                                        </div>
                                    )}
                                    {customer.contact_email && (
                                        <div className="flex items-center gap-1.5">
                                            <EnvelopeIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <a href={`mailto:${customer.contact_email}`} className="text-indigo-600 hover:underline truncate">{customer.contact_email}</a>
                                        </div>
                                    )}
                                    {customer.contact_name && (
                                        <div className="truncate">Contact: {customer.contact_name}</div>
                                    )}
                                    {customer.contact_phone && (
                                        <div className="flex items-center gap-1.5">
                                            <PhoneIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <span>{customer.contact_phone}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Total Licenses</div>
                                <div className="text-3xl font-extrabold text-indigo-700 tabular-nums">{licenses.length}</div>
                            </div>
                        </div>
                    </div>

                    {/* License table */}
                    {licenses.length === 0 ? (
                        <div className="text-center text-slate-400 py-6">No licenses recorded for this customer.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="table-clean">
                                <thead><tr>
                                    <th>License Name</th><th>Vendor</th>
                                    <th className="text-right">Qty</th>
                                    <th>Start</th><th>Expired</th>
                                    <th>Status</th>
                                    <th>License Key</th><th>Note</th>
                                </tr></thead>
                                <tbody>
                                    {licenses.map(l => {
                                        const cls = classify(l);
                                        const rowCls = cls === 'expired' ? 'bg-red-50' : cls === 'soon' ? 'bg-amber-50' : '';
                                        return (
                                            <tr key={l.id} className={rowCls}>
                                                <td className="font-medium">{l.license_name || <span className="text-slate-400 italic">(no name)</span>}</td>
                                                <td>{l.vendor}</td>
                                                <td className="text-right tabular-nums">{l.quantity}</td>
                                                <td className="text-xs text-slate-600 whitespace-nowrap">{formatDate(l.start_date)}</td>
                                                <td className="text-xs text-slate-600 whitespace-nowrap">{formatDate(l.expired_date)}</td>
                                                <td>
                                                    {cls === 'expired' && (
                                                        <span className="pill bg-red-100 text-red-700 ring-red-200 inline-flex items-center gap-1">
                                                            <ExclamationTriangleIcon className="w-3 h-3" /> Expired
                                                        </span>
                                                    )}
                                                    {cls === 'soon' && (
                                                        <span className="pill bg-amber-100 text-amber-700 ring-amber-200 inline-flex items-center gap-1">
                                                            <ClockIcon className="w-3 h-3" /> Soon
                                                        </span>
                                                    )}
                                                    {cls === 'ok' && l.expired_date && (
                                                        <span className="pill bg-emerald-50 text-emerald-700 ring-emerald-200">Active</span>
                                                    )}
                                                </td>
                                                <td className="font-mono text-[11px] text-slate-500 max-w-[180px] truncate" title={l.license_key}>{l.license_key || '—'}</td>
                                                <td className="text-xs text-slate-500 max-w-[200px] truncate" title={l.note}>{l.note || '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
