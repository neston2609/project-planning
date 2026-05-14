import { useEffect, useState } from 'react';
import api from '../api';
import Modal from './Modal';
import HoverImage from './HoverImage';
import { formatDate } from '../format';
import {
    ExclamationTriangleIcon, ClockIcon,
    EnvelopeIcon, PhoneIcon, BriefcaseIcon
} from '@heroicons/react/24/outline';

/**
 * CustomerLicensesModal
 *
 * Drill-in popup that fetches /api/licenses/customer/:id and renders the
 * customer info card on top + the customer's full license table below.
 *
 * Used by:
 *  - License Dashboard (per-row drill-in)
 *  - Subscription Dashboard (License icon column)
 */
export default function CustomerLicensesModal({ customerId, onClose }) {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!customerId) return;
        setLoading(true);
        api.get(`/licenses/customer/${customerId}`)
            .then(r => setData(r.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [customerId]);

    const customer  = data?.customer;
    const licenses  = data?.licenses || [];
    const today     = data?.today || new Date().toISOString().slice(0, 10);
    const threshold = data?.threshold_days ?? 30;

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
