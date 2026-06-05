import { useEffect, useRef, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import {
    PencilSquareIcon, TrashIcon, PlusIcon, UserCircleIcon, ArrowUpTrayIcon,
    UserPlusIcon, LinkIcon, XMarkIcon, SparklesIcon, MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

export default function Resources() {
    const [list, setList] = useState([]);
    const [edit, setEdit] = useState(null);
    const [userModal, setUserModal] = useState(null);
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);

    async function load() { setList((await api.get('/resources')).data); }
    useEffect(() => { load(); }, []);

    function saveErrorMessage(err) {
        return err.response?.data?.error
            || err.response?.data?.errors?.[0]?.msg
            || 'Save failed';
    }

    function resourcePayload(f) {
        return {
            emp_id: f.emp_id || null,
            first_name: f.first_name || '',
            last_name: f.last_name || '',
            nick_name: f.nick_name || '',
            role: f.role || '',
            email: f.email || '',
            mobile_phone: f.mobile_phone || '',
            instagram: f.instagram || '',
            line_id: f.line_id || '',
            facebook: f.facebook || '',
            erp_username: f.erp_username || '',
            skill: f.skill || '',
            picture_data: f.picture_data || null
        };
    }

    async function save(f) {
        try {
            const payload = resourcePayload(f);
            if (f.id) await api.put(`/resources/${f.id}`, payload);
            else      await api.post('/resources', payload);
            toast.success('Saved'); setEdit(null); load();
        } catch (err) { toast.error(saveErrorMessage(err)); }
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
                <button className="btn-primary ml-auto" onClick={() => setEdit({ first_name: '', last_name: '', nick_name: '', emp_id: '', role: '', email: '', mobile_phone: '', instagram: '', line_id: '', facebook: '', erp_username: '', skill: '', picture_data: null })}>
                    <PlusIcon className="w-4 h-4" /> Add</button>
            </div>
            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr><th>Photo</th><th>Emp ID</th><th>First</th><th>Last</th><th>Nickname</th><th>Role</th><th>Email</th><th>Mobile</th><th>Instagram</th><th>Line ID</th><th>Facebook</th><th>ERP User</th><th>User</th><th>Skill</th><th></th></tr></thead>
                    <tbody>
                        {list.map(r => (
                            <tr key={r.id}>
                                <td><Avatar resource={r} size={40} /></td>
                                <td className="font-mono text-xs">{r.emp_id}</td>
                                <td>{r.first_name}</td><td>{r.last_name}</td><td>{r.nick_name}</td>
                                <td>{r.role}</td><td>{r.email}</td><td>{r.mobile_phone}</td>
                                <td>{r.instagram}</td><td>{r.line_id}</td><td>{r.facebook}</td><td>{r.erp_username}</td>
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
                        {list.length === 0 && <tr><td colSpan={15} className="text-center text-slate-400 py-6">No resources.</td></tr>}
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

    function roleDropdown() {
        return (
            <select className="input" value={f.tenant_role_id || ''}
                    onChange={e => setF({ ...f, tenant_role_id: e.target.value })}>
                <option value="">Select role</option>
                {roles.map(role => (
                    <option key={role.id} value={role.id}>
                        {role.name} ({role.base_role})
                    </option>
                ))}
            </select>
        );
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
                    <div><span className="label">Mobile Phone</span><div className="text-sm">{r.mobile_phone || '-'}</div></div>
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

                {f.mode === 'existing' ? (
                    <div className="grid grid-cols-2 gap-3">
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
                        <div>
                            <label className="label">Role</label>
                            {roleDropdown()}
                        </div>
                    </div>
                ) : (
                    <div className="rounded-lg border border-slate-200 p-3">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div><span className="label">Username</span><div className="font-mono">{r.erp_username || '-'}</div></div>
                            <div><span className="label">Default Password</span><div className="font-mono">{r.emp_id || '-'}</div></div>
                            <div><span className="label">Full Name</span><div>{fullName || '-'}</div></div>
                            <div><span className="label">Email</span><div>{r.email || '-'}</div></div>
                            <div><span className="label">Mobile Phone</span><div>{r.mobile_phone || '-'}</div></div>
                            <div><label className="label">Role</label>{roleDropdown()}</div>
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
    const [suggesting, setSuggesting] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [selectedSuggestions, setSelectedSuggestions] = useState(() => new Set());
    const [searchingSources, setSearchingSources] = useState(false);
    const [sourceResults, setSourceResults] = useState([]);
    const [selectedSources, setSelectedSources] = useState(() => new Set());
    const [sourceUrls, setSourceUrls] = useState('');
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

    function sourcePayload() {
        const picked = sourceResults.filter((_, idx) => selectedSources.has(idx));
        const manual = String(sourceUrls || '').split(/\n/)
            .map(v => v.trim())
            .filter(Boolean)
            .map(url => ({ title: url, url, snippet: 'Manual source URL' }));
        return [...picked, ...manual];
    }

    async function searchSources() {
        setSearchingSources(true);
        try {
            const res = await api.post('/resources/source-search', f);
            const next = res.data.results || [];
            setSourceResults(next);
            setSelectedSources(new Set(next.map((_, idx) => idx)));
            if (next.length === 0) {
                toast(res.data.reason || 'No source results found');
            } else {
                toast.success(`Found ${next.length} source result(s)`);
            }
        } catch (err) {
            toast.error(err.response?.data?.reason || err.response?.data?.error || 'Source search failed');
        } finally {
            setSearchingSources(false);
        }
    }

    function toggleSource(idx) {
        setSelectedSources(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    }

    async function askAiSuggest() {
        setSuggesting(true);
        try {
            const res = await api.post('/resources/ai-suggest', {
                resource: f,
                sources: sourcePayload()
            });
            const next = res.data.suggestions || [];
            setSuggestions(next);
            setSelectedSuggestions(new Set(next.map(item => item.field)));
            if (next.length === 0) {
                toast(res.data.reason || 'AI has no suggestions for blank fields');
            } else {
                toast.success(`AI suggested ${next.length} field(s)`);
            }
        } catch (err) {
            toast.error(err.response?.data?.reason || err.response?.data?.error || 'AI suggestion failed');
        } finally {
            setSuggesting(false);
        }
    }

    function toggleSuggestion(field) {
        setSelectedSuggestions(prev => {
            const next = new Set(prev);
            if (next.has(field)) next.delete(field); else next.add(field);
            return next;
        });
    }

    function applySuggestions() {
        const chosen = suggestions.filter(item => selectedSuggestions.has(item.field));
        if (chosen.length === 0) return toast.error('Please select at least one suggestion');
        if (!confirm(`Apply ${chosen.length} AI suggestion(s) to this resource?`)) return;
        setF(prev => {
            const next = { ...prev };
            for (const item of chosen) {
                if (!String(next[item.field] || '').trim()) next[item.field] = item.value;
            }
            return next;
        });
        toast.success('AI suggestions applied');
    }

    return (
        <Modal open onClose={onClose}
               title={f.id ? `Edit Resource — ${f.first_name} ${f.last_name}` : 'New Resource'}
               footer={<>
                   <button className="btn-ghost" onClick={searchSources} disabled={searchingSources}>
                       <MagnifyingGlassIcon className="w-4 h-4 text-blue-500" /> {searchingSources ? 'Searching...' : 'Search Sources'}
                   </button>
                   <button className="btn-ghost mr-auto" onClick={askAiSuggest} disabled={suggesting}>
                       <SparklesIcon className="w-4 h-4 text-indigo-500" /> {suggesting ? 'AI Suggesting...' : 'AI Suggest'}
                   </button>
                   <button className="btn-ghost" onClick={onClose}>Cancel</button>
                   <button className="btn-primary" onClick={() => onSave(f)}>Save</button>
               </>}>
            <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <div>
                            <div className="font-semibold text-slate-800">AI Source Review</div>
                            <div className="text-xs text-slate-500">Search or paste source URLs, then select which sources AI may use.</div>
                        </div>
                        {sourceResults.length > 0 && (
                            <span className="ml-auto text-xs text-slate-500">
                                {selectedSources.size} of {sourceResults.length} selected
                            </span>
                        )}
                    </div>
                    {sourceResults.length > 0 && (
                        <div className="max-h-40 overflow-y-auto space-y-2">
                            {sourceResults.map((item, idx) => (
                                <label key={`${item.url}-${idx}`} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm">
                                    <input type="checkbox"
                                           className="mt-1"
                                           checked={selectedSources.has(idx)}
                                           onChange={() => toggleSource(idx)} />
                                    <span className="min-w-0">
                                        <span className="block font-semibold text-slate-800 truncate">{item.title || item.url}</span>
                                        <span className="block text-xs text-blue-600 truncate">{item.url}</span>
                                        {item.snippet && <span className="block text-xs text-slate-500 line-clamp-2">{item.snippet}</span>}
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}
                    <div>
                        <label className="label">Manual Source URLs</label>
                        <textarea className="input" rows={2}
                                  placeholder="One URL per line, e.g. Facebook or LinkedIn profile"
                                  value={sourceUrls}
                                  onChange={e => setSourceUrls(e.target.value)} />
                    </div>
                </div>
                {suggestions.length > 0 && (
                    <div className="col-span-2 rounded-lg border border-indigo-200 bg-indigo-50/70 p-3 space-y-3">
                        <div className="flex items-center gap-2">
                            <SparklesIcon className="w-5 h-5 text-indigo-600" />
                            <div>
                                <div className="font-semibold text-indigo-900">AI Suggestions</div>
                                <div className="text-xs text-indigo-700">Review and apply only the fields you trust.</div>
                            </div>
                            <button type="button" className="btn-primary ml-auto" onClick={applySuggestions}>
                                Apply Selected
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {suggestions.map(item => (
                                <label key={item.field}
                                       className="flex items-start gap-2 rounded-md border border-indigo-100 bg-white p-2 text-sm">
                                    <input type="checkbox"
                                           className="mt-1"
                                           checked={selectedSuggestions.has(item.field)}
                                           onChange={() => toggleSuggestion(item.field)} />
                                    <span className="min-w-0">
                                        <span className="block font-semibold text-slate-800">{item.field.replaceAll('_', ' ')}</span>
                                        <span className="block break-words text-slate-700">{item.value}</span>
                                        <span className="block text-xs text-slate-400">
                                            {item.source || 'AI suggestion'}{item.confidence ? ` - ${Math.round(item.confidence * 100)}%` : ''}
                                        </span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
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
                <div><label className="label">Mobile Phone</label><input className="input" value={f.mobile_phone || ''} onChange={e => setF({ ...f, mobile_phone: e.target.value })} /></div>
                <div><label className="label">Instagram</label><input className="input" value={f.instagram || ''} onChange={e => setF({ ...f, instagram: e.target.value })} /></div>
                <div><label className="label">Line ID</label><input className="input" value={f.line_id || ''} onChange={e => setF({ ...f, line_id: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Facebook</label><input className="input" value={f.facebook || ''} onChange={e => setF({ ...f, facebook: e.target.value })} /></div>
                <div><label className="label">ERP Username</label><input className="input" value={f.erp_username} onChange={e => setF({ ...f, erp_username: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Skill</label><textarea rows={2} className="input" value={f.skill} onChange={e => setF({ ...f, skill: e.target.value })} /></div>
            </div>
        </Modal>
    );
}
