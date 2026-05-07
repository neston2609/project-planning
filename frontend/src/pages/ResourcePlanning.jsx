import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { useYear } from '../YearContext';
import { useAuth, isAdmin } from '../auth';
import Modal from '../components/Modal';
import { formatDate } from '../format';

// Build week buckets for a year. Each bucket = { weekIdx, monthLabel, startISO, endISO }.
function buildWeeks(year) {
    const weeks = [];
    let cur = new Date(Date.UTC(year, 0, 1));
    // Pull cur back to Monday-of-week if needed
    const dow = cur.getUTCDay() || 7;       // 1=Mon..7=Sun
    cur.setUTCDate(cur.getUTCDate() - (dow - 1));
    let idx = 1;
    while (true) {
        const start = new Date(cur);
        const end   = new Date(cur);
        end.setUTCDate(end.getUTCDate() + 6);
        if (start.getUTCFullYear() > year) break;
        if (end.getUTCFullYear() < year) {
            cur.setUTCDate(cur.getUTCDate() + 7); continue;
        }
        weeks.push({
            weekIdx: idx++,
            startISO: start.toISOString().slice(0, 10),
            endISO:   end.toISOString().slice(0, 10),
            month:    end.getUTCMonth() // pick end-of-week month for grouping
        });
        if (idx > 53) break;
        cur.setUTCDate(cur.getUTCDate() + 7);
    }
    return weeks;
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function ResourcePlanning() {
    const { year } = useYear();
    const { user } = useAuth();
    const canEdit = isAdmin(user);

    const [resources, setResources]    = useState([]);
    const [projects,  setProjects]     = useState([]);
    const [assigns,   setAssigns]      = useState([]);
    const [loading, setLoading]        = useState(true);
    const [modal, setModal]            = useState(null);

    const weeks = useMemo(() => buildWeeks(year), [year]);

    async function reload() {
        setLoading(true);
        try {
            const [r, p, a] = await Promise.all([
                api.get('/resources'),
                api.get('/projects'),
                api.get(`/resources/assignments/all?year=${year}`)
            ]);
            setResources(r.data);
            setProjects(p.data);
            setAssigns(a.data);
        } finally { setLoading(false); }
    }
    useEffect(() => { reload(); }, [year]);

    function findCellAssignment(resourceId, week) {
        const ws = new Date(week.startISO);
        const we = new Date(week.endISO);
        return assigns.find(a => a.resource_id === resourceId &&
            new Date(a.start_date) <= we && new Date(a.end_date) >= ws);
    }

    function openCellModal(resource, week, existing) {
        if (!canEdit) return;
        setModal({
            resource,
            week,
            existing: existing || null,
            form: existing ? {
                id: existing.id,
                project_id: existing.project_id,
                start_date: formatDate(existing.start_date),
                end_date:   formatDate(existing.end_date),
                note: existing.note || ''
            } : {
                project_id: '',
                start_date: week.startISO,
                end_date:   week.endISO,
                note: ''
            }
        });
    }

    async function saveAssignment() {
        if (!modal) return;
        const f = modal.form;
        if (!f.project_id) return toast.error('Select a project');
        try {
            if (f.id) {
                await api.put(`/resources/assignments/${f.id}`, {
                    project_id: Number(f.project_id),
                    start_date: f.start_date, end_date: f.end_date, note: f.note
                });
            } else {
                await api.post('/resources/assignments', {
                    resource_id: modal.resource.id,
                    project_id: Number(f.project_id),
                    start_date: f.start_date, end_date: f.end_date, note: f.note
                });
            }
            toast.success('Saved');
            setModal(null);
            reload();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        }
    }

    async function deleteAssignment() {
        if (!modal?.form?.id) return;
        if (!confirm('Delete this assignment?')) return;
        await api.delete(`/resources/assignments/${modal.form.id}`);
        toast.success('Deleted');
        setModal(null);
        reload();
    }

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold">Resource Planning — {year}</h1>
            {loading ? <p className="text-slate-500">Loading...</p> : (
                <div className="card overflow-auto">
                    <table className="text-xs border-collapse">
                        <thead>
                            <tr>
                                <th rowSpan={2} className="sticky left-0 bg-slate-50 z-10 px-3 py-2 text-left border-b border-slate-200">Resource</th>
                                {MONTHS.map((m, mi) => {
                                    const span = weeks.filter(w => w.month === mi).length;
                                    return span > 0 ? <th key={mi} colSpan={span} className="px-1 py-1 text-center border-b border-l border-slate-200 bg-slate-100">{m}</th> : null;
                                })}
                            </tr>
                            <tr>
                                {weeks.map(w => (
                                    <th key={w.weekIdx} className="px-1 py-1 text-center border-b border-slate-200 bg-slate-50 font-normal text-[10px] text-slate-500" title={`${w.startISO} – ${w.endISO}`}>
                                        W{w.weekIdx}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {resources.map(r => (
                                <tr key={r.id} className="hover:bg-slate-50">
                                    <td className={`sticky left-0 bg-white z-10 px-3 py-2 border-b border-slate-100 ${canEdit ? 'cursor-pointer' : ''}`}
                                        onClick={() => openCellModal(r, weeks[0])}>
                                        <div className="font-medium">{r.first_name} {r.last_name}</div>
                                        <div className="text-[10px] text-slate-400">{r.nick_name}</div>
                                    </td>
                                    {weeks.map(w => {
                                        const a = findCellAssignment(r.id, w);
                                        const bg = a?.customer_color || (a ? '#3b82f6' : 'transparent');
                                        return (
                                            <td key={w.weekIdx}
                                                className={`border border-slate-100 h-7 ${canEdit ? 'cursor-pointer' : ''}`}
                                                style={{ backgroundColor: bg, minWidth: 22 }}
                                                title={a ? `${a.customer_alias || ''} ${a.project_code} (${formatDate(a.start_date)}—${formatDate(a.end_date)})` : ''}
                                                onClick={() => openCellModal(r, w, a)} />
                                        );
                                    })}
                                </tr>
                            ))}
                            {resources.length === 0 && (
                                <tr><td colSpan={weeks.length + 1} className="text-center py-6 text-slate-400">No resources defined.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal open={!!modal} onClose={() => setModal(null)}
                   title={modal ? `${modal.resource.first_name} ${modal.resource.last_name} — assignment` : ''}
                   footer={modal && (<>
                       {modal.form.id && <button className="btn-danger" onClick={deleteAssignment}>Delete</button>}
                       <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                       <button className="btn-primary" onClick={saveAssignment}>Save</button>
                   </>)}>
                {modal && (
                    <div className="space-y-3">
                        <div>
                            <label className="label">Project</label>
                            <select className="input" value={modal.form.project_id}
                                    onChange={(e) => setModal({ ...modal, form: { ...modal.form, project_id: e.target.value } })}>
                                <option value="">— Select —</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.project_code} — {p.description}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="label">Start date</label>
                                <input type="date" className="input" value={modal.form.start_date}
                                    onChange={(e) => setModal({ ...modal, form: { ...modal.form, start_date: e.target.value } })} />
                            </div>
                            <div>
                                <label className="label">End date</label>
                                <input type="date" className="input" value={modal.form.end_date}
                                    onChange={(e) => setModal({ ...modal, form: { ...modal.form, end_date: e.target.value } })} />
                            </div>
                        </div>
                        <div>
                            <label className="label">Note</label>
                            <input className="input" value={modal.form.note}
                                onChange={(e) => setModal({ ...modal, form: { ...modal.form, note: e.target.value } })} />
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
