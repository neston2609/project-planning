import { useEffect, useRef, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import {
    PencilSquareIcon, TrashIcon, PlusIcon, UserCircleIcon, ArrowUpTrayIcon,
    UserPlusIcon, LinkIcon, XMarkIcon
} from '@heroicons/react/24/outline';

export default function Resources() {
    const [list, setList] = useState([]);
    const [edit, setEdit] = useState(null);
    const [userModal, setUserModal] = useState(null);
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);

    async function load() { setList((await api.get('/resources')).data); }
    useEffect(() => { load(); }, []);

    async function save(f) {
        try {
            if (f.id) await api.put(`/resources/${f.id}`, f);
            else      await api.post('/resources', f);
            toast.success('Saved'); setEdit(null); load();
        } catch (err) { toast.error(err.response?.data?.error || 'Save failed'); }
    }
    async function remove(id) {
        if (!confirm('Delete resource?')) return;
        await api.delete(`/resources/${id}`);
        toast.success('Deleted'); load();
    }
    async function openUserModal(resource) {
        try {
            const [userRows, roleRows] = await Promise.all([
                api.get('/resources/users'),
                api.get('/resources/roles')
            ]);
            const nextUsers = userRows.data || [];
            const nextRoles = roleRows.data || [];
            setUsers(nextUsers);
            setRoles(nextRoles);
            const linkedUser = nextUsers.find(u => Number(u.id) === Number(resource.user_id));
            const defaultRole = nextRoles.find(r => r.is_system && r.base_role === 'user') || nextRoles[0];
            setUserModal({
                resource,
                mode: resource.user_id ? 'existing' : 'create',
                user_id: resource.user_id || '',
                tenant_role_id: resource.mapped_tenant_role_id || linkedUser?.tenant_role_id || defaultRole?.id || ''
            });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load users');
        }
    }
    async function saveUserLink(f) {
        try {
            if (f.mode === 'existing') {
                if (!f.user_id) return toast.error('Please select a user');
                if (!f.tenant_role_id) return toast.error('Please select a role');
                await api.post(`/resources/${f.resource.id}/map-user`, {
                    user_id: Number(f.user_id),
                    tenant_role_id: Number(f.tenant_role_id)
                });
                toast.success('User mapped');
            } else {
                if (!f.tenant_role_id) return toast.error('Please select a role');
                await api.post(`/resources/${f.resource.id}/create-user`, {
                    tenant_role_id: Number(f.tenant_role_id)
                });
                toast.success('User created and mapped');
            }
            setUserModal(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'User mapping failed');
        }
    }
    async function unlinkUser(resource) {
        if (!confirm('Unlink this user from the resource?')) return;
        try {
            await api.delete(`/resources/${resource.id}/user`);
            toast.success('User unlinked');
            setUserModal(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Unlink failed');
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center"><h1 className="text-2xl font-bold">Resources</h1>
                <button className="btn-primary ml-auto" onClick={() => setEdit({ first_name: '', last_name: '', nick_name: '', emp_id: '', role: '', email: '', erp_username: '', skill: '', picture_data: null })}>
                    <PlusIcon className="w-4 h-4" /> Add</button>
            </div>
            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr><th>Photo</th><th>Emp ID</th><th>First</th><th>Last</th><th>Nickname</th><th>Role</th><th>Email</th><th>ERP User</th><th>User</th><th>Skill</th><th></th></tr></thead>
                    <tbody>
                        {list.map(r => (
                            <tr key={r.id}>
                                <td><Avatar resource={r} size={40} /></td>
                                <td className="font-mono text-xs">{r.emp_id}</td>
                                <td>{r.first_name}</td><td>{r.last_name}</td><td>{r.nick_name}</td>
                                <td>{r.role}</td><td>{r.email}</td><td>{r.erp_username}</td>
                                <td>
                                    {r.user_id ? (
                                        <button className="btn-ghost" onClick={() => openUserModal(r)}
                                                title="Change linked user">
                                            <LinkIcon className="w-4 h-4 text-emerald-600" />
                                            <span className="font-mono text-xs">{r.mapped_username}</span>
                                        </button>
                                    ) : (
                                        <button className="btn-ghost" onClick={() => openUserModal(r)}
                                                title="Add or map user">
                                            <UserPlusIcon className="w-4 h-4 text-blue-600" /> Add User
                                        </button>
                                    )}
                                </td>
                                <td className="max-w-[200px] truncate" title={r.skill}>{r.skill}</td>
                                <td className="text-right">
                                    <button className="btn-ghost" onClick={() => setEdit(r)}><PencilSquareIcon className="w-4 h-4" /></button>
                                    <button className="btn-ghost ml-1" onClick={() => remove(r.id)}><TrashIcon className="w-4 h-4 text-red-500" /></button>
                                </td>
                            </tr>
                        ))}
                        {list.length === 0 && <tr><td colSpan={11} className="text-center text-slate-400 py-6">No resources.</td></tr>}
                    </tbody>
                </table>
            </div>
            {edit && <ResourceForm initial={edit} onClose={() => setEdit(null)} onSave={save} />}
            {userModal && (
                <ResourceUserModal initial={userModal} users={users} roles={roles}
                                   onClose={() => setUserModal(null)}
                                   onSave={saveUserLink}
                                   onUnlink={unlinkUser} />
            )}
        </div>
    );
}

function Avatar({ resource, size = 40 }) {
    if (resource.picture_data) {
        return <img src={resource.picture_data} alt={`${resource.first_name} ${resource.last_name}`}
                    className="rounded-full object-cover border border-slate-200 bg-white"
                    style={{ width: size, height: size }} />;
    }
    const initials = ((resource.first_name?.[0] || '') + (resource.last_name?.[0] || '')).toUpperCase() || '?';
    return (
        <div className="rounded-full flex items-center justify-center text-white font-bold shadow-sm"
             style={{ width: size, height: size, fontSize: size * 0.4, backgroundImage: 'var(--grad-brand)' }}>
            {initials}
        </div>
    );
}

function ResourceUserModal({ initial, users, roles, onClose, onSave, onUnlink }) {
    const [f, setF] = useState({ ...initial });
    const r = f.resource;
    const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || r.nick_name || r.erp_username || '';
    const canCreate = !!String(r.erp_username || '').trim() && !!String(r.emp_id || '').trim() && !r.user_id;
    const canSave = (f.mode === 'existing' ? !!f.user_id : canCreate) && !!f.tenant_role_id;

    function chooseUser(userId) {
        const user = users.find(u => String(u.id) === String(userId));
        const fallbackRole = roles.find(role => role.is_system && role.base_role === 'user') || roles[0];
        setF({
            ...f,
            user_id: userId,
            tenant_role_id: user?.tenant_role_id || fallbackRole?.id || ''
        });
    }

    return (
        <Modal open onClose={onClose} title={`User Link - ${r.first_name || ''} ${r.last_name || ''}`.trim()} size="lg"
               footer={<>
                   {r.user_id && (
                       <button className="btn-ghost mr-auto" onClick={() => onUnlink(r)}>
                           <XMarkIcon className="w-4 h-4 text-red-500" /> Unlink
                       </button>
                   )}
                   <button className="btn-ghost" onClick={onClose}>Cancel</button>
                   <button className="btn-primary" disabled={!canSave} onClick={() => onSave(f)}>
                       {f.mode === 'existing' ? 'Map User' : 'Create User'}
                   </button>
               </>}>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3 bg-slate-50">
                    <div><span className="label">Resource</span><div className="font-semibold">{fullName || '-'}</div></div>
                    <div><span className="label">Emp ID</span><div className="font-mono text-sm">{r.emp_id || '-'}</div></div>
                    <div><span className="label">Email</span><div className="text-sm">{r.email || '-'}</div></div>
                    <div><span className="label">ERP Username</span><div className="font-mono text-sm">{r.erp_username || '-'}</div></div>
                    {r.user_id && (
                        <div className="col-span-2">
                            <span className="label">Current Linked User</span>
                            <div className="font-mono text-sm">{r.mapped_username || '-'}</div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <label className={`rounded-lg border p-3 cursor-pointer ${f.mode === 'existing' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                        <input type="radio" className="mr-2" checked={f.mode === 'existing'}
                               onChange={() => setF({ ...f, mode: 'existing' })} />
                        Map existing user
                        <p className="text-xs text-slate-500 mt-1">Choose a user already created in this tenant.</p>
                    </label>
                    <label className={`rounded-lg border p-3 ${r.user_id ? 'opacity-60' : 'cursor-pointer'} ${f.mode === 'create' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                        <input type="radio" className="mr-2" checked={f.mode === 'create'} disabled={!!r.user_id}
                               onChange={() => setF({ ...f, mode: 'create' })} />
                        Create new user
                        <p className="text-xs text-slate-500 mt-1">Username uses ERP Username. Default password uses Emp ID.</p>
                    </label>
                </div>

                <div>
                    <label className="label">Role</label>
                    <select className="input" value={f.tenant_role_id || ''}
                            onChange={e => setF({ ...f, tenant_role_id: e.target.value })}>
                        <option value="">Select role</option>
                        {roles.map(role => (
                            <option key={role.id} value={role.id}>
                                {role.name} ({role.base_role})
                            </option>
                        ))}
                    </select>
                </div>

                {f.mode === 'existing' ? (
                    <div>
                        <label className="label">User</label>
                        <select className="input" value={f.user_id || ''} onChange={e => chooseUser(e.target.value)}>
                            <option value="">Select user</option>
                            {users.map(u => {
                                const mappedElsewhere = u.mapped_resource_id && Number(u.mapped_resource_id) !== Number(r.id);
                                const suffix = mappedElsewhere ? ` - linked to ${u.mapped_resource_name || 'another resource'}` : '';
                                return (
                                    <option key={u.id} value={u.id} disabled={mappedElsewhere}>
                                        {u.username} ({u.full_name || u.email || u.role}){suffix}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                ) : (
                    <div className="rounded-lg border border-slate-200 p-3">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div><span className="label">Username</span><div className="font-mono">{r.erp_username || '-'}</div></div>
                            <div><span className="label">Default Password</span><div className="font-mono">{r.emp_id || '-'}</div></div>
                            <div><span className="label">Full Name</span><div>{fullName || '-'}</div></div>
                            <div><span className="label">Email</span><div>{r.email || '-'}</div></div>
                            <div><span className="label">Role</span><div>{roles.find(role => String(role.id) === String(f.tenant_role_id))?.name || '-'}</div></div>
                            <div><span className="label">Must Change Password</span><div>Yes</div></div>
                        </div>
                        {!canCreate && (
                            <p className="text-xs text-red-500 mt-3">
                                ERP Username and Emp ID are required before creating a user from this resource.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
}

function ResourceForm({ initial, onClose, onSave }) {
    const [f, setF] = useState({ ...initial });
    const fileRef = useRef(null);

    function pickPicture() { fileRef.current?.click(); }

    function onFileChange(e) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            return toast.error('Please choose an image file (PNG, JPG, etc.)');
        }
        if (file.size > 2 * 1024 * 1024) {
            return toast.error('Image must be 2 MB or smaller');
        }
        const reader = new FileReader();
        reader.onload = () => setF(s => ({ ...s, picture_data: String(reader.result) }));
        reader.onerror = () => toast.error('Could not read file');
        reader.readAsDataURL(file);
    }

    function clearPicture() {
        setF(s => ({ ...s, picture_data: null }));
    }

    return (
        <Modal open onClose={onClose}
               title={f.id ? `Edit Resource — ${f.first_name} ${f.last_name}` : 'New Resource'}
               footer={<><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave(f)}>Save</button></>}>
            <div className="grid grid-cols-2 gap-3">
                {/* ---------- Picture uploader ---------- */}
                <div className="col-span-2">
                    <label className="label">Photo</label>
                    <div className="flex items-center gap-4 p-3 rounded-lg border border-slate-200 bg-gradient-to-br from-indigo-50/40 to-pink-50/40">
                        <div className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden bg-white border-2 border-white shadow">
                            {f.picture_data
                                ? <img src={f.picture_data} alt="photo" className="w-full h-full object-cover" />
                                : <UserCircleIcon className="w-20 h-20 text-slate-300" />}
                        </div>
                        <div className="flex-1 space-y-2">
                            <button type="button" className="btn-ghost" onClick={pickPicture}>
                                <ArrowUpTrayIcon className="w-4 h-4" /> {f.picture_data ? 'Replace photo' : 'Upload photo'}
                            </button>
                            {f.picture_data && (
                                <button type="button" className="btn-ghost ml-2" onClick={clearPicture}>
                                    <TrashIcon className="w-4 h-4 text-red-500" /> Remove
                                </button>
                            )}
                            <p className="text-xs text-slate-500">PNG or JPG · max 2 MB. Square images look best.</p>
                            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
                        </div>
                    </div>
                </div>

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
