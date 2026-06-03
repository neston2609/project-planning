import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import { PencilSquareIcon, TrashIcon, PlusIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { DEFAULT_MENU_KEYS } from '../../menuRegistry';

const ROLE_RANK = { user: 1, admin: 2, superadmin: 3 };

export default function RoleManagement() {
    const [roles, setRoles] = useState([]);
    const [menus, setMenus] = useState([]);
    const [edit, setEdit] = useState(null);

    async function load() {
        const [r, m] = await Promise.all([
            api.get('/admin/roles'),
            api.get('/admin/menu-registry')
        ]);
        setRoles(r.data || []);
        setMenus(m.data || []);
    }
    useEffect(() => { load(); }, []);

    async function save(f) {
        try {
            const payload = {
                name: f.name,
                base_role: f.base_role,
                menu_permissions: f.menu_permissions || []
            };
            if (f.id) await api.put(`/admin/roles/${f.id}`, payload);
            else await api.post('/admin/roles', payload);
            toast.success('Role saved');
            setEdit(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        }
    }

    async function remove(role) {
        if (!confirm(`Delete role "${role.name}"?`)) return;
        try {
            await api.delete(`/admin/roles/${role.id}`);
            toast.success('Role deleted');
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Delete failed');
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Role Management</h1>
                    <p className="text-sm text-slate-500">Configure menu access per tenant role.</p>
                </div>
                <button className="btn-primary ml-auto"
                        onClick={() => setEdit({ name: '', base_role: 'user', menu_permissions: DEFAULT_MENU_KEYS.user })}>
                    <PlusIcon className="w-4 h-4" /> New Role
                </button>
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr>
                        <th>Role</th><th>Base Role</th><th>Menus</th><th>Users</th><th></th>
                    </tr></thead>
                    <tbody>
                        {roles.map(r => (
                            <tr key={r.id}>
                                <td>
                                    <div className="flex items-center gap-2">
                                        <ShieldCheckIcon className="w-4 h-4 text-indigo-500" />
                                        <span className="font-semibold">{r.name}</span>
                                        {r.is_system && <span className="pill bg-slate-100 text-slate-600">default</span>}
                                    </div>
                                </td>
                                <td>{r.base_role}</td>
                                <td className="text-slate-500">{(r.menu_permissions || []).length} menu(s)</td>
                                <td>{r.user_count || 0}</td>
                                <td className="text-right">
                                    <button className="btn-ghost" onClick={() => setEdit(r)}>
                                        <PencilSquareIcon className="w-4 h-4" />
                                    </button>
                                    {!r.is_system && (
                                        <button className="btn-ghost ml-1" onClick={() => remove(r)}>
                                            <TrashIcon className="w-4 h-4 text-red-500" />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {roles.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-6">No roles.</td></tr>}
                    </tbody>
                </table>
            </div>

            {edit && (
                <RoleForm initial={edit} menus={menus} onClose={() => setEdit(null)} onSave={save} />
            )}
        </div>
    );
}

function RoleForm({ initial, menus, onClose, onSave }) {
    const [f, setF] = useState({
        ...initial,
        menu_permissions: initial.menu_permissions || []
    });
    const grouped = useMemo(() => {
        const map = new Map();
        for (const m of menus) {
            if (!map.has(m.group)) map.set(m.group, []);
            map.get(m.group).push(m);
        }
        return [...map.entries()];
    }, [menus]);
    const selected = new Set(f.menu_permissions || []);
    const canUseMenu = (item, baseRole = f.base_role) =>
        (ROLE_RANK[baseRole] || ROLE_RANK.user) >= (ROLE_RANK[item.min_role] || ROLE_RANK.user);
    const filterAllowed = (baseRole, keys) => {
        const allowed = new Set(menus.filter(item => canUseMenu(item, baseRole)).map(item => item.key));
        return keys.filter(key => allowed.has(key));
    };
    function toggle(key) {
        const item = menus.find(m => m.key === key);
        if (item && !canUseMenu(item)) return;
        const next = new Set(selected);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setF({ ...f, menu_permissions: [...next] });
    }
    function setGroup(items, checked) {
        const next = new Set(selected);
        for (const item of items) {
            if (!canUseMenu(item)) continue;
            if (checked) next.add(item.key);
            else next.delete(item.key);
        }
        setF({ ...f, menu_permissions: [...next] });
    }
    function chooseBaseRole(baseRole) {
        const defaults = DEFAULT_MENU_KEYS[baseRole] || [];
        setF({
            ...f,
            base_role: baseRole,
            menu_permissions: f.id ? filterAllowed(baseRole, f.menu_permissions || []) : defaults
        });
    }
    return (
        <Modal open onClose={onClose} title={f.id ? `Edit Role - ${initial.name}` : 'New Role'} size="lg"
               footer={<>
                   <button className="btn-ghost" onClick={onClose}>Cancel</button>
                   <button className="btn-primary" onClick={() => onSave(f)}>Save</button>
               </>}>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="label">Role Name</label>
                        <input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
                    </div>
                    <div>
                        <label className="label">Base Role</label>
                        <select className="input" value={f.base_role} onChange={e => chooseBaseRole(e.target.value)}>
                            <option value="user">user</option>
                            <option value="admin">admin</option>
                            <option value="superadmin">superadmin</option>
                        </select>
                        <p className="text-xs text-slate-400 mt-1">Base role controls backend API access.</p>
                    </div>
                </div>

                {grouped.map(([group, items]) => {
                    const usableItems = items.filter(item => canUseMenu(item));
                    const allChecked = usableItems.length > 0 && usableItems.every(item => selected.has(item.key));
                    return (
                        <div key={group} className="rounded-lg border border-slate-200 p-3">
                            <label className="flex items-center gap-2 font-bold text-slate-700 mb-2">
                                <input type="checkbox" checked={allChecked} disabled={usableItems.length === 0}
                                       onChange={e => setGroup(items, e.target.checked)} />
                                {group}
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {items.map(item => {
                                    const usable = canUseMenu(item);
                                    return (
                                    <label key={item.key} className={`flex items-center gap-2 text-sm ${usable ? '' : 'text-slate-400'}`}>
                                        <input type="checkbox" checked={selected.has(item.key)}
                                               disabled={!usable}
                                               onChange={() => toggle(item.key)} />
                                        <span>{item.label}</span>
                                        <span className="text-[10px] text-slate-400">({item.min_role})</span>
                                    </label>
                                );})}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}
