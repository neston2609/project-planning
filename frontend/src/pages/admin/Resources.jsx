import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import { PencilSquareIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';

export default function Resources() {
    const [list, setList] = useState([]);
    const [edit, setEdit] = useState(null);

    async function load() { setList((await api.get('/resources')).data); }
    useEffect(() => { load(); }, []);

    async function save(f) {
        try {
            if (f.id) await api.put(`/resources/${f.id}`, f);
            else await api.post('/resources', f);
            toast.success('Saved'); setEdit(null); load();
        } catch (err) { toast.error(err.response?.data?.error || 'Save failed'); }
    }
    async function remove(id) {
        if (!confirm('Delete resource?')) return;
        await api.delete(`/resources/${id}`);
        toast.success('Deleted'); load();
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center"><h1 className="text-2xl font-bold">Resources</h1>
                <button className="btn-primary ml-auto" onClick={() => setEdit({ first_name: '', last_name: '', nick_name: '', emp_id: '', role: '', email: '', erp_username: '', skill: '' })}>
                    <PlusIcon className="w-4 h-4" /> Add</button>
            </div>
            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr><th>Emp ID</th><th>First</th><th>Last</th><th>Nickname</th><th>Role</th><th>Email</th><th>ERP User</th><th>Skill</th><th></th></tr></thead>
                    <tbody>
                        {list.map(r => (
                            <tr key={r.id}>
                                <td className="font-mono text-xs">{r.emp_id}</td>
                                <td>{r.first_name}</td><td>{r.last_name}</td><td>{r.nick_name}</td>
                                <td>{r.role}</td><td>{r.email}</td><td>{r.erp_username}</td>
                                <td className="max-w-[200px] truncate" title={r.skill}>{r.skill}</td>
                                <td className="text-right">
                                    <button className="btn-ghost" onClick={() => setEdit(r)}><PencilSquareIcon className="w-4 h-4" /></button>
                                    <button className="btn-ghost ml-1" onClick={() => remove(r.id)}><TrashIcon className="w-4 h-4 text-red-500" /></button>
                                </td>
                            </tr>
                        ))}
                        {list.length === 0 && <tr><td colSpan={9} className="text-center text-slate-400 py-6">No resources.</td></tr>}
                    </tbody>
                </table>
            </div>
            {edit && <ResourceForm initial={edit} onClose={() => setEdit(null)} onSave={save} />}
        </div>
    );
}

function ResourceForm({ initial, onClose, onSave }) {
    const [f, setF] = useState({ ...initial });
    return (
        <Modal open onClose={onClose} title={f.id ? `Edit Resource — ${f.first_name} ${f.last_name}` : 'New Resource'}
               footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave(f)}>Save</button></>}>
            <div className="grid grid-cols-2 gap-3">
                <div><label className="label">First Name</label><input className="input" value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} /></div>
                <div><label className="label">Last Name</label><input className="input" value={f.last_name} onChange={e => setF({ ...f, last_name: e.target.value })} /></div>
                <div><label className="label">Nickname</label><input className="input" value={f.nick_name} onChange={e => setF({ ...f, nick_name: e.target.value })} /></div>
                <div><label className="label">Emp ID</label><input className="input" value={f.emp_id || ''} onChange={e => setF({ ...f, emp_id: e.target.value })} /></div>
                <div><label className="label">Role</label><input className="input" value={f.role} onChange={e => setF({ ...f, role: e.target.value })} /></div>
                <div><label className="label">Email</label><input className="input" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
                <div><label className="label">ERP Username</label><input className="input" value={f.erp_username} onChange={e => setF({ ...f, erp_username: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Skill</label><textarea rows={2} className="input" value={f.skill} onChange={e => setF({ ...f, skill: e.target.value })} /></div>
            </div>
        </Modal>
    );
}
