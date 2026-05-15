import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import { formatDate } from '../../format';
import {
    BuildingOffice2Icon, PlusIcon, PencilSquareIcon, TrashIcon,
    UsersIcon, BriefcaseIcon, DocumentTextIcon, ShieldCheckIcon
} from '@heroicons/react/24/outline';

/**
 * Platform → Tenant Management (TenantAdmin only).
 *
 * Lists every team (tenant) with quick counts, lets the TenantAdmin create a
 * new team (which also provisions that team's first superadmin login), rename
 * a team, or delete a team and all of its data. The default tenant — the home
 * of the originally-migrated data — cannot be deleted.
 */
export default function Tenants() {
    const [list, setList]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [editing, setEditing]   = useState(null);   // tenant being renamed
    const [created, setCreated]   = useState(null);   // result banner after creation

    function load() {
        setLoading(true);
        api.get('/tenants')
            .then(r => setList(r.data))
            .catch(() => toast.error('Could not load tenants'))
            .finally(() => setLoading(false));
    }
    useEffect(() => { load(); }, []);

    async function rename(id, name) {
        try {
            await api.put(`/tenants/${id}`, { name });
            toast.success('Team renamed');
            setEditing(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Rename failed');
        }
    }

    async function remove(t) {
        if (t.is_default) return;
        if (!confirm(
            `Delete team "${t.name}" and ALL of its data?\n\n` +
            `This permanently removes ${t.user_count} user(s), ${t.customer_count} customer(s), ` +
            `${t.project_count} project(s) and everything else in this team. This cannot be undone.`
        )) return;
        try {
            await api.delete(`/tenants/${t.id}`);
            toast.success(`Team "${t.name}" deleted`);
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Delete failed');
        }
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-extrabold">
                    <span className="brand-mark">Tenant Management</span>
                </h1>
                <span className="text-xs text-slate-500">One team = one tenant. Each team's data is fully isolated.</span>
                <button className="btn-primary ml-auto" onClick={() => setCreating(true)}>
                    <PlusIcon className="w-4 h-4" /> New Team
                </button>
            </div>

            {/* Post-create banner with the new team's superadmin login */}
            {created && (
                <div className="card p-4 bg-emerald-50 border border-emerald-200">
                    <div className="font-bold text-emerald-800 flex items-center gap-2">
                        <ShieldCheckIcon className="w-5 h-5" /> Team "{created.tenant.name}" created
                    </div>
                    <div className="text-sm text-emerald-700 mt-1">
                        Its first superadmin login is <strong>{created.superadmin.username}</strong>.
                        They'll be asked to change the password on first sign-in. Share these credentials securely.
                    </div>
                    <button className="btn-ghost mt-2" onClick={() => setCreated(null)}>Dismiss</button>
                </div>
            )}

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr>
                        <th>Team (Tenant)</th>
                        <th className="text-right">Users</th>
                        <th className="text-right">Customers</th>
                        <th className="text-right">Projects</th>
                        <th>Created</th>
                        <th></th>
                    </tr></thead>
                    <tbody>
                        {loading && <tr><td colSpan={6} className="text-center py-10 text-slate-400 animate-pulse">Loading...</td></tr>}
                        {!loading && list.length === 0 && (
                            <tr><td colSpan={6} className="text-center py-10 text-slate-400">No tenants yet.</td></tr>
                        )}
                        {list.map(t => (
                            <tr key={t.id}>
                                <td>
                                    <div className="flex items-center gap-2">
                                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0"
                                             style={{ backgroundImage: 'var(--grad-brand)' }}>
                                            <BuildingOffice2Icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="font-semibold flex items-center gap-2">
                                                {t.name}
                                                {t.is_default && (
                                                    <span className="pill bg-indigo-50 text-indigo-700 ring-indigo-200 text-[10px]">Default</span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-slate-400">Tenant #{t.id}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="text-right tabular-nums">
                                    <span className="inline-flex items-center gap-1"><UsersIcon className="w-3.5 h-3.5 text-slate-400" />{t.user_count}</span>
                                </td>
                                <td className="text-right tabular-nums">
                                    <span className="inline-flex items-center gap-1"><BriefcaseIcon className="w-3.5 h-3.5 text-slate-400" />{t.customer_count}</span>
                                </td>
                                <td className="text-right tabular-nums">
                                    <span className="inline-flex items-center gap-1"><DocumentTextIcon className="w-3.5 h-3.5 text-slate-400" />{t.project_count}</span>
                                </td>
                                <td className="text-xs text-slate-500 whitespace-nowrap">{formatDate(t.created_at)}</td>
                                <td className="text-right whitespace-nowrap">
                                    <button className="btn-ghost" title="Rename team"
                                            onClick={() => setEditing(t)}>
                                        <PencilSquareIcon className="w-4 h-4" />
                                    </button>
                                    <button className="btn-ghost ml-1"
                                            title={t.is_default ? 'The default tenant cannot be deleted' : 'Delete team'}
                                            disabled={t.is_default}
                                            onClick={() => remove(t)}>
                                        <TrashIcon className={`w-4 h-4 ${t.is_default ? 'text-slate-300' : 'text-red-500'}`} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {creating && (
                <CreateTeamModal
                    onClose={() => setCreating(false)}
                    onCreated={(result) => { setCreating(false); setCreated(result); load(); }}
                />
            )}
            {editing && (
                <RenameTeamModal
                    tenant={editing}
                    onClose={() => setEditing(null)}
                    onSave={(name) => rename(editing.id, name)}
                />
            )}
        </div>
    );
}

function CreateTeamModal({ onClose, onCreated }) {
    const [f, setF] = useState({
        name: '', admin_username: '', admin_password: '', admin_full_name: ''
    });
    const [busy, setBusy] = useState(false);

    async function submit() {
        if (!f.name.trim())            return toast.error('Team name is required');
        if (f.admin_username.trim().length < 3) return toast.error('Admin username must be at least 3 characters');
        if (f.admin_password.length < 8)        return toast.error('Admin password must be at least 8 characters');
        setBusy(true);
        try {
            const r = await api.post('/tenants', {
                name: f.name.trim(),
                admin_username: f.admin_username.trim(),
                admin_password: f.admin_password,
                admin_full_name: f.admin_full_name.trim()
            });
            toast.success('Team created');
            onCreated(r.data);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Create failed');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open onClose={onClose} size="lg"
               title="New Team (Tenant)"
               footer={<>
                   <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
                   <button className="btn-primary" onClick={submit} disabled={busy}>
                       {busy ? 'Creating…' : 'Create Team'}
                   </button>
               </>}>
            <div className="space-y-4">
                <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 p-3 text-xs text-indigo-800">
                    A new team starts empty. It is provisioned with one <strong>superadmin</strong> login so the team
                    can begin adding its own users, customers and projects. The superadmin must change the password
                    on first sign-in.
                </div>
                <div>
                    <label className="label">Team Name</label>
                    <input className="input" value={f.name} autoFocus
                           placeholder="e.g. Data Analytics Team"
                           onChange={e => setF({ ...f, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="label">Superadmin Username</label>
                        <input className="input" value={f.admin_username}
                               placeholder="team_superadmin"
                               onChange={e => setF({ ...f, admin_username: e.target.value })} />
                    </div>
                    <div>
                        <label className="label">Superadmin Password</label>
                        <input type="password" className="input" value={f.admin_password}
                               placeholder="at least 8 characters"
                               onChange={e => setF({ ...f, admin_password: e.target.value })} />
                    </div>
                </div>
                <div>
                    <label className="label">Superadmin Full Name <span className="text-slate-400">(optional)</span></label>
                    <input className="input" value={f.admin_full_name}
                           onChange={e => setF({ ...f, admin_full_name: e.target.value })} />
                </div>
            </div>
        </Modal>
    );
}

function RenameTeamModal({ tenant, onClose, onSave }) {
    const [name, setName] = useState(tenant.name || '');
    return (
        <Modal open onClose={onClose}
               title={`Rename Team — ${tenant.name}`}
               footer={<>
                   <button className="btn-ghost" onClick={onClose}>Cancel</button>
                   <button className="btn-primary" onClick={() => name.trim() ? onSave(name.trim()) : toast.error('Team name is required')}>Save</button>
               </>}>
            <div>
                <label className="label">Team Name</label>
                <input className="input" value={name} autoFocus
                       onChange={e => setName(e.target.value)} />
                <p className="text-xs text-slate-400 mt-1">
                    This name brands the whole app for the team (e.g. "{name || tenant.name} Planning").
                </p>
            </div>
        </Modal>
    );
}
