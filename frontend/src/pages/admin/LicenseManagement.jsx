import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import HoverImage from '../../components/HoverImage';
import ImportLicensePdfModal from '../../components/ImportLicensePdfModal';
import { formatDate } from '../../format';
import {
    PencilSquareIcon, TrashIcon, PlusIcon, MagnifyingGlassIcon,
    KeyIcon, ClockIcon, ExclamationTriangleIcon, DocumentArrowUpIcon,
    ForwardIcon, ChevronDoubleRightIcon
} from '@heroicons/react/24/outline';

/** Shift a YYYY-MM-DD date string forward by N years. Returns '' for empty input.
 *  Clamps Feb 29 to Feb 28 in non-leap years. */
function addYears(dateStr, years = 1) {
    if (!dateStr) return '';
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    let y = Number(m[1]) + Number(years);
    let mo = Number(m[2]);
    let d = Number(m[3]);
    if (mo === 2 && d === 29) {
        const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
        if (!isLeap) d = 28;
    }
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const addOneYear = (s) => addYears(s, 1);

/**
 * Admin → License Management
 *
 * Layout: customer picker on the left (search + cards), license list on the right.
 * Selecting a customer pulls their licenses; admin can Add/Edit/Delete/Extend.
 * License names may repeat within one customer (per spec).
 */
export default function LicenseManagement() {
    const [customers, setCustomers] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(null);
    const [licenses, setLicenses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [edit, setEdit] = useState(null);
    const [extend, setExtend] = useState(null);
    const [extendAll, setExtendAll] = useState(false);
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        api.get('/customers').then(r => setCustomers(r.data));
    }, []);

    function loadCustomerLicenses(cid) {
        if (!cid) { setLicenses([]); return; }
        setLoading(true);
        api.get(`/licenses?customer_id=${cid}`)
            .then(r => setLicenses(r.data))
            .finally(() => setLoading(false));
    }
    useEffect(() => { loadCustomerLicenses(selectedId); }, [selectedId]);

    const filteredCustomers = useMemo(() => {
        const q = search.trim().toLowerCase();
        let out = customers;
        if (q) {
            out = out.filter(c =>
                (c.alias     || '').toLowerCase().includes(q) ||
                (c.full_name || '').toLowerCase().includes(q) ||
                (c.account_manager || '').toLowerCase().includes(q)
            );
        }
        return [...out].sort((a, b) => (a.alias || '').localeCompare(b.alias || ''));
    }, [customers, search]);

    const selectedCustomer = customers.find(c => c.id === selectedId) || null;

    async function save(payload) {
        try {
            if (payload.id) await api.put(`/licenses/${payload.id}`, payload);
            else            await api.post('/licenses', payload);
            toast.success('Saved');
            setEdit(null);
            loadCustomerLicenses(selectedId);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        }
    }
    async function remove(id) {
        if (!confirm('Delete this license?')) return;
        await api.delete(`/licenses/${id}`);
        toast.success('Deleted');
        loadCustomerLicenses(selectedId);
    }

    async function doExtend({ id, start_date, expired_date }) {
        const cur = licenses.find(l => l.id === id);
        if (!cur) return toast.error('License not found');
        try {
            await api.put(`/licenses/${id}`, {
                customer_id:  cur.customer_id,
                license_name: cur.license_name || '',
                vendor:       cur.vendor       || '',
                quantity:     cur.quantity ?? 1,
                license_key:  cur.license_key  || '',
                note:         cur.note         || '',
                start_date,
                expired_date
            });
            toast.success('License extended');
            setExtend(null);
            loadCustomerLicenses(selectedId);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Extend failed');
        }
    }

    function openNew() {
        if (!selectedId) return toast.error('Select a customer first');
        setEdit({
            customer_id: selectedId,
            license_name: '', vendor: '', quantity: 1,
            license_key: '', note: '',
            start_date: '', expired_date: ''
        });
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">License Management</h1>
                <span className="text-xs text-slate-500">Pick a customer on the left, then add/edit their licenses.</span>
                <button className="btn-ghost ml-auto" onClick={() => setExtendAll(true)}
                        disabled={!selectedId || licenses.length === 0}
                        title="Shift Start Date and Expired Date for all of this customer's licenses">
                    <ChevronDoubleRightIcon className="w-4 h-4 text-emerald-600" /> Extend All
                </button>
                <button className="btn-ghost" onClick={() => setImporting(true)} disabled={!selectedId}
                        title="Parse a License Certificate PDF and import its rows">
                    <DocumentArrowUpIcon className="w-4 h-4" /> Import PDF
                </button>
                <button className="btn-primary" onClick={openNew} disabled={!selectedId}>
                    <PlusIcon className="w-4 h-4" /> New License
                </button>
            </div>

            <div className="grid grid-cols-12 gap-4">
                {/* Customer picker */}
                <div className="col-span-12 md:col-span-4 lg:col-span-3">
                    <div className="card p-3 mb-2 flex items-center gap-2">
                        <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
                        <input className="input !border-0 !bg-transparent !p-0 focus:!ring-0 flex-1"
                               placeholder="Search customer..."
                               value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <div className="card p-1 max-h-[70vh] overflow-y-auto">
                        {filteredCustomers.length === 0 && (
                            <div className="text-xs text-slate-400 italic p-3">No customers match.</div>
                        )}
                        {filteredCustomers.map(c => {
                            const active = c.id === selectedId;
                            return (
                                <button key={c.id} type="button"
                                        onClick={() => setSelectedId(c.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition ${
                                            active ? 'bg-indigo-50 ring-1 ring-indigo-300' : 'hover:bg-slate-50'
                                        }`}>
                                    {c.logo_data
                                        ? <img src={c.logo_data} alt={c.alias}
                                               className="w-8 h-8 rounded-md object-contain border border-slate-200 bg-white" />
                                        : <div className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                               style={{ backgroundColor: c.color_hex }}>
                                              {(c.alias || '').slice(0, 2).toUpperCase()}
                                          </div>}
                                    <div className="min-w-0 flex-1">
                                        <div className={`text-sm font-medium truncate ${active ? 'text-indigo-700' : 'text-slate-700'}`}>{c.alias}</div>
                                        <div className="text-[10px] text-slate-400 truncate">{c.full_name}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* License list */}
                <div className="col-span-12 md:col-span-8 lg:col-span-9">
                    {!selectedCustomer ? (
                        <div className="card p-10 text-center text-slate-400">
                            <KeyIcon className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                            Select a customer to view and manage their licenses.
                        </div>
                    ) : (
                        <>
                            <div className="card p-4 mb-3 flex items-center gap-3">
                                <HoverImage previewSrc={selectedCustomer.logo_data} previewAlt={selectedCustomer.alias} previewSize={320}>
                                    {selectedCustomer.logo_data ? (
                                        <img src={selectedCustomer.logo_data} alt={selectedCustomer.alias}
                                             className="w-12 h-12 rounded-lg object-contain border border-slate-200 bg-white" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold"
                                             style={{ backgroundColor: selectedCustomer.color_hex }}>
                                            {(selectedCustomer.alias || '').slice(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                </HoverImage>
                                <div>
                                    <div className="text-lg font-bold">{selectedCustomer.alias}</div>
                                    <div className="text-xs text-slate-500">{selectedCustomer.full_name}</div>
                                </div>
                                <span className="ml-auto pill bg-indigo-50 text-indigo-700 ring-indigo-200 inline-flex items-center gap-1">
                                    <KeyIcon className="w-3.5 h-3.5" /> {licenses.length} {licenses.length === 1 ? 'license' : 'licenses'}
                                </span>
                            </div>

                            <div className="card overflow-x-auto">
                                <table className="table-clean">
                                    <thead><tr>
                                        <th>License Name</th><th>Vendor</th><th className="text-right">Qty</th>
                                        <th>Start</th><th>Expired</th><th>License Key</th><th>Note</th><th></th>
                                    </tr></thead>
                                    <tbody>
                                        {loading && <tr><td colSpan={8} className="text-center py-8 text-slate-400 animate-pulse">Loading...</td></tr>}
                                        {!loading && licenses.length === 0 && (
                                            <tr><td colSpan={8} className="text-center py-8 text-slate-400">
                                                No licenses yet. Click <strong>New License</strong> to add one.
                                            </td></tr>
                                        )}
                                        {licenses.map(l => <LicenseRow key={l.id} l={l}
                                                                       onEdit={() => setEdit(l)}
                                                                       onExtend={() => setExtend(l)}
                                                                       onDelete={() => remove(l.id)} />)}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {edit && <LicenseForm initial={edit} onClose={() => setEdit(null)} onSave={save} />}

            {extend && (
                <ExtendForm license={extend}
                            onClose={() => setExtend(null)}
                            onConfirm={doExtend} />
            )}

            {extendAll && selectedCustomer && (
                <ExtendAllForm customerId={selectedCustomer.id}
                               customerAlias={selectedCustomer.alias}
                               licenses={licenses}
                               onClose={() => setExtendAll(false)}
                               onApplied={() => { setExtendAll(false); loadCustomerLicenses(selectedId); }} />
            )}

            {importing && selectedCustomer && (
                <ImportLicensePdfModal
                    customerId={selectedCustomer.id}
                    customerAlias={selectedCustomer.alias}
                    onClose={() => setImporting(false)}
                    onImported={() => {
                        setImporting(false);
                        loadCustomerLicenses(selectedId);
                    }}
                />
            )}
        </div>
    );
}

function LicenseRow({ l, onEdit, onExtend, onDelete }) {
    const today = new Date().toISOString().slice(0, 10);
    let badge = null;
    if (l.expired_date) {
        if (l.expired_date < today) {
            badge = <span className="pill bg-red-50 text-red-700 ring-red-200 inline-flex items-center gap-1">
                <ExclamationTriangleIcon className="w-3 h-3" /> Expired
            </span>;
        } else {
            const days = Math.ceil((new Date(l.expired_date) - new Date(today)) / 86_400_000);
            if (days <= 30) {
                badge = <span className="pill bg-amber-50 text-amber-700 ring-amber-200 inline-flex items-center gap-1">
                    <ClockIcon className="w-3 h-3" /> {days}d left
                </span>;
            }
        }
    }
    return (
        <tr>
            <td className="font-medium">{l.license_name || <span className="text-slate-400 italic">(no name)</span>}</td>
            <td>{l.vendor}</td>
            <td className="text-right tabular-nums">{l.quantity}</td>
            <td className="text-xs text-slate-600 whitespace-nowrap">{formatDate(l.start_date)}</td>
            <td className="text-xs text-slate-600 whitespace-nowrap">
                <div className="flex items-center gap-2">
                    <span>{formatDate(l.expired_date)}</span>
                    {badge}
                </div>
            </td>
            <td className="font-mono text-[11px] text-slate-500 max-w-[180px] truncate" title={l.license_key}>{l.license_key || '—'}</td>
            <td className="text-xs text-slate-500 max-w-[200px] truncate" title={l.note}>{l.note || '—'}</td>
            <td className="text-right whitespace-nowrap">
                <button className="btn-ghost" title="Extend license dates by 1 year" onClick={onExtend}>
                    <ForwardIcon className="w-4 h-4 text-emerald-600" />
                </button>
                <button className="btn-ghost ml-1" onClick={onEdit}><PencilSquareIcon className="w-4 h-4" /></button>
                <button className="btn-ghost ml-1" onClick={onDelete}><TrashIcon className="w-4 h-4 text-red-500" /></button>
            </td>
        </tr>
    );
}

function LicenseForm({ initial, onClose, onSave }) {
    const [f, setF] = useState({
        ...initial,
        start_date:   formatDate(initial.start_date)   || '',
        expired_date: formatDate(initial.expired_date) || '',
        quantity:     initial.quantity ?? 1
    });

    function submit() {
        onSave({
            ...f,
            quantity: Number(f.quantity) || 0,
            start_date:   f.start_date   || null,
            expired_date: f.expired_date || null
        });
    }

    return (
        <Modal open onClose={onClose}
               title={f.id ? `Edit License — ${f.license_name || '(no name)'}` : 'New License'}
               size="lg"
               footer={<>
                   <button className="btn-ghost" onClick={onClose}>Cancel</button>
                   <button className="btn-primary" onClick={submit}>Save</button>
               </>}>
            <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="label">License Name</label>
                    <input className="input" value={f.license_name}
                           onChange={e => setF({ ...f, license_name: e.target.value })} /></div>
                <div><label className="label">Vendor</label>
                    <input className="input" value={f.vendor}
                           onChange={e => setF({ ...f, vendor: e.target.value })} /></div>
                <div><label className="label">Quantity</label>
                    <input type="number" min="0" className="input" value={f.quantity}
                           onChange={e => setF({ ...f, quantity: e.target.value })} /></div>
                <div><label className="label">Start Date</label>
                    <input type="date" className="input" value={f.start_date}
                           onChange={e => setF({ ...f, start_date: e.target.value })} /></div>
                <div><label className="label">Expired Date</label>
                    <input type="date" className="input" value={f.expired_date}
                           onChange={e => setF({ ...f, expired_date: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">License Key</label>
                    <textarea className="input font-mono text-xs" rows={3} value={f.license_key}
                              onChange={e => setF({ ...f, license_key: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Note</label>
                    <textarea className="input" rows={2} value={f.note}
                              onChange={e => setF({ ...f, note: e.target.value })} /></div>
            </div>
        </Modal>
    );
}

/**
 * ExtendForm — single-license extender. Pre-fills with current dates +1 year.
 */
function ExtendForm({ license, onClose, onConfirm }) {
    const curStart = formatDate(license.start_date)   || '';
    const curEnd   = formatDate(license.expired_date) || '';

    const [startDate, setStartDate] = useState(addOneYear(curStart));
    const [endDate,   setEndDate]   = useState(addOneYear(curEnd));
    const [busy, setBusy] = useState(false);

    function reset() {
        setStartDate(addOneYear(curStart));
        setEndDate(addOneYear(curEnd));
    }

    async function confirm() {
        if (!startDate || !endDate) {
            return toast.error('Both Start Date and Expired Date are required');
        }
        if (startDate > endDate) {
            return toast.error('Start Date must be on or before Expired Date');
        }
        setBusy(true);
        try {
            await onConfirm({
                id: license.id,
                start_date: startDate,
                expired_date: endDate
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open onClose={onClose} size="md"
               title={`Extend License — ${license.license_name || '(no name)'}`}
               footer={<>
                   <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
                   <button className="btn-primary" onClick={confirm} disabled={busy}>
                       <ForwardIcon className="w-4 h-4" />
                       {busy ? 'Extending…' : 'Confirm Extend'}
                   </button>
               </>}>
            <div className="space-y-4">
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
                    <div className="font-bold text-slate-700 mb-1">Current dates</div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>Start: <span className="font-mono">{curStart || '—'}</span></div>
                        <div>Expired: <span className="font-mono">{curEnd || '—'}</span></div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="label">New Start Date</label>
                        <input type="date" className="input" value={startDate}
                               onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div>
                        <label className="label">New Expired Date</label>
                        <input type="date" className="input" value={endDate}
                               onChange={e => setEndDate(e.target.value)} />
                    </div>
                </div>

                <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span>Pre-filled with current dates + 1 year.</span>
                    <button type="button" className="text-indigo-600 hover:underline" onClick={reset}>
                        Reset to defaults
                    </button>
                </div>
            </div>
        </Modal>
    );
}

/**
 * ExtendAllForm — bulk extender for every license belonging to a customer.
 *
 * Admin picks how many years to shift, then sees a preview table of
 * License Name | Current Start → New Start | Current Expired → New Expired.
 * Each row has an include checkbox so individual licenses can be skipped.
 * Each Start/Expired date is editable per-row in case admin wants to override
 * the auto-computed default.
 *
 * Confirm → POST /api/licenses/extend-bulk runs all updates in a transaction.
 */
function ExtendAllForm({ customerId, customerAlias, licenses, onClose, onApplied }) {
    const [years, setYears] = useState(1);
    const [busy, setBusy]   = useState(false);

    // Per-row state seeded from licenses[] + addYears(years).
    const [rows, setRows] = useState(() => buildRows(licenses, 1));

    function buildRows(list, y) {
        return list.map(l => {
            const curStart = formatDate(l.start_date)   || '';
            const curEnd   = formatDate(l.expired_date) || '';
            return {
                id: l.id,
                license_name: l.license_name || '(no name)',
                cur_start: curStart,
                cur_end:   curEnd,
                new_start: addYears(curStart, y),
                new_end:   addYears(curEnd, y),
                include: true
            };
        });
    }

    function applyYears(n) {
        const y = Number(n);
        setYears(y);
        // Re-seed defaults: any row whose dates haven't been manually changed
        // gets the new shift; manually-edited rows stay as-is. Detect manual
        // edits by comparing the row's current new_* against what addYears
        // would give for the OLD `years` value. Simpler: re-seed everything.
        setRows(buildRows(licenses, y));
    }

    function updateRow(id, patch) {
        setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
    }
    function toggleAll(include) {
        setRows(rs => rs.map(r => ({ ...r, include })));
    }

    const selected = rows.filter(r => r.include);

    async function confirm() {
        if (selected.length === 0) return toast.error('At least one license must be included');
        // Validate dates
        for (const r of selected) {
            if (r.new_start && r.new_end && r.new_start > r.new_end) {
                return toast.error(`"${r.license_name}": Start Date must be on or before Expired Date`);
            }
        }
        setBusy(true);
        try {
            const res = await api.post('/licenses/extend-bulk', {
                customer_id: customerId,
                items: selected.map(r => ({
                    id: r.id,
                    start_date:   r.new_start || null,
                    expired_date: r.new_end   || null
                }))
            });
            toast.success(`Extended ${res.data.updated} license${res.data.updated === 1 ? '' : 's'}`);
            onApplied?.();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Extend All failed');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open onClose={onClose} size="xl"
               title={`Extend All Licenses — ${customerAlias}`}
               footer={<>
                   <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
                   <button className="btn-primary" onClick={confirm} disabled={busy}>
                       <ChevronDoubleRightIcon className="w-4 h-4" />
                       {busy
                           ? 'Extending…'
                           : `Confirm Extend (${selected.length} license${selected.length === 1 ? '' : 's'})`}
                   </button>
               </>}>
            <div className="space-y-4">
                <div className="flex items-end gap-3 flex-wrap">
                    <div>
                        <label className="label">Shift dates by (years)</label>
                        <input type="number" min="1" max="20" className="input !w-28"
                               value={years}
                               onChange={e => applyYears(e.target.value)} />
                    </div>
                    <div className="text-xs text-slate-500">
                        Changing this resets every row's New Start / New Expired to the current date plus N years.
                    </div>
                    <div className="ml-auto flex gap-2">
                        <button className="btn-ghost" type="button" onClick={() => toggleAll(true)}>Select all</button>
                        <button className="btn-ghost" type="button" onClick={() => toggleAll(false)}>Deselect all</button>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="table-clean">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="w-10"></th>
                                <th>License</th>
                                <th>Current Start</th>
                                <th>New Start</th>
                                <th>Current Expired</th>
                                <th>New Expired</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id} className={r.include ? '' : 'opacity-50 bg-slate-50/50'}>
                                    <td>
                                        <input type="checkbox" checked={r.include}
                                               onChange={e => updateRow(r.id, { include: e.target.checked })} />
                                    </td>
                                    <td className="font-medium max-w-[260px] truncate" title={r.license_name}>{r.license_name}</td>
                                    <td className="font-mono text-xs text-slate-500 whitespace-nowrap">{r.cur_start || '—'}</td>
                                    <td>
                                        <input type="date" className="input !py-1 !text-xs"
                                               value={r.new_start}
                                               onChange={e => updateRow(r.id, { new_start: e.target.value })} />
                                    </td>
                                    <td className="font-mono text-xs text-slate-500 whitespace-nowrap">{r.cur_end || '—'}</td>
                                    <td>
                                        <input type="date" className="input !py-1 !text-xs"
                                               value={r.new_end}
                                               onChange={e => updateRow(r.id, { new_end: e.target.value })} />
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr><td colSpan={6} className="text-center text-slate-400 py-6">No licenses to extend.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </Modal>
    );
}
