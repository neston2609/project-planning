import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { useYear } from '../YearContext';
import { useAuth, isAdmin } from '../auth';
import Modal from '../components/Modal';
import { formatDate } from '../format';
import { PlusIcon } from '@heroicons/react/24/outline';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEK_W = 28;     // px per week column
const RESOURCE_W = 220; // px sidebar
const LANE_H = 26;     // px per lane
const LANE_GAP = 4;    // px between lanes

/** Build week buckets for a year, each = { weekIdx, startISO, endISO, month }. */
function buildWeeks(year) {
    const weeks = [];
    let cur = new Date(Date.UTC(year, 0, 1));
    const dow = cur.getUTCDay() || 7;
    cur.setUTCDate(cur.getUTCDate() - (dow - 1));
    let idx = 1;
    while (true) {
        const start = new Date(cur);
        const end = new Date(cur);
        end.setUTCDate(end.getUTCDate() + 6);
        if (start.getUTCFullYear() > year) break;
        if (end.getUTCFullYear() < year) {
            cur.setUTCDate(cur.getUTCDate() + 7); continue;
        }
        weeks.push({
            weekIdx: idx++,
            startISO: start.toISOString().slice(0, 10),
            endISO:   end.toISOString().slice(0, 10),
            startMs:  start.getTime(),
            endMs:    end.getTime(),
            month:    end.getUTCMonth()
        });
        if (idx > 53) break;
        cur.setUTCDate(cur.getUTCDate() + 7);
    }
    return weeks;
}

/** Locate the week index (0-based) covering the given date, clamped to range. */
function weekIndexFor(date, weeks) {
    if (!date || !weeks.length) return -1;
    const t = new Date(date).getTime();
    if (t < weeks[0].startMs) return 0;
    if (t > weeks[weeks.length - 1].endMs) return weeks.length - 1;
    for (let i = 0; i < weeks.length; i++) {
        if (t >= weeks[i].startMs && t <= weeks[i].endMs + 86_399_999) return i;
    }
    return -1;
}

/** Bin-pack assignments into lanes so overlapping items stack vertically. */
function buildLanes(assignments) {
    const sorted = [...assignments].sort(
        (a, b) => new Date(a.start_date) - new Date(b.start_date)
    );
    const lanes = []; // each lane = list of assignments
    for (const a of sorted) {
        const aStart = new Date(a.start_date).getTime();
        let placed = false;
        for (const lane of lanes) {
            const last = lane[lane.length - 1];
            if (new Date(last.end_date).getTime() < aStart) {
                lane.push(a); placed = true; break;
            }
        }
        if (!placed) lanes.push([a]);
    }
    return lanes;
}

export default function ResourcePlanning() {
    const { year } = useYear();
    const { user } = useAuth();
    const canEdit = isAdmin(user);

    const [resources, setResources] = useState([]);
    const [projects,  setProjects]  = useState([]);
    const [assigns,   setAssigns]   = useState([]);
    const [loading, setLoading]     = useState(true);
    const [modal, setModal]         = useState(null);

    const weeks = useMemo(() => buildWeeks(year), [year]);
    const totalWidth = weeks.length * WEEK_W;

    async function reload() {
        setLoading(true);
        try {
            const [r, p, a] = await Promise.all([
                api.get('/resources'),
                api.get('/projects'),
                api.get(`/resources/assignments/all?year=${year}`)
            ]);
            setResources(r.data); setProjects(p.data); setAssigns(a.data);
        } finally { setLoading(false); }
    }
    useEffect(() => { reload(); }, [year]);

    // Group assignments by resource and bin-pack into lanes
    const byResource = useMemo(() => {
        const m = new Map();
        for (const r of resources) m.set(r.id, []);
        for (const a of assigns) {
            if (!m.has(a.resource_id)) m.set(a.resource_id, []);
            m.get(a.resource_id).push(a);
        }
        const out = new Map();
        for (const [rid, list] of m) out.set(rid, buildLanes(list));
        return out;
    }, [resources, assigns]);

    // "Today" indicator
    const todayIdx = useMemo(() => {
        const today = new Date();
        if (today.getUTCFullYear() !== year) return -1;
        return weekIndexFor(today.toISOString().slice(0, 10), weeks);
    }, [weeks, year]);
    const todayLeft = todayIdx >= 0 ? todayIdx * WEEK_W + WEEK_W / 2 : -1;

    // Total grid height for the today line
    const gridHeight = useMemo(() => {
        let h = 36; // weeks header
        for (const r of resources) {
            const lanes = byResource.get(r.id) || [];
            const laneCount = Math.max(1, lanes.length);
            h += laneCount * (LANE_H + LANE_GAP) + 4;
        }
        return h;
    }, [resources, byResource]);

    function openAdd(resource) {
        if (!canEdit) return;
        const ws = weeks[0]?.startISO || `${year}-01-01`;
        const we = weeks[Math.min(3, weeks.length - 1)]?.endISO || `${year}-01-31`;
        setModal({
            resource, existing: null,
            form: { project_id: '', start_date: ws, end_date: we, note: '' }
        });
    }
    function openEdit(resource, a) {
        if (!canEdit) return;
        setModal({
            resource, existing: a,
            form: {
                id: a.id, project_id: a.project_id,
                start_date: formatDate(a.start_date),
                end_date:   formatDate(a.end_date),
                note: a.note || ''
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
            toast.success('Saved'); setModal(null); reload();
        } catch (err) { toast.error(err.response?.data?.error || 'Save failed'); }
    }

    async function deleteAssignment() {
        if (!modal?.form?.id) return;
        if (!confirm('Delete this assignment?')) return;
        await api.delete(`/resources/assignments/${modal.form.id}`);
        toast.success('Deleted'); setModal(null); reload();
    }

    return (
        <div className="space-y-5">
            <div className="flex items-end gap-3">
                <h1 className="text-3xl font-extrabold">
                    <span className="brand-mark">Resource Planning</span> · {year}
                </h1>
                {canEdit && <span className="text-xs text-slate-500">Click any row to add an assignment, or click an existing bar to edit.</span>}
            </div>

            {loading ? (
                <p className="text-slate-500 animate-pulse">Loading...</p>
            ) : (
                <div className="card overflow-auto">
                    <div className="relative" style={{ minWidth: RESOURCE_W + totalWidth }}>
                        {/* Today vertical line — spans the full grid below the header */}
                        {todayLeft >= 0 && (
                            <div
                                className="absolute z-10 pointer-events-none"
                                style={{
                                    left: RESOURCE_W + todayLeft,
                                    top: 0,
                                    height: gridHeight,
                                    width: 0
                                }}>
                                <div className="absolute inset-y-0 -left-px w-0.5"
                                     style={{ backgroundImage: 'linear-gradient(180deg,#6366f1,#ec4899)' }} />
                                <div className="absolute -top-1 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow"
                                     style={{ backgroundImage: 'linear-gradient(135deg,#6366f1,#ec4899)' }}>
                                    TODAY
                                </div>
                            </div>
                        )}

                        {/* Header rows: months + weeks */}
                        <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
                            {/* Month band */}
                            <div className="flex">
                                <div className="shrink-0" style={{ width: RESOURCE_W }}>
                                    <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Resource</div>
                                </div>
                                <div className="flex relative" style={{ width: totalWidth }}>
                                    {MONTHS.map((m, mi) => {
                                        const span = weeks.filter(w => w.month === mi).length;
                                        if (!span) return null;
                                        return (
                                            <div key={mi}
                                                 className="text-center text-xs font-bold text-slate-600 border-l border-slate-200 bg-gradient-to-b from-slate-50 to-white py-1"
                                                 style={{ width: span * WEEK_W }}>
                                                {m}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            {/* Week labels */}
                            <div className="flex">
                                <div className="shrink-0" style={{ width: RESOURCE_W }} />
                                <div className="flex">
                                    {weeks.map(w => (
                                        <div key={w.weekIdx}
                                             title={`${w.startISO} – ${w.endISO}`}
                                             className="text-center text-[10px] text-slate-500 border-l border-slate-100 py-1"
                                             style={{ width: WEEK_W }}>
                                            W{w.weekIdx}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Resource rows */}
                        {resources.map((r, rIdx) => {
                            const lanes = byResource.get(r.id) || [];
                            const laneCount = Math.max(1, lanes.length);
                            const rowHeight = laneCount * (LANE_H + LANE_GAP) + 4;
                            return (
                                <div key={r.id}
                                     className={`flex border-b border-slate-100 ${rIdx % 2 ? 'bg-white' : 'bg-slate-50/40'}`}
                                     style={{ height: rowHeight }}>
                                    {/* Sidebar */}
                                    <div className="shrink-0 px-3 py-2 sticky left-0 z-[5] bg-inherit border-r border-slate-200"
                                         style={{ width: RESOURCE_W }}>
                                        <div className="font-semibold text-sm truncate">{r.first_name} {r.last_name}</div>
                                        <div className="text-[10px] text-slate-400 truncate">{r.nick_name || r.role}</div>
                                    </div>

                                    {/* Lane area */}
                                    <div
                                        className={`relative ${canEdit ? 'cursor-pointer' : ''}`}
                                        style={{ width: totalWidth }}
                                        onClick={() => openAdd(r)}>
                                        {/* Week grid background */}
                                        <div className="absolute inset-0 flex pointer-events-none">
                                            {weeks.map(w => (
                                                <div key={w.weekIdx}
                                                     className="border-l border-slate-100"
                                                     style={{ width: WEEK_W }} />
                                            ))}
                                        </div>

                                        {/* Bars per lane */}
                                        {lanes.map((lane, laneIdx) => (
                                            lane.map(a => {
                                                const s = weekIndexFor(a.start_date, weeks);
                                                const e = weekIndexFor(a.end_date, weeks);
                                                if (s < 0 || e < 0) return null;
                                                const left  = s * WEEK_W;
                                                const width = (e - s + 1) * WEEK_W - 2;
                                                return (
                                                    <div
                                                        key={a.id}
                                                        className="absolute rounded-md text-[11px] font-semibold text-white shadow-sm hover:shadow-md hover:brightness-110 transition truncate flex items-center px-2"
                                                        style={{
                                                            left:  left + 1,
                                                            top:   2 + laneIdx * (LANE_H + LANE_GAP),
                                                            width,
                                                            height: LANE_H,
                                                            backgroundColor: a.customer_color || '#6366f1'
                                                        }}
                                                        title={`${a.customer_alias || ''} · ${a.project_code} (${formatDate(a.start_date)} → ${formatDate(a.end_date)})${a.note ? ' — ' + a.note : ''}`}
                                                        onClick={(ev) => { ev.stopPropagation(); openEdit(r, a); }}>
                                                        {a.project_code}{a.customer_alias ? ` · ${a.customer_alias}` : ''}
                                                    </div>
                                                );
                                            })
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        {resources.length === 0 && (
                            <div className="text-center text-slate-400 py-10">No resources defined.</div>
                        )}
                    </div>
                </div>
            )}

            {/* Edit / add modal */}
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
                                    <option key={p.id} value={p.id}>
                                        {p.project_code}{p.customer_alias ? ` · ${p.customer_alias}` : ''} — {p.description}
                                    </option>
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
