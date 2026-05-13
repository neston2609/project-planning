import { useEffect, useState } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import Modal from './Modal';
import { formatDate } from '../format';
import { PlusIcon, TrashIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';

/**
 * CopyProjectModal
 *
 * Opens a "create new project" style popup pre-filled from an existing
 * project (sourced from the Subscription dashboard). Copies:
 *  - Main project fields (code, description, customer, dates, status…)
 *  - Subscription sub-row (license name, dates, revenue, cost, ERP)
 *  - Every Service MA sub-row
 *
 * Pre-fill rules per spec:
 *  - project_code: last 6 chars of source code, prefix "DUM". ENT123456 → DUM123456.
 *  - All start/end dates (main, subscription, every service MA) shift +1 year.
 *  - Status resets to "Pipeline".
 *  - ERP Code on Subscription + every Service MA row defaults to the new
 *    project code. Editing Project Code propagates to any ERP Code still
 *    matching the previous project code (hasn't been manually overridden).
 *
 * Saves only when admin clicks "Create Project":
 *  1. POST /projects                    → new id
 *  2. PUT  /projects/:newId/subscription
 *  3. POST /projects/:newId/service-ma  (per row)
 */
export default function CopyProjectModal({ sourceProjectId, onClose, onCreated }) {
    const [loading, setLoading] = useState(true);
    const [busy, setBusy]       = useState(false);
    const [customers, setCustomers] = useState([]);
    const [source, setSource]   = useState(null);

    const [main, setMain] = useState(null);
    const [includeSub, setIncludeSub] = useState(false);
    const [sub, setSub]   = useState(null);
    const [svcRows, setSvcRows] = useState([]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all([
            api.get('/customers'),
            api.get(`/projects/${sourceProjectId}`)
        ]).then(([c, p]) => {
            if (cancelled) return;
            setCustomers(c.data);
            setSource(p.data);

            const proj = p.data;
            const newCode = dummyCode(proj.project_code);
            setMain({
                project_code: newCode,
                description:  proj.description || '',
                customer_id:  proj.customer_id ? String(proj.customer_id) : '',
                project_start_date: addOneYear(formatDate(proj.project_start_date)),
                project_end_date:   addOneYear(formatDate(proj.project_end_date)),
                status: 'Pipeline',
                pipeline_target_date: addOneYear(formatDate(proj.pipeline_target_date)),
                note: proj.note || ''
            });

            if (proj.subscription) {
                setIncludeSub(true);
                const s = proj.subscription;
                setSub({
                    license_name: s.license_name || '',
                    license_start_date: addOneYear(formatDate(s.license_start_date)),
                    license_end_date:   addOneYear(formatDate(s.license_end_date)),
                    license_revenue: Number(s.license_revenue || 0),
                    license_cost:    Number(s.license_cost    || 0),
                    erp_code: newCode
                });
            }

            const sv = Array.isArray(proj.service_ma) ? proj.service_ma : [];
            setSvcRows(sv.map(r => ({
                description: r.description || '',
                start_date:  addOneYear(formatDate(r.start_date)),
                end_date:    addOneYear(formatDate(r.end_date)),
                revenue:     Number(r.revenue || 0),
                cost:        Number(r.cost    || 0),
                erp_code:    newCode
            })));
        }).catch(err => {
            console.error('[CopyProjectModal] load failed', err);
            toast.error('Could not load source project');
            onClose?.();
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [sourceProjectId]);

    function updateSvc(idx, patch) {
        setSvcRows(rows => rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
    }

    function updateProjectCode(newCode) {
        const oldCode = main?.project_code;
        setMain(m => ({ ...m, project_code: newCode }));
        if (oldCode === undefined) return;
        setSub(s => (s && s.erp_code === oldCode ? { ...s, erp_code: newCode } : s));
        setSvcRows(rows => rows.map(r =>
            r.erp_code === oldCode ? { ...r, erp_code: newCode } : r
        ));
    }

    function removeSvc(idx) {
        setSvcRows(rows => rows.filter((_, i) => i !== idx));
    }
    function addSvc() {
        setSvcRows(rows => [...rows, {
            description: '', start_date: '', end_date: '',
            revenue: 0, cost: 0,
            erp_code: main?.project_code || ''
        }]);
    }

    async function submit() {
        if (!main?.project_code?.trim()) {
            return toast.error('Project Code is required');
        }
        setBusy(true);
        try {
            const projPayload = {
                ...main,
                customer_id: main.customer_id ? Number(main.customer_id) : null,
                project_start_date: main.project_start_date || null,
                project_end_date:   main.project_end_date   || null,
                pipeline_target_date: main.pipeline_target_date || null
            };
            const created = await api.post('/projects', projPayload);
            const newId = created.data.id;

            if (includeSub && sub) {
                await api.put(`/projects/${newId}/subscription`, {
                    ...sub,
                    license_revenue: Number(sub.license_revenue) || 0,
                    license_cost:    Number(sub.license_cost)    || 0,
                    license_start_date: sub.license_start_date || null,
                    license_end_date:   sub.license_end_date   || null
                });
            }

            for (const row of svcRows) {
                await api.post(`/projects/${newId}/service-ma`, {
                    ...row,
                    revenue: Number(row.revenue) || 0,
                    cost:    Number(row.cost)    || 0,
                    start_date: row.start_date || null,
                    end_date:   row.end_date   || null
                });
            }

            toast.success(`Project ${main.project_code} created`);
            onCreated?.(newId);
        } catch (err) {
            console.error('[CopyProjectModal] create failed', err);
            toast.error(err.response?.data?.error || 'Create failed');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal open onClose={onClose} size="xl"
               title={source
                   ? `Copy from ${source.project_code}${source.description ? ' — ' + source.description : ''}`
                   : 'Copy Project'}
               footer={!loading && main && (
                   <>
                       <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
                       <button className="btn-primary" onClick={submit} disabled={busy}>
                           <DocumentDuplicateIcon className="w-4 h-4" />
                           {busy ? 'Creating…' : 'Create Project'}
                       </button>
                   </>
               )}>
            {loading || !main ? (
                <p className="text-slate-500 animate-pulse">Loading source project…</p>
            ) : (
                <div className="space-y-5">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                        Review and edit before saving. Nothing is written until you click <strong>Create Project</strong>.
                        Dates shifted +1 year automatically; project code prefix changed to <code className="font-mono">DUM</code>.
                        ERP codes default to the new project code.
                    </div>

                    <section>
                        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">Project Details</h3>
                        <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-gradient-to-br from-indigo-50/40 to-pink-50/40 border border-slate-200/70">
                            <div className="col-span-2">
                                <label className="label">Project Code</label>
                                <input className="input" value={main.project_code}
                                       onChange={e => updateProjectCode(e.target.value)} />
                                <p className="text-[10px] text-slate-400 mt-1">Changes here also update any ERP Code below that still matches.</p>
                            </div>
                            <div className="col-span-2"><label className="label">Description</label>
                                <input className="input" value={main.description}
                                       onChange={e => setMain({ ...main, description: e.target.value })} /></div>
                            <div><label className="label">Customer</label>
                                <select className="input" value={main.customer_id}
                                        onChange={e => setMain({ ...main, customer_id: e.target.value })}>
                                    <option value="">—</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.alias} — {c.full_name}</option>)}
                                </select></div>
                            <div><label className="label">Status</label>
                                <select className="input" value={main.status}
                                        onChange={e => setMain({ ...main, status: e.target.value })}>
                                    <option>Pipeline</option><option>Win</option><option>Loss</option><option>Backlog</option>
                                </select></div>
                            <div><label className="label">Start Date</label>
                                <input type="date" className="input" value={main.project_start_date}
                                       onChange={e => setMain({ ...main, project_start_date: e.target.value })} /></div>
                            <div><label className="label">End Date</label>
                                <input type="date" className="input" value={main.project_end_date}
                                       onChange={e => setMain({ ...main, project_end_date: e.target.value })} /></div>
                            <div className="col-span-2"><label className="label">Pipeline Target Date</label>
                                <input type="date" className="input" value={main.pipeline_target_date}
                                       onChange={e => setMain({ ...main, pipeline_target_date: e.target.value })} /></div>
                            <div className="col-span-2"><label className="label">Note</label>
                                <textarea className="input" rows={2} value={main.note}
                                          onChange={e => setMain({ ...main, note: e.target.value })} /></div>
                        </div>
                    </section>

                    <section>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Subscription</h3>
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                                <input type="checkbox" checked={includeSub}
                                       onChange={e => {
                                           setIncludeSub(e.target.checked);
                                           if (e.target.checked && !sub) {
                                               setSub({
                                                   license_name: '', license_start_date: '',
                                                   license_end_date: '', license_revenue: 0,
                                                   license_cost: 0,
                                                   erp_code: main?.project_code || ''
                                               });
                                           }
                                       }} />
                                Include
                            </label>
                        </div>
                        {includeSub && sub ? (
                            <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-white border border-slate-200/70">
                                <div className="col-span-2"><label className="label">License Name</label>
                                    <input className="input" value={sub.license_name}
                                           onChange={e => setSub({ ...sub, license_name: e.target.value })} /></div>
                                <div><label className="label">License Start Date</label>
                                    <input type="date" className="input" value={sub.license_start_date}
                                           onChange={e => setSub({ ...sub, license_start_date: e.target.value })} /></div>
                                <div><label className="label">License End Date</label>
                                    <input type="date" className="input" value={sub.license_end_date}
                                           onChange={e => setSub({ ...sub, license_end_date: e.target.value })} /></div>
                                <div><label className="label">License Revenue (Baht)</label>
                                    <input type="number" className="input" value={sub.license_revenue}
                                           onChange={e => setSub({ ...sub, license_revenue: e.target.value })} /></div>
                                <div><label className="label">License Cost (Baht)</label>
                                    <input type="number" className="input" value={sub.license_cost}
                                           onChange={e => setSub({ ...sub, license_cost: e.target.value })} /></div>
                                <div className="col-span-2"><label className="label">ERP Code</label>
                                    <input className="input" value={sub.erp_code}
                                           onChange={e => setSub({ ...sub, erp_code: e.target.value })} /></div>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 italic">Subscription will not be created.</p>
                        )}
                    </section>

                    <section>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                                Service MA <span className="text-slate-400 font-normal normal-case">({svcRows.length} {svcRows.length === 1 ? 'row' : 'rows'})</span>
                            </h3>
                            <button className="btn-ghost" onClick={addSvc} type="button">
                                <PlusIcon className="w-4 h-4" /> Add row
                            </button>
                        </div>
                        {svcRows.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">No Service MA rows.</p>
                        ) : (
                            <div className="space-y-2">
                                {svcRows.map((row, i) => (
                                    <div key={i} className="grid grid-cols-12 gap-2 p-3 rounded-xl bg-white border border-slate-200/70">
                                        <div className="col-span-12">
                                            <label className="label">Description</label>
                                            <input className="input" value={row.description}
                                                   onChange={e => updateSvc(i, { description: e.target.value })} />
                                        </div>
                                        <div className="col-span-3">
                                            <label className="label">Start</label>
                                            <input type="date" className="input" value={row.start_date}
                                                   onChange={e => updateSvc(i, { start_date: e.target.value })} />
                                        </div>
                                        <div className="col-span-3">
                                            <label className="label">End</label>
                                            <input type="date" className="input" value={row.end_date}
                                                   onChange={e => updateSvc(i, { end_date: e.target.value })} />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="label">Revenue</label>
                                            <input type="number" className="input" value={row.revenue}
                                                   onChange={e => updateSvc(i, { revenue: e.target.value })} />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="label">Cost</label>
                                            <input type="number" className="input" value={row.cost}
                                                   onChange={e => updateSvc(i, { cost: e.target.value })} />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="label">ERP Code</label>
                                            <input className="input" value={row.erp_code}
                                                   onChange={e => updateSvc(i, { erp_code: e.target.value })} />
                                        </div>
                                        <div className="col-span-12 flex justify-end">
                                            <button type="button" className="btn-ghost text-red-500"
                                                    onClick={() => removeSvc(i)}>
                                                <TrashIcon className="w-4 h-4" /> Remove row
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </Modal>
    );
}

function dummyCode(original) {
    if (!original) return 'DUM';
    const s = String(original);
    const suffix = s.length >= 6 ? s.slice(-6) : s;
    return 'DUM' + suffix;
}

function addOneYear(dateStr) {
    if (!dateStr) return '';
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    let y = Number(m[1]) + 1;
    let mo = Number(m[2]);
    let d = Number(m[3]);
    if (mo === 2 && d === 29) {
        const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
        if (!isLeap) d = 28;
    }
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
