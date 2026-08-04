import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import { PencilSquareIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';

export default function UsersPage() {
    const [list, setList] = useState([]);
    const [roles, setRoles] = useState([]);
    const [edit, setEdit] = useState(null);
    const [savingNotifications, setSavingNotifications] = useState(() => new Set());

    async function load() {
        try {
            const [users, roleRows] = await Promise.all([
                api.get('/admin/users'),
                api.get('/admin/roles')
            ]);
            setList(users.data);
            setRoles(roleRows.data || []);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load users');
        }
    }
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

    async function saveBookingNotification(user, patch) {
        const nextEnabled = patch.enabled ?? !!user.office_booking_notification_enabled;
        const nextMin = Number(patch.min_required ?? user.office_booking_min_required ?? 2);
        if (nextEnabled && !String(user.email || '').trim()) {
            toast.error('Add an email address before enabling booking notifications');
            return;
        }
        setSavingNotifications(current => new Set(current).add(user.id));
        try {
            const response = await api.put(`/admin/users/${user.id}/office-booking-notification`, {
                enabled: nextEnabled,
                min_required: nextMin
            });
            setList(current => current.map(row => row.id === user.id ? {
                ...row,
                ...response.data
            } : row));
            toast.success('Booking notification updated');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not update booking notification');
        } finally {
            setSavingNotifications(current => {
                const next = new Set(current);
                next.delete(user.id);
                return next;
            });
        }
    }
    const defaultUserRole = roles.find(r => r.is_system && r.base_role === 'user') || roles.find(r => r.base_role === 'user') || roles[0];

    return (
        <div className="space-y-4">
            <div className="flex items-center"><h1 className="text-2xl font-bold">Users</h1>
                <button className="btn-primary ml-auto" onClick={() => setEdit({ username: '', password: '', full_name: '', email: '', phone_number: '', role: defaultUserRole?.base_role || 'user', tenant_role_id: defaultUserRole?.id || '' })}>
                    <PlusIcon className="w-4 h-4" /> Add</button>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-800">
                Office Booking notifications are checked every Friday after 09:00 (Asia/Bangkok) for the following Monday–Friday. The default minimum is 2 booking days.
            </div>
            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr><th>Username</th><th>Full Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Booking Notification</th><th>Min / Week</th><th></th></tr></thead>
                    <tbody>
                        {list.map(u => (
                            <tr key={u.id}>
                                <td className="font-medium">{u.username}</td>
                                <td>{u.full_name}</td><td>{u.email}</td><td>{u.phone_number}</td>
                                <td>
                                    <span className={roleBadge(u.role)}>{u.tenant_role_name || u.role}</span>
                                    <div className="text-[10px] text-slate-400">{u.role}</div>
                                </td>
                                <td>
                                    <div className="flex items-center gap-2">
                                        <button type="button" role="switch"
                                                aria-checked={!!u.office_booking_notification_enabled}
                                                aria-label={`Office Booking Notification for ${u.username}`}
                                                disabled={savingNotifications.has(u.id)}
                                                onClick={() => saveBookingNotification(u, { enabled: !u.office_booking_notification_enabled })}
                                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${u.office_booking_notification_enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${u.office_booking_notification_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                        <span className={`text-xs font-semibold ${u.office_booking_notification_enabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                                            {u.office_booking_notification_enabled ? 'On' : 'Off'}
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    <select className="input !w-20 !py-1.5"
                                            aria-label={`Minimum booking days for ${u.username}`}
                                            value={u.office_booking_min_required || 2}
                                            disabled={savingNotifications.has(u.id)}
                                            onChange={event => saveBookingNotification(u, { min_required: Number(event.target.value) })}>
                                        {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}
                                    </select>
                                </td>
                                <td className="text-right">
                                    <button className="btn-ghost" onClick={() => setEdit({ ...u, password: '' })}><PencilSquareIcon className="w-4 h-4" /></button>
                                    <button className="btn-ghost ml-1" onClick={() => remove(u.id)}><TrashIcon className="w-4 h-4 text-red-500" /></button>
                                </td>
                            </tr>
                        ))}
                        {list.length === 0 && <tr><td colSpan={8} className="text-center text-slate-400 py-6">No users.</td></tr>}
                    </tbody>
                </table>
            </div>
            {edit && <UserForm initial={edit} roles={roles} onClose={() => setEdit(null)} onSave={save} />}
        </div>
    );
}

function UserForm({ initial, roles, onClose, onSave }) {
    const [f, setF] = useState({ ...initial });
    function chooseRole(roleId) {
        const role = roles.find(r => String(r.id) === String(roleId));
        setF({ ...f, tenant_role_id: roleId, role: role?.base_role || f.role });
    }
    return (
        <Modal open onClose={onClose} title={f.id ? `Edit User — ${f.username}` : 'New User'}
               footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave(f)}>Save</button></>}>
            <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Username</label>
                    <input className="input" value={f.username} disabled={!!f.id} onChange={e => setF({ ...f, username: e.target.value })} /></div>
                <div><label className="label">Role</label>
                    <select className="input" value={f.tenant_role_id || ''} onChange={e => chooseRole(e.target.value)}>
                        <option value="">Base role only</option>
                        {roles.map(r => (
                            <option key={r.id} value={r.id}>{r.name} ({r.base_role})</option>
                        ))}
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
