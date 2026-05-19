import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import { roleLabel } from '../../auth';
import { formatDate } from '../../format';
import {
    ShieldCheckIcon, PlusIcon, PencilSquareIcon, TrashIcon,
    MagnifyingGlassIcon, EyeIcon
} from '@heroicons/react/24/outline';

/**
 * Platform Users — manage 'tenantadmin' and 'tenantuser' accounts.
 * TenantAdmin only. TenantUser cannot reach this page.
 */
export default function PlatformUsers() {
    const [list, setList]   = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch]   = useState('');
    const [edit, setEdit]   = useState(null);
    const [busy, setBusy]   = useState(false);

    function load() {
        setLoading(true);
        api.get('/platform/users')
            .then(r => setList(r.data))
            .catch(() => toast.error('Could not load platform users'))
            .finally(() => setLoading(false));
    }
    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        let out = list;
        if (q) out = out.filter(u =>
            (u.username  || '').toLowerCase().includes(q) ||
            (u.full_name || '').toLowerCase().includes(q) ||
            (u.email     || '').toLowerCase().includes(q)
        );
        return [...out].sort((a, b) =>
            (a.role || '').localeCompare(b.role || '') ||
            (a.username || '').localeCompare(b.username || '')
        );
    }, [list, search]);

    async function save(f) {
        setBusy(true);
        try {
            if (f.id) {
                const payload = {
                    full_name: f.full_name, email: f.email, phone_number: f.phone_number,
                    role: f.role
                };
                if (f.username && f.username !== f._original_username) payload.username = f.username;
                if (f.password) payload.password = f.password;
                await api.put(`/platform/users/${f.id}`, payload);
            } else {
                if (!f.username || f.username.length < 1) return toast.error('Username required');
                if (!f.password || f.password.length < 8) return toast.error('Password must be at least 8 characters');
                await api.post('/platform/users', {
                    username: f.username, password: f.password,
                    role: f.role || 'tenantuser',
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
        if (!confirm(`Delete platform user "${u.username}" (${roleLabel(u.role)})?`)) return;
        try {
            await api.delete(`/platform/users/${u.id}`);
            toast.success('Platform user deleted');
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Delete failed');
        }
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-extrabold">
                    <span className="brand-mark">Platform Users</span>
                </h1>
                <span className="text-xs text-slate-500">
                    Manage TenantAdmin and TenantUser (read-only platform dashboard) accounts.
                </span>
                <button className="btn-primary ml-auto" onClick={() => setEdit({
                    username: '', password: '', full_name: '', email: '', phone_number: '', role: 'tenantuser'
                })}>
                    <PlusIcon className="w-4 h-4" /> New Platform User
                </button>
            </div>

            <div className="card p-3 flex items-center gap-2">
                <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
                <input className="input !border-0 !bg-transparent !p-0 focus:!ring-0 flex-1"
                       placeholder="Search by username / name / email..."
                       value={search} onChange={e => setSearch(e.target.value)} />
                <span className="text-xs text-slate-500">{filtered.length} of {list.length}</span>
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr>
                        <th>Username</th><th>Full Name</th><th>Email</th><th>Role</th>
                        <th>Created</th><th></th>
                    </tr></thead>
                    <tbody>
                        {loading && <tr><td colSpan={6} className="text-center py-10 text-slate-400 animate-pulse">Loading...</td></tr>}
                        {!loading && filtered.length === 0 && (
                            <tr><td colSpan={6} className="text-center py-10 text-slate-400">No platform users yet.</td></tr>
                        )}
                        {filtered.map(u => {
                            const isAdmin = u.role === 'tenantadmin';
                            return (
                                <tr key={u.id}>
                                    <td className="font-mono text-sm font-semibold text-indigo-600">{u.username}</td>
                                    <td>{u.full_name || <span className="text-slate-400 italic">—</span>}</td>
                                    <td>{u.email || <span className="text-slate-400 italic">—</span>}</td>
                                    <td>
                                        <span className={`pill inline-flex items-center gap-1 ${
                                            isAdmin ? 'bg-violet-50 text-violet-700 ring-violet-200'
                                                    : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                        }`}>
                                            {isAdmin ? <ShieldCheckIcon className="w-3 h-3" /> : <EyeIcon className="w-3 h-3" />}
                                            {roleLabel(u.role)}
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
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {edit && (
                <PlatformUserForm initial={edit} busy={busy}
                                  onClose={() => setEdit(null)}
                                  onSave={save} />
            )}
        </div>
    );
}

function PlatformUserForm({ initial, busy, onClose, onSave }) {
    const [f, setF] = useState({ ...initial });
    const editing = !!f.id;
    return (
        <Modal open onClose={onClose} size="lg"
               title={editing ? `Edit Platform User — ${initial._original_username}` : 'New Platform User'}
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
                </div>
                <div>
                    <label className="label">Role</label>
                    <select className="input" value={f.role || 'tenantuser'}
                            onChange={e => setF({ ...f, role: e.target.value })}>
                        <option value="tenantuser">tenantuser (Platform dashboard read-only)</option>
                        <option value="tenantadmin">tenantadmin (Full platform admin)</option>
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
