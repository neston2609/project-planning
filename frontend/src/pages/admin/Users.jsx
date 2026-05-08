import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import { PencilSquareIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';

export default function UsersPage() {
    const [list, setList] = useState([]);
    const [edit, setEdit] = useState(null);

    async function load() { setList((await api.get('/admin/users')).data); }
    useEffect(() => { load(); }, []);

    async function save(f) {
        try {
            if (f.id) await api.put(`/admin/users/${f.id}`, f);
            else      await api.post('/admin/users', f);
            toast.success('Saved'); setEdit(null); load();
        } catch (err) { toast.error(err.response?.data?.error || 'Save failed'); }
    }

    function roleBadge(role) {
        if (role === 'superadmin') return 'pill bg-purple-100 text-purple-700';
        if (role === 'admin')      return 'pill bg-blue-100 text-blue-700';
        return 'pill bg-slate-100 text-slate-700';
    }
    async function remove(id) {
        if (!confirm('Delete this user?')) return;
        try { await api.delete(`/admin/users/${id}`); toast.success('Deleted'); load(); }
        catch (err) { toast.error(err.response?.data?.error || 'Delete failed'); }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center"><h1 className="text-2xl font-bold">Users</h1>
                <button className="btn-primary ml-auto" onClick={() => setEdit({ username: '', password: '', full_name: '', email: '', phone_number: '', role: 'user' })}>
                    <PlusIcon className="w-4 h-4" /> Add</button>
            </div>
            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr><th>Username</th><th>Full Name</th><th>Email</th><th>Phone</th><th>Role</th><th></th></tr></thead>
                    <tbody>
                        {list.map(u => (
                            <tr key={u.id}>
                                <td className="font-medium">{u.username}</td>
                                <td>{u.full_name}</td><td>{u.email}</td><td>{u.phone_number}</td>
                                <td><span className={roleBadge(u.role)}>{u.role}</span></td>
                                <td className="text-right">
                                    <button className="btn-ghost" onClick={() => setEdit({ ...u, password: '' })}><PencilSquareIcon className="w-4 h-4" /></button>
                                    <button className="btn-ghost ml-1" onClick={() => remove(u.id)}><TrashIcon className="w-4 h-4 text-red-500" /></button>
                                </td>
                            </tr>
                        ))}
                        {list.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">No users.</td></tr>}
                    </tbody>
                </table>
            </div>
            {edit && <UserForm initial={edit} onClose={() => setEdit(null)} onSave={save} />}
        </div>
    );
}

function UserForm({ initial, onClose, onSave }) {
    const [f, setF] = useState({ ...initial });
    return (
        <Modal open onClose={onClose} title={f.id ? `Edit User — ${f.username}` : 'New User'}
               footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave(f)}>Save</button></>}>
            <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Username</label>
                    <input className="input" value={f.username} disabled={!!f.id} onChange={e => setF({ ...f, username: e.target.value })} /></div>
                <div><label className="label">Role</label>
                    <select className="input" value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
                        <option value="user">user (View only)</option>
                        <option value="admin">admin</option>
                        <option value="superadmin">superadmin</option>
                    </select></div>
                <div className="col-span-2"><label className="label">{f.id ? 'New Password (optional)' : 'Password *'}</label>
                    <input type="password" className="input" value={f.password || ''} onChange={e => setF({ ...f, password: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Full Name</label>
                    <input className="input" value={f.full_name || ''} onChange={e => setF({ ...f, full_name: e.target.value })} /></div>
                <div><label className="label">Email</label>
                    <input className="input" value={f.email || ''} onChange={e => setF({ ...f, email: e.target.value })} /></div>
                <div><label className="label">Phone</label>
                    <input className="input" value={f.phone_number || ''} onChange={e => setF({ ...f, phone_number: e.target.value })} /></div>
            </div>
        </Modal>
    );
}
