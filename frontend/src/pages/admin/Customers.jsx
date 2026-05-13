import { useEffect, useRef, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import HoverImage from '../../components/HoverImage';
import { PencilSquareIcon, TrashIcon, PlusIcon, PhotoIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';

export default function Customers() {
    const [list, setList] = useState([]);
    const [edit, setEdit] = useState(null);

    async function load() { setList((await api.get('/customers')).data); }
    useEffect(() => { load(); }, []);

    async function save(f) {
        try {
            if (f.id) await api.put(`/customers/${f.id}`, f);
            else      await api.post('/customers', f);
            toast.success('Saved'); setEdit(null); load();
        } catch (err) { toast.error(err.response?.data?.error || 'Save failed'); }
    }
    async function remove(id) {
        if (!confirm('Delete customer?')) return;
        await api.delete(`/customers/${id}`);
        toast.success('Deleted'); load();
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center"><h1 className="text-2xl font-bold">Customers</h1>
                <button className="btn-primary ml-auto" onClick={() => setEdit({ alias: '', full_name: '', contact_name: '', contact_email: '', contact_phone: '', account_manager: '', color_hex: '#3b82f6', logo_data: null })}>
                    <PlusIcon className="w-4 h-4" /> Add</button>
            </div>
            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr><th>Logo</th><th>Alias</th><th>Full Name</th><th>Account Mgr</th><th>Contact</th><th>Email</th><th>Phone</th><th>Color</th><th></th></tr></thead>
                    <tbody>
                        {list.map(c => (
                            <tr key={c.id}>
                                <td>
                                    <HoverImage previewSrc={c.logo_data} previewAlt={c.alias} previewSize={320}>
                                        {c.logo_data
                                            ? <img src={c.logo_data} alt={c.alias}
                                                   className="w-10 h-10 rounded-lg object-contain border border-slate-200 bg-white" />
                                            : <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                                                   style={{ backgroundColor: c.color_hex }}>
                                                  {(c.alias || '').slice(0, 2).toUpperCase()}
                                              </div>}
                                    </HoverImage>
                                </td>
                                <td className="font-medium">{c.alias}</td>
                                <td>{c.full_name}</td>
                                <td>{c.account_manager}</td>
                                <td>{c.contact_name}</td>
                                <td>{c.contact_email}</td>
                                <td>{c.contact_phone}</td>
                                <td><span className="inline-block w-6 h-4 rounded" style={{ backgroundColor: c.color_hex }} /> <span className="text-xs ml-1 text-slate-500">{c.color_hex}</span></td>
                                <td className="text-right">
                                    <button className="btn-ghost" onClick={() => setEdit(c)}><PencilSquareIcon className="w-4 h-4" /></button>
                                    <button className="btn-ghost ml-1" onClick={() => remove(c.id)}><TrashIcon className="w-4 h-4 text-red-500" /></button>
                                </td>
                            </tr>
                        ))}
                        {list.length === 0 && <tr><td colSpan={9} className="text-center text-slate-400 py-6">No customers.</td></tr>}
                    </tbody>
                </table>
            </div>
            {edit && <CustomerForm initial={edit} onClose={() => setEdit(null)} onSave={save} />}
        </div>
    );
}

function CustomerForm({ initial, onClose, onSave }) {
    const [f, setF] = useState({ ...initial });
    const fileRef = useRef(null);

    function pickLogo() { fileRef.current?.click(); }

    function onLogoChange(e) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            return toast.error('Please choose an image file (PNG, JPG, SVG, etc.)');
        }
        if (file.size > 2 * 1024 * 1024) {
            return toast.error('Image must be 2 MB or smaller');
        }
        const reader = new FileReader();
        reader.onload = () => setF(s => ({ ...s, logo_data: String(reader.result) }));
        reader.onerror = () => toast.error('Could not read file');
        reader.readAsDataURL(file);
    }

    function clearLogo() {
        setF(s => ({ ...s, logo_data: null }));
    }

    return (
        <Modal open onClose={onClose} title={f.id ? `Edit Customer — ${f.alias}` : 'New Customer'}
               footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave(f)}>Save</button></>}>
            <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                    <label className="label">Logo</label>
                    <div className="flex items-center gap-4 p-3 rounded-lg border border-slate-200 bg-gradient-to-br from-indigo-50/40 to-pink-50/40">
                        <div className="w-20 h-20 rounded-lg flex items-center justify-center bg-white border border-slate-200 overflow-hidden">
                            {f.logo_data
                                ? <img src={f.logo_data} alt="logo" className="w-full h-full object-contain" />
                                : <PhotoIcon className="w-10 h-10 text-slate-300" />}
                        </div>
                        <div className="flex-1 space-y-2">
                            <button type="button" className="btn-ghost" onClick={pickLogo}>
                                <ArrowUpTrayIcon className="w-4 h-4" /> {f.logo_data ? 'Replace logo' : 'Upload logo'}
                            </button>
                            {f.logo_data && (
                                <button type="button" className="btn-ghost ml-2" onClick={clearLogo}>
                                    <TrashIcon className="w-4 h-4 text-red-500" /> Remove
                                </button>
                            )}
                            <p className="text-xs text-slate-500">PNG, JPG, or SVG · max 2 MB. Square images look best.</p>
                            <input ref={fileRef} type="file" accept="image/*"
                                className="hidden" onChange={onLogoChange} />
                        </div>
                    </div>
                </div>

                <div><label className="label">Alias *</label><input className="input" value={f.alias} onChange={e => setF({ ...f, alias: e.target.value })} /></div>
                <div><label className="label">Color (hex)</label><input className="input" value={f.color_hex} onChange={e => setF({ ...f, color_hex: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Full Name</label><input className="input" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Account Manager</label><input className="input" value={f.account_manager || ''} onChange={e => setF({ ...f, account_manager: e.target.value })} /></div>
                <div><label className="label">Contact Name</label><input className="input" value={f.contact_name} onChange={e => setF({ ...f, contact_name: e.target.value })} /></div>
                <div><label className="label">Contact Email</label><input className="input" value={f.contact_email} onChange={e => setF({ ...f, contact_email: e.target.value })} /></div>
                <div><label className="label">Contact Phone</label><input className="input" value={f.contact_phone} onChange={e => setF({ ...f, contact_phone: e.target.value })} /></div>
            </div>
        </Modal>
    );
}
