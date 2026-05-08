import { useEffect, useRef, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import { PencilSquareIcon, TrashIcon, PlusIcon, UserCircleIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';

export default function Resources() {
    const [list, setList] = useState([]);
    const [edit, setEdit] = useState(null);

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

    return (
        <div className="space-y-4">
            <div className="flex items-center"><h1 className="text-2xl font-bold">Resources</h1>
                <button className="btn-primary ml-auto" onClick={() => setEdit({ first_name: '', last_name: '', nick_name: '', emp_id: '', role: '', email: '', erp_username: '', skill: '', picture_data: null })}>
                    <PlusIcon className="w-4 h-4" /> Add</button>
            </div>
            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr><th>Photo</th><th>Emp ID</th><th>First</th><th>Last</th><th>Nickname</th><th>Role</th><th>Email</th><th>ERP User</th><th>Skill</th><th></th></tr></thead>
                    <tbody>
                        {list.map(r => (
                            <tr key={r.id}>
                                <td><Avatar resource={r} size={40} /></td>
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
                        {list.length === 0 && <tr><td colSpan={10} className="text-center text-slate-400 py-6">No resources.</td></tr>}
                    </tbody>
                </table>
            </div>
            {edit && <ResourceForm initial={edit} onClose={() => setEdit(null)} onSave={save} />}
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
