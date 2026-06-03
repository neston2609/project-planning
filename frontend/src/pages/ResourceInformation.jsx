import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import HoverImage from '../components/HoverImage';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import { useAuth } from '../auth';
import {
    UserCircleIcon, MagnifyingGlassIcon, FunnelIcon,
    EnvelopeIcon, IdentificationIcon, BriefcaseIcon,
    PencilSquareIcon, ArrowUpTrayIcon, TrashIcon, PhoneIcon
} from '@heroicons/react/24/outline';

export default function ResourceInformation() {
    const { user } = useAuth();
    const [list, setList]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch]   = useState('');
    const [edit, setEdit]       = useState(null);
    // Multi-select role filter. Empty Set ⇒ "all roles" (no filtering).
    // Members may be a role name (e.g. "Developer") or the sentinel
    // '__none__' which represents resources with a blank role.
    const [roleFilter, setRoleFilter] = useState(() => new Set());

    function toggleRole(value) {
        setRoleFilter(prev => {
            const next = new Set(prev);
            if (next.has(value)) next.delete(value); else next.add(value);
            return next;
        });
    }
    function clearRoles() { setRoleFilter(new Set()); }

    async function loadResources() {
        setLoading(true);
        try {
            const r = await api.get('/resources');
            setList(r.data);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load resources');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadResources(); }, []);

    async function saveOwnResource(f) {
        try {
            const payload = {
                first_name: f.first_name || '',
                last_name: f.last_name || '',
                nick_name: f.nick_name || '',
                role: f.role || '',
                email: f.email || '',
                mobile_phone: f.mobile_phone || '',
                skill: f.skill || '',
                picture_data: f.picture_data || null
            };
            const res = await api.put(`/resources/${f.id}`, payload);
            setList(prev => prev.map(r => Number(r.id) === Number(f.id) ? res.data : r));
            setEdit(null);
            toast.success('Resource information saved');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        }
    }

    // Sorted unique role list for the filter dropdown
    const roles = useMemo(() => {
        const set = new Set(list.map(r => (r.role || '').trim()).filter(Boolean));
        return Array.from(set).sort();
    }, [list]);

    const filtered = useMemo(() => {
        let out = list;
        if (roleFilter.size > 0) {
            out = out.filter(r => {
                const role = (r.role || '').trim();
                return role ? roleFilter.has(role) : roleFilter.has('__none__');
            });
        }
        if (search) {
            const q = search.toLowerCase();
            out = out.filter(r =>
                `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase().includes(q) ||
                (r.nick_name    || '').toLowerCase().includes(q) ||
                (r.role         || '').toLowerCase().includes(q) ||
                (r.email        || '').toLowerCase().includes(q) ||
                (r.mobile_phone || '').toLowerCase().includes(q) ||
                (r.skill        || '').toLowerCase().includes(q) ||
                (r.emp_id       || '').toLowerCase().includes(q)
            );
        }
        return [...out].sort((a, b) =>
            (a.first_name || '').localeCompare(b.first_name || '') ||
            (a.last_name  || '').localeCompare(b.last_name  || '')
        );
    }, [list, search, roleFilter]);

    const roleCounts = useMemo(() => {
        const m = new Map();
        for (const r of list) {
            const role = (r.role || '').trim() || 'No Role';
            m.set(role, (m.get(role) || 0) + 1);
        }
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }, [list]);

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-3xl font-extrabold">
                    <span className="brand-mark">Resource Information</span>
                </h1>
                <p className="text-sm text-slate-500 mt-1">Team directory · {list.length} {list.length === 1 ? 'person' : 'people'}.</p>
            </div>

            {/* Role count chips — click to filter */}
            {list.length > 0 && (
                <div className="card p-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase tracking-wider font-bold text-slate-500 mr-1">By Role</span>

                    {/* Total clears the filter (selecting nothing = all) */}
                    <button type="button" onClick={clearRoles}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold shadow transition ${
                                roleFilter.size === 0
                                    ? 'text-white ring-2 ring-offset-2 ring-indigo-400'
                                    : 'text-white hover:brightness-110'
                            }`}
                            style={{ backgroundImage: 'var(--grad-brand)' }}>
                        <span className="text-base font-extrabold">{list.length}</span>
                        <span className="opacity-90">Total</span>
                    </button>

                    {roleCounts.map(([role, count]) => {
                        // The chip labeled "No Role" maps to the special filter value '__none__'.
                        const filterValue = role === 'No Role' ? '__none__' : role;
                        const active = roleFilter.has(filterValue);
                        return (
                            <button key={role} type="button"
                                onClick={() => toggleRole(filterValue)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm transition ${
                                    active
                                        ? 'bg-indigo-600 text-white border border-indigo-600 shadow ring-2 ring-offset-2 ring-indigo-300'
                                        : 'bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-sm'
                                }`}>
                                <span className={`font-bold tabular-nums ${active ? 'text-white' : 'text-indigo-700'}`}>{count}</span>
                                <span className={active ? 'text-white' : 'text-slate-600'}>{role}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Filter bar */}
            <div className="card p-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                    <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
                    <input className="input !border-0 !bg-transparent !p-0 focus:!ring-0 flex-1"
                        placeholder="Search by name / nickname / role / email / mobile / skill..."
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-1.5">
                    <FunnelIcon className="w-4 h-4 text-indigo-500" />
                    <select className="input !w-auto !py-1.5 font-medium"
                            value=""
                            onChange={e => {
                                const v = e.target.value;
                                if (v) toggleRole(v);
                            }}>
                        <option value="">{roleFilter.size === 0 ? 'All Roles' : '+ Add role…'}</option>
                        {roles.filter(r => !roleFilter.has(r)).map(r =>
                            <option key={r} value={r}>{r}</option>)}
                        {!roleFilter.has('__none__') && <option value="__none__">— No Role —</option>}
                    </select>
                    {roleFilter.size > 0 && (
                        <button type="button" onClick={clearRoles}
                                className="text-xs text-slate-500 hover:text-indigo-600 underline whitespace-nowrap">
                            Clear ({roleFilter.size})
                        </button>
                    )}
                </div>
            </div>

            {/* Cards grid */}
            {loading ? (
                <p className="text-slate-500 animate-pulse">Loading...</p>
            ) : filtered.length === 0 ? (
                <p className="text-slate-500">No resources match your filter.</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filtered.map(r => (
                        <ResourceCard key={r.id}
                                      r={r}
                                      userId={user?.id}
                                      onEdit={() => setEdit(r)} />
                    ))}
                </div>
            )}

            {edit && (
                <OwnResourceForm initial={edit}
                                 onClose={() => setEdit(null)}
                                 onSave={saveOwnResource} />
            )}
        </div>
    );
}

function ResourceCard({ r, userId, onEdit }) {
    const initials = ((r.first_name?.[0] || '') + (r.last_name?.[0] || '')).toUpperCase() || '?';
    const canEdit = Number(r.user_id) === Number(userId);
    return (
        <div className="card p-5 fade-in hover:-translate-y-0.5 hover:shadow-lg transition-all relative">
            {canEdit && (
                <button type="button"
                        className="btn-ghost !p-2 absolute top-3 right-3"
                        title="Edit my resource information"
                        onClick={onEdit}>
                    <PencilSquareIcon className="w-4 h-4" />
                </button>
            )}
            <div className="flex items-start gap-4">
                <HoverImage previewSrc={r.picture_data}
                            previewAlt={`${r.first_name} ${r.last_name}`}
                            previewSize={320}>
                    {r.picture_data ? (
                        <img src={r.picture_data} alt={`${r.first_name} ${r.last_name}`}
                             className="w-16 h-16 rounded-full object-cover border-2 border-white shadow" />
                    ) : (
                        <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow"
                             style={{ backgroundImage: 'var(--grad-brand)' }}>
                            {initials}
                        </div>
                    )}
                </HoverImage>
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 truncate" title={`${r.first_name} ${r.last_name}`}>
                        {r.first_name} {r.last_name}
                    </div>
                    {r.nick_name && (
                        <div className="text-xs text-slate-500 truncate">"{r.nick_name}"</div>
                    )}
                    {r.role && (
                        <span className="mt-1 inline-flex items-center gap-1 pill bg-indigo-50 text-indigo-700 ring-indigo-200">
                            <BriefcaseIcon className="w-3 h-3" /> {r.role}
                        </span>
                    )}
                </div>
            </div>

            <div className="mt-4 space-y-1.5 text-sm">
                {r.emp_id && (
                    <div className="flex items-center gap-2 text-slate-600">
                        <IdentificationIcon className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="font-mono text-xs">{r.emp_id}</span>
                    </div>
                )}
                {r.email && (
                    <div className="flex items-center gap-2 text-slate-600 min-w-0">
                        <EnvelopeIcon className="w-4 h-4 text-slate-400 shrink-0" />
                        <a href={`mailto:${r.email}`} className="truncate text-indigo-600 hover:underline">{r.email}</a>
                    </div>
                )}
                {r.mobile_phone && (
                    <div className="flex items-center gap-2 text-slate-600 min-w-0">
                        <PhoneIcon className="w-4 h-4 text-slate-400 shrink-0" />
                        <a href={`tel:${r.mobile_phone}`} className="truncate text-indigo-600 hover:underline">{r.mobile_phone}</a>
                    </div>
                )}
                {r.erp_username && (
                    <div className="flex items-center gap-2 text-slate-600">
                        <UserCircleIcon className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-500">ERP:</span>
                        <span className="truncate text-slate-700">{r.erp_username}</span>
                    </div>
                )}
            </div>

            {r.skill && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Skill</div>
                    <div className="text-xs text-slate-600 leading-relaxed line-clamp-3" title={r.skill}>{r.skill}</div>
                </div>
            )}
        </div>
    );
}

function OwnResourceForm({ initial, onClose, onSave }) {
    const [f, setF] = useState({ ...initial });
    const fileRef = useRef(null);

    function pickPicture() {
        fileRef.current?.click();
    }

    function onFileChange(e) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            return toast.error('Please choose an image file');
        }
        if (file.size > 2 * 1024 * 1024) {
            return toast.error('Image must be 2 MB or smaller');
        }
        const reader = new FileReader();
        reader.onload = () => setF(s => ({ ...s, picture_data: String(reader.result) }));
        reader.onerror = () => toast.error('Could not read file');
        reader.readAsDataURL(file);
    }

    return (
        <Modal open onClose={onClose}
               title="Edit My Resource Information"
               footer={<>
                   <button className="btn-ghost" onClick={onClose}>Cancel</button>
                   <button className="btn-primary" onClick={() => onSave(f)}>Save</button>
               </>}>
            <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                    <label className="label">Photo</label>
                    <div className="flex items-center gap-4 p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <div className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden bg-white border border-slate-200">
                            {f.picture_data
                                ? <img src={f.picture_data} alt="photo" className="w-full h-full object-cover" />
                                : <UserCircleIcon className="w-20 h-20 text-slate-300" />}
                        </div>
                        <div className="flex-1 space-y-2">
                            <button type="button" className="btn-ghost" onClick={pickPicture}>
                                <ArrowUpTrayIcon className="w-4 h-4" /> {f.picture_data ? 'Replace photo' : 'Upload photo'}
                            </button>
                            {f.picture_data && (
                                <button type="button" className="btn-ghost ml-2" onClick={() => setF(s => ({ ...s, picture_data: null }))}>
                                    <TrashIcon className="w-4 h-4 text-red-500" /> Remove
                                </button>
                            )}
                            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
                        </div>
                    </div>
                </div>

                <div><label className="label">First Name</label><input className="input" value={f.first_name || ''} onChange={e => setF({ ...f, first_name: e.target.value })} /></div>
                <div><label className="label">Last Name</label><input className="input" value={f.last_name || ''} onChange={e => setF({ ...f, last_name: e.target.value })} /></div>
                <div><label className="label">Nickname</label><input className="input" value={f.nick_name || ''} onChange={e => setF({ ...f, nick_name: e.target.value })} /></div>
                <div><label className="label">Role</label><input className="input" value={f.role || ''} onChange={e => setF({ ...f, role: e.target.value })} /></div>
                <div><label className="label">Email</label><input className="input" value={f.email || ''} onChange={e => setF({ ...f, email: e.target.value })} /></div>
                <div><label className="label">Mobile Phone</label><input className="input" value={f.mobile_phone || ''} onChange={e => setF({ ...f, mobile_phone: e.target.value })} /></div>
                <div><label className="label">Emp ID</label><input className="input bg-slate-100" value={f.emp_id || ''} disabled /></div>
                <div className="col-span-2"><label className="label">ERP Username</label><input className="input bg-slate-100" value={f.erp_username || ''} disabled /></div>
                <div className="col-span-2"><label className="label">Skill</label><textarea rows={3} className="input" value={f.skill || ''} onChange={e => setF({ ...f, skill: e.target.value })} /></div>
            </div>
        </Modal>
    );
}
