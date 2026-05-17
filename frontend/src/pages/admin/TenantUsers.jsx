import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import { roleLabel } from '../../auth';
import { formatDate } from '../../format';
import {
    UsersIcon, PlusIcon, PencilSquareIcon, TrashIcon,
    ArrowLeftIcon, ShieldCheckIcon, MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

/**
 * Platform → Tenants → :tenantId → Users
 *
 * TenantAdmin can list/create/edit/delete users INSIDE any tenant. Usernames
 * are unique per-tenant (Phase 4), so the same username can exist in another
 * team. Role is restricted to user/admin/superadmin (never 'tenantadmin').
 */
export default function TenantUsers() {
    const { tenantId } = useParams();
    const [tenant, setTenant]   = useState(null);
    const [users, setUsers]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch]   = useState('');
    const [edit, setEdit]       = useState(null); // user being edited or {} for new
    const [busy, setBusy]       = useState(false);

    function load() {
        setLoading(true);
        Promise.all([
            api.get(`/tenants/${tenantId}`),
            api.get(`/tenants/${tenantId}/users`)
        ])
            .then(([t, u]) => { setTenant(t.data); setUsers(u.data); })
            .catch(() => toast.error('Could not load users'))
            .finally(() => setLoading(false));
    }
    useEffect(() => { load(); }, [tenantId]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        let out = users;
        if (q) out = out.filter(u =>
            (u.username   || '').toLowerCase().includes(q) ||
            (u.full_name  || '').toLowerCase().includes(q) ||
            (u.email      || '').toLowerCase().includes(q)
        );
        return [...out].sort((a, b) => (a.username || '').localeCompare(b.username || ''));
    }, [users, search]);

    async function save(f) {
        setBusy(true);
        try {
            if (f.id) {
                const payload = {
                    full_name: f.full_name, email: f.email, phone_number: f.phone_number,
                    role: f.role
                };
                if (f.username && f.username !== f._original_username) payload.username = f.username;
                if (f.password)                                        payload.password = f.password;
                await api.put(`/tenants/${tenantId}/users/${f.id}`, payload);
            } else {
                if (!f.username || f.username.length < 1) return toast.error('Username required');
                if (!f.password || f.password.length < 8) return toast.error('Password must be at least 8 characters');
                await api.post(`/tenants/${tenantId}/users`, {
                    username: f.username, password: f.password,
                    role: f.role || 'user',
                    full_name: f.full_name, email: f.email, phone_number: f.phone_number
                });
            }
            toast.success('Saved');
            setEdit(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        } finally {
            setBusy(false);
        }
    }

    async function remove(u) {
        if (!confirm(`Delete user "${u.username}" from team "${tenant?.name}"?`)) return;
        try {
            await api.delete(`/tenants/${tenantId}/users/${u.id}`);
            toast.success('User deleted');
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Delete failed');
        }
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
                <Link to="/admin/tenants" className="btn-ghost"><ArrowLeftIcon className="w-4 h-4" /> Back to Tenants</Link>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <UsersIcon className="w-6 h-6 text-indigo-500" />
                    Users — <span className="brand-mark">{tenant?.name || `Tenant #${tenantId}`}</span>
                </h1>
                <button className="btn-primary ml-auto" onClick={() => setEdit({
                    username: '', password: '', full_name: '', email: '', phone_number: '', role: 'user'
                })}>
                    <PlusIcon className="w-4 h-4" /> New User
                </button>
            </div>

            <div className="card p-3 flex items-center gap-2">
                <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
                <input className="input !border-0 !bg-transparent !p-0 focus:!ring-0 flex-1"
                       placeholder="Search by username / name / email..."
                       value={search} onChange={e => setSearch(e.target.value)} />
                <span className="text-xs text-slate-500">{filtered.length} of {users.length}</span>
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr>
                        <th>Username</th>
                        <th>Full Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Role</th>
                        <th>Created</th>
                        <th></th>
                    </tr></thead>
                    <tbody>
                        {loading && <tr><td colSpan={7} className="text-center py-10 text-slate-400 animate-pulse">Loading...</td></tr>}
                        {!loading && filtered.length === 0 && (
                            <tr><td colSpan={7} className="text-center py-10 text-slate-400">No users in this team yet.</td></tr>
                        )}
                        {filtered.map(u => (
                            <tr key={u.id}>
                                <td className="font-mono text-sm font-semibold text-indigo-600">{u.username}</td>
                                <td>{u.full_name || <span className="text-slate-400 italic">—</span>}</td>
                                <td>{u.email || <span className="text-slate-400 italic">—</span>}</td>
                                <td>{u.phone_number || <span className="text-slate-400 italic">—</span>}</td>
                                <td>
                                    <span className="pill bg-indigo-50 text-indigo-700 ring-indigo-200 inline-flex items-center gap-1">
                                        <ShieldCheckIcon className="w-3 h-3" /> {roleLabel(u.role)}
                                    </span>
                                    {u.must_change_password && (
                                        <span className="pill bg-amber-50 text-amber-700 ring-amber-200 ml-1">Must change pw</span>
                                    )}
                                </td>
                                <td className="text-xs text-slate-500 whitespace-nowrap">{formatDate(u.created_at)}</td>
                                <td className="text-right whitespace-nowrap">
                                    <button className="btn-ghost"
                                            onClick={() => setEdit({ ...u, _original_username: u.username, password: '' })}>
                                        <PencilSquareIcon className="w-4 h-4" />
                                    </button>
                                    <button className="btn-ghost ml-1" onClick={() => remove(u)}>
                                        <TrashIcon className="w-4 h-4 text-red-500" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {edit && (
                <UserForm initial={edit} busy={busy}
                          onClose={() => setEdit(null)}
                          onSave={save} />
            )}
        </div>
    );
}

function UserForm({ initial, busy, onClose, onSave }) {
    const [f, setF] = useState({ ...initial });
    const editing = !!f.id;
    return (
        <Modal open onClose={onClose} size="lg"
               title={editing ? `Edit User — ${initial._original_username}` : 'New User'}
               footer={<>
                   <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
                   <button className="btn-primary" onClick={() => onSave(f)} disabled={busy}>
                       {busy ? 'Saving…' : 'Save'}
                   </button>
               </>}>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="label">Username</label>
                    <input className="input" value={f.username || ''}
                           onChange={e => setF({ ...f, username: e.target.value })} />
                    {editing && (
                        <p className="text-[11px] text-slate-400 mt-1">
                            Leave unchanged to keep "{initial._original_username}".
                        </p>
                    )}
                </div>
                <div>
                    <label className="label">Role</label>
                    <select className="input" value={f.role || 'user'}
                            onChange={e => setF({ ...f, role: e.target.value })}>
                        <option value="user">user (view only)</option>
                        <option value="admin">admin</option>
                        <option value="superadmin">superadmin</option>
                    </select>
                </div>
                <div className="col-span-2">
                    <label className="label">{editing ? 'New Password (leave blank to keep)' : 'Password'}</label>
                    <input type="password" className="input" value={f.password || ''}
                           placeholder={editing ? '••••••' : 'at least 8 characters'}
                           onChange={e => setF({ ...f, password: e.target.value })} />
                </div>
                <div className="col-span-2">
                    <label className="label">Full Name</label>
                    <input className="input" value={f.full_name || ''}
                           onChange={e => setF({ ...f, full_name: e.target.value })} />
                </div>
                <div>
                    <label className="label">Email</label>
                    <input type="email" className="input" value={f.email || ''}
                           onChange={e => setF({ ...f, email: e.target.value })} />
                </div>
                <div>
                    <label className="label">Phone</label>
                    <input className="input" value={f.phone_number || ''}
                           onChange={e => setF({ ...f, phone_number: e.target.value })} />
                </div>
            </div>
        </Modal>
    );
}
