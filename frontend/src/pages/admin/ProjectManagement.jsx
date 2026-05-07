import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { useYear } from '../../YearContext';
import StatusPill from '../../components/StatusPill';
import Modal from '../../components/Modal';
import { baht, formatDate } from '../../format';
import { PencilSquareIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';

export default function ProjectManagement() {
    const { year } = useYear();
    const [list, setList] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [editing, setEditing] = useState(null); // project being edited
    const [creating, setCreating] = useState(false);
    const [search, setSearch] = useState('');

    async function load() {
        const [p, c] = await Promise.all([api.get('/projects'), api.get('/customers')]);
        setList(p.data); setCustomers(c.data);
    }
    useEffect(() => { load(); }, []);

    async function openProject(id) {
        const r = await api.get(`/projects/${id}`);
        setEditing(r.data);
    }

    async function deleteProject(id) {
        if (!confirm('Delete this project and all its data?')) return;
        await api.delete(`/projects/${id}`);
        toast.success('Deleted');
        load();
    }

    const filtered = list.filter(p => {
        if (!search) return true;
        const q = search.toLowerCase();
        return p.project_code.toLowerCase().includes(q) ||
               (p.description || '').toLowerCase().includes(q) ||
               (p.customer_alias || '').toLowerCase().includes(q);
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">Project Management</h1>
                <button className="btn-primary ml-auto" onClick={() => setCreating(true)}>
                    <PlusIcon className="w-4 h-4" /> New Project
                </button>
            </div>

            <div className="card p-3">
                <input className="input" placeholder="Search code / description / customer..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead>
                        <tr>
                            <th>Code</th><th>Description</th><th>Customer</th><th>Status</th>
                            <th>Start</th><th>End</th><th>Pipeline Target</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(p => (
                            <tr key={p.id}>
                                <td className="font-mono text-xs">{p.project_code}</td>
                                <td className="max-w-[280px] truncate" title={p.description}>{p.description}</td>
                                <td>{p.customer_alias || '-'}</td>
                                <td><StatusPill status={p.status} /></td>
                                <td>{formatDate(p.project_start_date)}</td>
                                <td>{formatDate(p.project_end_date)}</td>
                                <td>{formatDate(p.pipeline_target_date)}</td>
                                <td className="text-right">
                                    <button className="btn-ghost" onClick={() => openProject(p.id)}><PencilSquareIcon className="w-4 h-4" /></button>
                                    <button className="btn-ghost ml-1" onClick={() => deleteProject(p.id)}><TrashIcon className="w-4 h-4 text-red-500" /></button>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && <tr><td colSpan={8} className="text-center text-slate-400 py-6">No projects.</td></tr>}
                    </tbody>
                </table>
            </div>

            {creating && (
                <CreateProjectModal customers={customers} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); load(); openProject(id); }} />
            )}

            {editing && (
                <ProjectEditor project={editing} customers={customers} onClose={() => setEditing(null)} onSaved={async () => { await load(); const r = await api.get(`/projects/${editing.id}`); setEditing(r.data); }} year={year} />
            )}
        </div>
    );
}

// ---------- Create Project ----------
function CreateProjectModal({ customers, onClose, onCreated }) {
    const [f, setF] = useState({
        project_code: '', description: '', customer_id: '',
        project_start_date: '', project_end_date: '',
        status: 'Pipeline', pipeline_target_date: '', note: ''
    });
    const [busy, setBusy] = useState(false);

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        try {
            const r = await api.post('/projects', {
                ...f, customer_id: f.customer_id ? Number(f.customer_id) : null,
                project_start_date: f.project_start_date || null,
                project_end_date:   f.project_end_date   || null,
                pipeline_target_date: f.pipeline_target_date || null
            });
            toast.success('Project created');
            onCreated(r.data.id);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Create failed');
        } finally { setBusy(false); }
    }

    return (
        <Modal open onClose={onClose} title="New Project" size="lg"
               footer={<>
                   <button className="btn-ghost" onClick={onClose}>Cancel</button>
                   <button className="btn-primary" disabled={busy} onClick={submit}>Create</button>
               </>}>
            <form onSubmit={submit} className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="label">Project Code</label>
                    <input className="input" required value={f.project_code} onChange={e => setF({ ...f, project_code: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Description</label>
                    <input className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
                <div><label className="label">Customer</label>
                    <select className="input" value={f.customer_id} onChange={e => setF({ ...f, customer_id: e.target.value })}>
                        <option value="">—</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.alias} — {c.full_name}</option>)}
                    </select></div>
                <div><label className="label">Status</label>
                    <select className="input" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
                        <option>Pipeline</option><option>Win</option><option>Loss</option><option>Backlog</option>
                    </select></div>
                <div><label className="label">Start Date</label>
                    <input type="date" className="input" value={f.project_start_date} onChange={e => setF({ ...f, project_start_date: e.target.value })} /></div>
                <div><label className="label">End Date</label>
                    <input type="date" className="input" value={f.project_end_date} onChange={e => setF({ ...f, project_end_date: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Pipeline Target Date</label>
                    <input type="date" className="input" value={f.pipeline_target_date} onChange={e => setF({ ...f, pipeline_target_date: e.target.value })} /></div>
            </form>
        </Modal>
    );
}

// ---------- Project Editor with 5 tabs ----------
function ProjectEditor({ project, customers, onClose, onSaved, year }) {
    const tabs = ['Master','Subscription','Perpetual / SW MA','Service MA','Implementation','Outsource'];
    const [active, setActive] = useState('Master');
    return (
        <Modal open onClose={onClose} size="xl"
               title={`Edit — ${project.project_code} ${project.description ? '— ' + project.description : ''}`}>
            <div className="border-b border-slate-200 mb-4 flex flex-wrap gap-1">
                {tabs.map(t => (
                    <button key={t}
                        className={`px-3 py-1.5 text-sm rounded-t-md ${active === t ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                        onClick={() => setActive(t)}>
                        {t}
                    </button>
                ))}
            </div>
            {active === 'Master'        && <MasterTab project={project} customers={customers} onSaved={onSaved} />}
            {active === 'Subscription'  && <SubscriptionTab project={project} onSaved={onSaved} />}
            {active === 'Perpetual / SW MA' && <PerpetualTab project={project} onSaved={onSaved} />}
            {active === 'Service MA'    && <ServiceMATab project={project} onSaved={onSaved} />}
            {active === 'Implementation'&& <ImplementationTab project={project} onSaved={onSaved} />}
            {active === 'Outsource'     && <OutsourceTab project={project} year={year} onSaved={onSaved} />}
        </Modal>
    );
}

function MasterTab({ project, customers, onSaved }) {
    const [f, setF] = useState({
        project_code: project.project_code,
        description: project.description || '',
        customer_id: project.customer_id || '',
        project_start_date: formatDate(project.project_start_date),
        project_end_date: formatDate(project.project_end_date),
        status: project.status,
        pipeline_target_date: formatDate(project.pipeline_target_date),
        note: project.note || ''
    });
    async function save() {
        try {
            await api.put(`/projects/${project.id}`, {
                ...f, customer_id: f.customer_id ? Number(f.customer_id) : null,
                project_start_date: f.project_start_date || null,
                project_end_date: f.project_end_date || null,
                pipeline_target_date: f.pipeline_target_date || null
            });
            toast.success('Saved');
            onSaved();
        } catch (err) { toast.error(err.response?.data?.error || 'Save failed'); }
    }
    return (
        <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Project Code</label>
                <input className="input" value={f.project_code} onChange={e => setF({ ...f, project_code: e.target.value })} /></div>
            <div className="col-span-2"><label className="label">Description</label>
                <input className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
            <div><label className="label">Customer</label>
                <select className="input" value={f.customer_id} onChange={e => setF({ ...f, customer_id: e.target.value })}>
                    <option value="">—</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.alias} — {c.full_name}</option>)}
                </select></div>
            <div><label className="label">Status</label>
                <select className="input" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
                    <option>Pipeline</option><option>Win</option><option>Loss</option><option>Backlog</option>
                </select></div>
            <div><label className="label">Start Date</label>
                <input type="date" className="input" value={f.project_start_date} onChange={e => setF({ ...f, project_start_date: e.target.value })} /></div>
            <div><label className="label">End Date</label>
                <input type="date" className="input" value={f.project_end_date} onChange={e => setF({ ...f, project_end_date: e.target.value })} /></div>
            <div className="col-span-2"><label className="label">Pipeline Target Date</label>
                <input type="date" className="input" value={f.pipeline_target_date} onChange={e => setF({ ...f, pipeline_target_date: e.target.value })} /></div>
            <div className="col-span-2"><label className="label">Note</label>
                <textarea className="input" rows={3} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></div>
            <div className="col-span-2 flex justify-end"><button className="btn-primary" onClick={save}>Save Master</button></div>
        </div>
    );
}

function SubscriptionTab({ project, onSaved }) {
    const s = project.subscription || {};
    const [f, setF] = useState({
        license_name: s.license_name || '',
        license_start_date: formatDate(s.license_start_date) || formatDate(project.project_start_date),
        license_end_date:   formatDate(s.license_end_date)   || formatDate(project.project_end_date),
        license_revenue: s.license_revenue || 0,
        license_cost:    s.license_cost    || 0,
        erp_code: s.erp_code || ''
    });
    async function save() {
        await api.put(`/projects/${project.id}/subscription`, f);
        toast.success('Saved'); onSaved();
    }
    async function remove() {
        if (!confirm('Remove subscription details?')) return;
        await api.delete(`/projects/${project.id}/subscription`);
        toast.success('Removed'); onSaved();
    }
    return (
        <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">License Name</label>
                <input className="input" value={f.license_name} onChange={e => setF({ ...f, license_name: e.target.value })} /></div>
            <div><label className="label">License Start Date</label>
                <input type="date" className="input" value={f.license_start_date} onChange={e => setF({ ...f, license_start_date: e.target.value })} /></div>
            <div><label className="label">License End Date</label>
                <input type="date" className="input" value={f.license_end_date} onChange={e => setF({ ...f, license_end_date: e.target.value })} /></div>
            <div><label className="label">License Revenue (Baht)</label>
                <input type="number" className="input" value={f.license_revenue} onChange={e => setF({ ...f, license_revenue: e.target.value })} /></div>
            <div><label className="label">License Cost (Baht)</label>
                <input type="number" className="input" value={f.license_cost} onChange={e => setF({ ...f, license_cost: e.target.value })} /></div>
            <div className="col-span-2"><label className="label">ERP Code</label>
                <input className="input" value={f.erp_code} onChange={e => setF({ ...f, erp_code: e.target.value })} /></div>
            <div className="col-span-2 flex justify-end gap-2">
                {project.subscription && <button className="btn-danger" onClick={remove}>Remove</button>}
                <button className="btn-primary" onClick={save}>Save Subscription</button>
            </div>
        </div>
    );
}

function PerpetualTab({ project, onSaved }) {
    const [rows, setRows] = useState(project.perpetual_ma || []);
    const [draft, setDraft] = useState(null);
    function startNew() {
        setDraft({ id: null, item_name: '', item_type: 'License',
            start_date: formatDate(project.project_start_date),
            end_date:   formatDate(project.project_end_date),
            revenue: 0, cost: 0, erp_code: '' });
    }
    async function saveDraft() {
        try {
            if (draft.id) {
                await api.put(`/projects/perpetual-ma/${draft.id}`, draft);
            } else {
                await api.post(`/projects/${project.id}/perpetual-ma`, draft);
            }
            toast.success('Saved');
            setDraft(null); onSaved();
        } catch (err) { toast.error('Save failed'); }
    }
    async function remove(id) {
        if (!confirm('Delete row?')) return;
        await api.delete(`/projects/perpetual-ma/${id}`);
        toast.success('Removed'); onSaved();
    }
    return (
        <div className="space-y-3">
            <div className="flex justify-between"><h4 className="font-medium">Perpetual / SW MA items</h4>
                <button className="btn-primary" onClick={startNew}><PlusIcon className="w-4 h-4" /> Add</button></div>
            <table className="table-clean">
                <thead><tr><th>Name</th><th>Type</th><th>Start</th><th>End</th><th className="text-right">Revenue</th><th className="text-right">Cost</th><th></th></tr></thead>
                <tbody>
                    {(project.perpetual_ma || []).map(r => (
                        <tr key={r.id}>
                            <td>{r.item_name}</td><td>{r.item_type}</td>
                            <td>{formatDate(r.start_date)}</td><td>{formatDate(r.end_date)}</td>
                            <td className="text-right tabular-nums">{baht(r.revenue)}</td>
                            <td className="text-right tabular-nums">{baht(r.cost)}</td>
                            <td className="text-right">
                                <button className="btn-ghost" onClick={() => setDraft({ ...r, start_date: formatDate(r.start_date), end_date: formatDate(r.end_date) })}><PencilSquareIcon className="w-4 h-4" /></button>
                                <button className="btn-ghost ml-1" onClick={() => remove(r.id)}><TrashIcon className="w-4 h-4 text-red-500" /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {draft && (
                <div className="border border-slate-200 rounded p-3 grid grid-cols-2 gap-3">
                    <div className="col-span-2"><label className="label">Name</label>
                        <input className="input" value={draft.item_name} onChange={e => setDraft({ ...draft, item_name: e.target.value })} /></div>
                    <div><label className="label">Type</label>
                        <select className="input" value={draft.item_type} onChange={e => setDraft({ ...draft, item_type: e.target.value })}>
                            <option>License</option><option>MA</option>
                        </select></div>
                    <div><label className="label">ERP Code</label>
                        <input className="input" value={draft.erp_code} onChange={e => setDraft({ ...draft, erp_code: e.target.value })} /></div>
                    <div><label className="label">Start</label>
                        <input type="date" className="input" value={draft.start_date} onChange={e => setDraft({ ...draft, start_date: e.target.value })} /></div>
                    <div><label className="label">End</label>
                        <input type="date" className="input" value={draft.end_date} onChange={e => setDraft({ ...draft, end_date: e.target.value })} /></div>
                    <div><label className="label">Revenue</label>
                        <input type="number" className="input" value={draft.revenue} onChange={e => setDraft({ ...draft, revenue: e.target.value })} /></div>
                    <div><label className="label">Cost</label>
                        <input type="number" className="input" value={draft.cost} onChange={e => setDraft({ ...draft, cost: e.target.value })} /></div>
                    <div className="col-span-2 flex justify-end gap-2">
                        <button className="btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
                        <button className="btn-primary" onClick={saveDraft}>Save</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ServiceMATab({ project, onSaved }) {
    const [draft, setDraft] = useState(null);
    function startNew() {
        setDraft({ id: null, description: '',
            start_date: formatDate(project.project_start_date),
            end_date: formatDate(project.project_end_date),
            revenue: 0, cost: 0, erp_code: '' });
    }
    async function saveDraft() {
        if (draft.id) await api.put(`/projects/service-ma/${draft.id}`, draft);
        else await api.post(`/projects/${project.id}/service-ma`, draft);
        toast.success('Saved'); setDraft(null); onSaved();
    }
    async function remove(id) {
        if (!confirm('Delete row?')) return;
        await api.delete(`/projects/service-ma/${id}`);
        toast.success('Removed'); onSaved();
    }
    return (
        <div className="space-y-3">
            <div className="flex justify-between"><h4 className="font-medium">Service MA items</h4>
                <button className="btn-primary" onClick={startNew}><PlusIcon className="w-4 h-4" /> Add</button></div>
            <table className="table-clean">
                <thead><tr><th>Description</th><th>Start</th><th>End</th><th className="text-right">Revenue</th><th className="text-right">Cost</th><th></th></tr></thead>
                <tbody>
                    {(project.service_ma || []).map(r => (
                        <tr key={r.id}>
                            <td>{r.description}</td>
                            <td>{formatDate(r.start_date)}</td><td>{formatDate(r.end_date)}</td>
                            <td className="text-right tabular-nums">{baht(r.revenue)}</td>
                            <td className="text-right tabular-nums">{baht(r.cost)}</td>
                            <td className="text-right">
                                <button className="btn-ghost" onClick={() => setDraft({ ...r, start_date: formatDate(r.start_date), end_date: formatDate(r.end_date) })}><PencilSquareIcon className="w-4 h-4" /></button>
                                <button className="btn-ghost ml-1" onClick={() => remove(r.id)}><TrashIcon className="w-4 h-4 text-red-500" /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {draft && (
                <div className="border border-slate-200 rounded p-3 grid grid-cols-2 gap-3">
                    <div className="col-span-2"><label className="label">Description</label>
                        <input className="input" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></div>
                    <div><label className="label">Start</label>
                        <input type="date" className="input" value={draft.start_date} onChange={e => setDraft({ ...draft, start_date: e.target.value })} /></div>
                    <div><label className="label">End</label>
                        <input type="date" className="input" value={draft.end_date} onChange={e => setDraft({ ...draft, end_date: e.target.value })} /></div>
                    <div><label className="label">Revenue</label>
                        <input type="number" className="input" value={draft.revenue} onChange={e => setDraft({ ...draft, revenue: e.target.value })} /></div>
                    <div><label className="label">Cost</label>
                        <input type="number" className="input" value={draft.cost} onChange={e => setDraft({ ...draft, cost: e.target.value })} /></div>
                    <div className="col-span-2"><label className="label">ERP Code</label>
                        <input className="input" value={draft.erp_code} onChange={e => setDraft({ ...draft, erp_code: e.target.value })} /></div>
                    <div className="col-span-2 flex justify-end gap-2">
                        <button className="btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
                        <button className="btn-primary" onClick={saveDraft}>Save</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ImplementationTab({ project, onSaved }) {
    const i = project.implementation || {};
    const [f, setF] = useState({
        description: i.description || '',
        progress_last_year_pct: i.progress_last_year_pct ?? 0,
        progress_this_year_pct: i.progress_this_year_pct ?? 0,
        revenue: i.revenue || 0,
        cost: i.cost || 0,
        erp_code: i.erp_code || ''
    });
    async function save() {
        await api.put(`/projects/${project.id}/implementation`, f);
        toast.success('Saved'); onSaved();
    }
    async function remove() {
        if (!confirm('Remove implementation row?')) return;
        await api.delete(`/projects/${project.id}/implementation`);
        toast.success('Removed'); onSaved();
    }
    return (
        <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Description</label>
                <input className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
            <div><label className="label">% Progress (Last Year) [0..1]</label>
                <input type="number" step="0.01" min="0" max="1" className="input" value={f.progress_last_year_pct} onChange={e => setF({ ...f, progress_last_year_pct: e.target.value })} /></div>
            <div><label className="label">% Progress (This Year) [0..1]</label>
                <input type="number" step="0.01" min="0" max="1" className="input" value={f.progress_this_year_pct} onChange={e => setF({ ...f, progress_this_year_pct: e.target.value })} /></div>
            <div><label className="label">Revenue</label>
                <input type="number" className="input" value={f.revenue} onChange={e => setF({ ...f, revenue: e.target.value })} /></div>
            <div><label className="label">Cost</label>
                <input type="number" className="input" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} /></div>
            <div className="col-span-2"><label className="label">ERP Code</label>
                <input className="input" value={f.erp_code} onChange={e => setF({ ...f, erp_code: e.target.value })} /></div>
            <div className="col-span-2 flex justify-end gap-2">
                {project.implementation && <button className="btn-danger" onClick={remove}>Remove</button>}
                <button className="btn-primary" onClick={save}>Save Implementation</button>
            </div>
        </div>
    );
}

function OutsourceTab({ project, year, onSaved }) {
    const o = project.outsource || {};
    const [type, setType] = useState(o.outsource_type || 'Man-Year');
    const [f, setF] = useState({
        description: o.description || '',
        erp_code: o.erp_code || '',
        start_date: formatDate(o.start_date) || formatDate(project.project_start_date),
        end_date:   formatDate(o.end_date)   || formatDate(project.project_end_date),
        revenue: o.revenue || 0,
        cost:    o.cost    || 0
    });
    const [months, setMonths] = useState(() => {
        const out = [];
        for (let m = 1; m <= 12; m++) {
            const found = (o.months || []).find(x => x.year === year && x.month === m);
            out.push({ year, month: m, revenue: found?.revenue || 0, cost: found?.cost || 0 });
        }
        return out;
    });

    async function save() {
        const body = { outsource_type: type, description: f.description, erp_code: f.erp_code };
        if (type === 'Man-Year') {
            body.start_date = f.start_date || null;
            body.end_date   = f.end_date   || null;
            body.revenue    = Number(f.revenue);
            body.cost       = Number(f.cost);
        } else {
            body.months = months.map(m => ({ ...m, revenue: Number(m.revenue), cost: Number(m.cost) }));
        }
        await api.put(`/projects/${project.id}/outsource`, body);
        toast.success('Saved'); onSaved();
    }
    async function remove() {
        if (!confirm('Remove outsource row?')) return;
        await api.delete(`/projects/${project.id}/outsource`);
        toast.success('Removed'); onSaved();
    }

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Outsource Type</label>
                    <select className="input" value={type} onChange={e => setType(e.target.value)}>
                        <option>Man-Year</option><option>Man-Month</option>
                    </select></div>
                <div><label className="label">ERP Code</label>
                    <input className="input" value={f.erp_code} onChange={e => setF({ ...f, erp_code: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Description</label>
                    <input className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
            </div>

            {type === 'Man-Year' ? (
                <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">Start</label>
                        <input type="date" className="input" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} /></div>
                    <div><label className="label">End</label>
                        <input type="date" className="input" value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} /></div>
                    <div><label className="label">Revenue</label>
                        <input type="number" className="input" value={f.revenue} onChange={e => setF({ ...f, revenue: e.target.value })} /></div>
                    <div><label className="label">Cost</label>
                        <input type="number" className="input" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} /></div>
                </div>
            ) : (
                <div>
                    <div className="text-sm text-slate-600 mb-2">Enter Revenue and Cost for each month of {year}.</div>
                    <table className="table-clean">
                        <thead><tr><th>Month</th><th className="text-right">Revenue</th><th className="text-right">Cost</th></tr></thead>
                        <tbody>
                            {months.map((m, idx) => (
                                <tr key={m.month}>
                                    <td>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m.month-1]}</td>
                                    <td className="text-right">
                                        <input type="number" className="input !text-right" value={m.revenue} onChange={e => {
                                            const arr = [...months]; arr[idx].revenue = e.target.value; setMonths(arr);
                                        }} /></td>
                                    <td className="text-right">
                                        <input type="number" className="input !text-right" value={m.cost} onChange={e => {
                                            const arr = [...months]; arr[idx].cost = e.target.value; setMonths(arr);
                                        }} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="flex justify-end gap-2">
                {project.outsource && <button className="btn-danger" onClick={remove}>Remove</button>}
                <button className="btn-primary" onClick={save}>Save Outsource</button>
            </div>
        </div>
    );
}
