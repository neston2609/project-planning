import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import { useYear } from '../YearContext';
import { useAuth, isAdmin } from '../auth';
import Modal from '../components/Modal';
import { formatDate } from '../format';
import { PlusIcon, FunnelIcon } from '@heroicons/react/24/outline';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEK_W = 28;     // px per week column
// Sidebar columns
const COL_NAME_W  = 200;
const COL_NICK_W  = 90;
const COL_SKILL_W = 160;
const RESOURCE_W  = COL_NAME_W + COL_NICK_W + COL_SKILL_W;
const LANE_H = 26;     // px per lane
const LANE_GAP = 4;    // px between lanes
const MIN_ROW_H = 56;  // px — guarantees sidebar (name + role + padding) fits

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
        // Pick the month for the band header. For year-boundary weeks,
        // prefer the month that lies *inside* the selected year so we never
        // show e.g. "Jan" hanging off the end of a December.
        const startInYear = start.getUTCFullYear() === year;
        const endInYear   = end.getUTCFullYear()   === year;
        const month = startInYear && endInYear
            ? end.getUTCMonth()
            : (startInYear ? start.getUTCMonth() : end.getUTCMonth());
        weeks.push({
            weekIdx: idx++,
            startISO: start.toISOString().slice(0, 10),
            endISO:   end.toISOString().slice(0, 10),
            startMs:  start.getTime(),
            endMs:    end.getTime(),
            month
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
    const [viewMode, setViewMode]   = useState('all');   // 'all' | 'ongoing'
    // Multi-select role filter. Empty Set ⇒ "all roles" (no filtering).
    // Members may be a role name (e.g. "Developer") or '__none__' for blank role.
    const [roleFilter, setRoleFilter] = useState(() => new Set());

    function toggleRole(value) {
        setRoleFilter(prev => {
            const next = new Set(prev);
            if (next.has(value)) next.delete(value); else next.add(value);
            return next;
        });
    }
    function clearRoles() { setRoleFilter(new Set()); }

    // Refs for the duplicated horizontal scrollbar (top + main).
    const topScrollRef  = useRef(null);
    const mainScrollRef = useRef(null);
    const onTopScroll = (e) => {
        const m = mainScrollRef.current;
        if (m && m.scrollLeft !== e.target.scrollLeft) m.scrollLeft = e.target.scrollLeft;
    };
    const onMainScroll = (e) => {
        const t = topScrollRef.current;
        if (t && t.scrollLeft !== e.target.scrollLeft) t.scrollLeft = e.target.scrollLeft;
    };

    const allWeeks = useMemo(() => buildWeeks(year), [year]);
    // When "ongoing" is selected, drop every week that ended before the start
    // of the current calendar month.
    const weeks = useMemo(() => {
        if (viewMode === 'all') return allWeeks;
        const now = new Date();
        const monthStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
        return allWeeks.filter(w => w.endMs >= monthStartMs);
    }, [allWeeks, viewMode]);
    const totalWidth = weeks.length * WEEK_W;
    const visStartMs = weeks[0]?.startMs ?? 0;
    const visEndMs   = weeks[weeks.length - 1]?.endMs ?? 0;

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

    // Counts by role for the summary chips at the top
    const roleCounts = useMemo(() => {
        const m = new Map();
        for (const r of resources) {
            const role = (r.role || '').trim() || 'No Role';
            m.set(role, (m.get(role) || 0) + 1);
        }
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }, [resources]);

    // Sorted unique role list for the filter dropdown
    const roles = useMemo(() => {
        const set = new Set(resources.map(r => (r.role || '').trim()).filter(Boolean));
        return Array.from(set).sort();
    }, [resources]);

    // Resources visible in the gantt after applying the role filter.
    // The chips/counts above keep showing totals for the full team — only the
    // rows below collapse down to the selected roles.
    const displayResources = useMemo(() => {
        if (roleFilter.size === 0) return resources;
        return resources.filter(r => {
            const role = (r.role || '').trim();
            return role ? roleFilter.has(role) : roleFilter.has('__none__');
        });
    }, [resources, roleFilter]);

    // "Today" indicator
    const todayIdx = useMemo(() => {
        const today = new Date();
        if (today.getUTCFullYear() !== year) return -1;
        return weekIndexFor(today.toISOString().slice(0, 10), weeks);
    }, [weeks, year]);
    const todayLeft = todayIdx >= 0 ? todayIdx * WEEK_W + WEEK_W / 2 : -1;

    // Total grid height for the today line
    const gridHeight = useMemo(() => {
        let h = 60; // months + weeks header
        for (const r of displayResources) {
            const lanes = byResource.get(r.id) || [];
            const laneCount = Math.max(1, lanes.length);
            const rowH = Math.max(MIN_ROW_H, laneCount * (LANE_H + LANE_GAP) + 6);
            h += rowH;
        }
        return h;
    }, [displayResources, byResource]);

    function openAdd(resource) {
        if (!canEdit) return;
        const ws = weeks[0]?.startISO || `${year}-01-01`;
        const we = weeks[Math.min(3, weeks.length - 1)]?.endISO || `${year}-01-31`;
        setModal({
            resource, existing: null,
            form: { customer_filter: '', project_id: '', start_date: ws, end_date: we, note: '' }
        });
    }
    function openEdit(resource, a) {
        if (!canEdit) return;
        // Pre-select the customer of the project being edited so the project
        // dropdown filters down to its siblings on open.
        const proj = projects.find(p => p.id === a.project_id);
        setModal({
            resource, existing: a,
            form: {
                id: a.id, project_id: a.project_id,
                customer_filter: proj?.customer_alias || '',
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
            <div className="flex flex-wrap items-end gap-3">
                <h1 className="text-3xl font-extrabold">
                    <span className="brand-mark">Resource Planning</span> · {year}
                </h1>
                {canEdit && <span className="text-xs text-slate-500">Click any row to add an assignment, or click an existing bar to edit.</span>}
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                    <FunnelIcon className="w-4 h-4 text-indigo-500" />
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500">Role</label>
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
                    <label className="text-xs uppercase tracking-wider font-bold text-slate-500 ml-2">View</label>
                    <select className="input !w-auto !py-1.5 font-medium"
                            value={viewMode} onChange={e => setViewMode(e.target.value)}>
                        <option value="all">Show All</option>
                        <option value="ongoing">Only On-Going Month</option>
                    </select>
                </div>
            </div>

            {/* Role count chips — click to filter */}
            {resources.length > 0 && (
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
                        <span className="text-base font-extrabold">{resources.length}</span>
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

            {loading ? (
                <p className="text-slate-500 animate-pulse">Loading...</p>
            ) : (
                <>
                {/* Top horizontal scrollbar — mirrors the gantt's scroll so users
                    can swipe across the year without scrolling to the bottom. */}
                <div ref={topScrollRef} onScroll={onTopScroll}
                     className="overflow-x-auto overflow-y-hidden rounded-t-xl border border-slate-200/70 bg-white/60"
                     style={{ height: 16 }}>
                    <div style={{ width: RESOURCE_W + totalWidth, height: 1 }} />
                </div>
                <div ref={mainScrollRef} onScroll={onMainScroll}
                     className="card !rounded-t-none overflow-x-auto overflow-y-hidden">
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
                                <div className="shrink-0 flex border-r-2 border-slate-300" style={{ width: RESOURCE_W }}>
                                    <div className="px-3 py-2 text-xs font-bold text-slate-600 uppercase tracking-wider border-r border-slate-200"
                                         style={{ width: COL_NAME_W }}>Full Name</div>
                                    <div className="px-3 py-2 text-xs font-bold text-slate-600 uppercase tracking-wider border-r border-slate-200"
                                         style={{ width: COL_NICK_W }}>Nickname</div>
                                    <div className="px-3 py-2 text-xs font-bold text-slate-600 uppercase tracking-wider"
                                         style={{ width: COL_SKILL_W }}>Skill</div>
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
                            <div className="flex border-b-2 border-slate-300">
                                <div className="shrink-0 border-r-2 border-slate-300" style={{ width: RESOURCE_W }} />
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
                        {displayResources.map((r, rIdx) => {
                            const lanes = byResource.get(r.id) || [];
                            const laneCount = Math.max(1, lanes.length);
                            const rowHeight = Math.max(MIN_ROW_H, laneCount * (LANE_H + LANE_GAP) + 4);
                            return (
                                <div key={r.id}
                                     className={`flex border-b-2 border-slate-200 ${rIdx % 2 ? 'bg-white' : 'bg-slate-50/50'}`}
                                     style={{ height: rowHeight }}>
                                    {/* Sidebar — three columns */}
                                    <div className="shrink-0 sticky left-0 z-[5] bg-inherit flex border-r-2 border-slate-300"
                                         style={{ width: RESOURCE_W }}>
                                        <div className="px-3 py-2 border-r border-slate-200 flex flex-col justify-center"
                                             style={{ width: COL_NAME_W }}>
                                            <div className="font-semibold text-sm truncate" title={`${r.first_name} ${r.last_name}`}>
                                                {r.first_name} {r.last_name}
                                            </div>
                                            {r.role && (
                                                <div className="text-[10px] text-slate-400 truncate">{r.role}</div>
                                            )}
                                        </div>
                                        <div className="px-3 py-2 border-r border-slate-200 flex items-center"
                                             style={{ width: COL_NICK_W }}>
                                            <span className="text-sm text-slate-600 truncate">{r.nick_name || '—'}</span>
                                        </div>
                                        <div className="px-3 py-2 flex items-center" style={{ width: COL_SKILL_W }}>
                                            <span className="text-xs text-slate-500 line-clamp-2 leading-tight"
                                                  title={r.skill || ''}>
                                                {r.skill || '—'}
                                            </span>
                                        </div>
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
                                                // Skip bars entirely outside the visible week range
                                                const aStart = new Date(a.start_date).getTime();
                                                const aEnd   = new Date(a.end_date).getTime();
                                                if (aEnd < visStartMs || aStart > visEndMs) return null;
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
                        {resources.length > 0 && displayResources.length === 0 && (
                            <div className="text-center text-slate-400 py-10">
                                No resources match the selected roles.
                                <button type="button"
                                        className="ml-2 text-indigo-600 hover:underline font-medium"
                                        onClick={clearRoles}>
                                    Clear filter
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                </>
            )}

            {/* Edit / add modal */}
            <Modal open={!!modal} onClose={() => setModal(null)}
                   title={modal ? `${modal.resource.first_name} ${modal.resource.last_name} — assignment` : ''}
                   footer={modal && (<>
                       {modal.form.id && <button className="btn-danger" onClick={deleteAssignment}>Delete</button>}
                       <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                       <button className="btn-primary" onClick={saveAssignment}>Save</button>
                   </>)}>
                {modal && (() => {
                    // Unique sorted customer aliases from the available projects
                    const customerAliases = Array.from(new Set(
                        projects.map(p => p.customer_alias).filter(Boolean)
                    )).sort();
                    const filterAlias = modal.form.customer_filter || '';
                    const visibleProjects = filterAlias
                        ? projects.filter(p => p.customer_alias === filterAlias)
                        : projects;
                    return (
                    <div className="space-y-3">
                        <div>
                            <label className="label">Customer</label>
                            <select className="input" value={filterAlias}
                                    onChange={(e) => setModal({
                                        ...modal,
                                        form: {
                                            ...modal.form,
                                            customer_filter: e.target.value,
                                            // Reset selected project if it doesn't match the new filter
                                            project_id: ''
                                        }
                                    })}>
                                <option value="">All Customer</option>
                                {customerAliases.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label">Project</label>
                            <select className="input" value={modal.form.project_id}
                                    onChange={(e) => setModal({ ...modal, form: { ...modal.form, project_id: e.target.value } })}>
                                <option value="">— Select —</option>
                                {visibleProjects.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {`[${p.customer_alias || 'No customer'}] - ${p.project_code} : ${p.description}`}
                                    </option>
                                ))}
                            </select>
                            {visibleProjects.length === 0 && (
                                <p className="text-xs text-amber-600 mt-1">No projects for this customer.</p>
                            )}
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
                    );
                })()}
            </Modal>
        </div>
    );
}
