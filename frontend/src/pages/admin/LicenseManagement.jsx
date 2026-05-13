import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import HoverImage from '../../components/HoverImage';
import { formatDate } from '../../format';
import {
    PencilSquareIcon, TrashIcon, PlusIcon, MagnifyingGlassIcon,
    KeyIcon, ClockIcon, ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

/**
 * Admin → License Management
 *
 * Layout: customer picker on the left (search + cards), license list on the right.
 * Selecting a customer pulls their licenses; admin can Add/Edit/Delete.
 * License names may repeat within one customer (per spec).
 */
export default function LicenseManagement() {
    const [customers, setCustomers] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(null);
    const [licenses, setLicenses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [edit, setEdit] = useState(null);

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
            <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">License Management</h1>
                <span className="text-xs text-slate-500">Pick a customer on the left, then add/edit their licenses.</span>
                <button className="btn-primary ml-auto" onClick={openNew} disabled={!selectedId}>
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
                                                                       onDelete={() => remove(l.id)} />)}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {edit && <LicenseForm initial={edit} onClose={() => setEdit(null)} onSave={save} />}
        </div>
    );
}

function LicenseRow({ l, onEdit, onDelete }) {
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
            <td className="text-right">
                <button className="btn-ghost" onClick={onEdit}><PencilSquareIcon className="w-4 h-4" /></button>
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
