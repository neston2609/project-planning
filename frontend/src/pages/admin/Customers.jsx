import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import { PencilSquareIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';

export default function Customers() {
    const [list, setList] = useState([]);
    const [edit, setEdit] = useState(null);

    async function load() { setList((await api.get('/customers')).data); }
    useEffect(() => { load(); }, []);

    async function save(f) {
        try {
            if (f.id) await api.put(`/customers/${f.id}`, f);
            else await api.post('/customers', f);
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
                <button className="btn-primary ml-auto" onClick={() => setEdit({ alias: '', full_name: '', contact_name: '', contact_email: '', contact_phone: '', color_hex: '#3b82f6' })}>
                    <PlusIcon className="w-4 h-4" /> Add</button>
            </div>
            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr><th>Alias</th><th>Full Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>Color</th><th></th></tr></thead>
                    <tbody>
                        {list.map(c => (
                            <tr key={c.id}>
                                <td className="font-medium">{c.alias}</td>
                                <td>{c.full_name}</td>
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
                        {list.length === 0 && <tr><td colSpan={7} className="text-center text-slate-400 py-6">No customers.</td></tr>}
                    </tbody>
                </table>
            </div>
            {edit && <CustomerForm initial={edit} onClose={() => setEdit(null)} onSave={save} />}
        </div>
    );
}

function CustomerForm({ initial, onClose, onSave }) {
    const [f, setF] = useState({ ...initial });
    return (
        <Modal open onClose={onClose} title={f.id ? `Edit Customer — ${f.alias}` : 'New Customer'}
               footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave(f)}>Save</button></>}>
            <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Alias *</label><input className="input" value={f.alias} onChange={e => setF({ ...f, alias: e.target.value })} /></div>
                <div><label className="label">Color (hex)</label><input className="input" value={f.color_hex} onChange={e => setF({ ...f, color_hex: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Full Name</label><input className="input" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></div>
                <div><label className="label">Contact Name</label><input className="input" value={f.contact_name} onChange={e => setF({ ...f, contact_name: e.target.value })} /></div>
                <div><label className="label">Contact Email</label><input className="input" value={f.contact_email} onChange={e => setF({ ...f, contact_email: e.target.value })} /></div>
                <div><label className="label">Contact Phone</label><input className="input" value={f.contact_phone} onChange={e => setF({ ...f, contact_phone: e.target.value })} /></div>
            </div>
        </Modal>
    );
}
