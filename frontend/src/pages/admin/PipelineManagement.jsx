import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '../../api';
import toast from 'react-hot-toast';
import Modal from '../../components/Modal';
import StatusPill from '../../components/StatusPill';
import { baht, formatDate } from '../../format';
import {
    ArrowUpTrayIcon, DocumentMagnifyingGlassIcon, PaperClipIcon,
    PlusIcon, SparklesIcon
} from '@heroicons/react/24/outline';

function addMonths(date, months) {
    const d = new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
    if (d.getDate() !== date.getDate()) d.setDate(0);
    return d;
}

function ymd(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function money(value) {
    const text = String(value ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
    if (!text || text === '-' || text === '.') return 0;
    const n = Number(text);
    return Number.isFinite(n) ? n : 0;
}

function rowText(row) {
    return row.map(v => String(v || '').trim()).filter(Boolean).join(' ');
}

function pairFromRow(row) {
    const cost = money(row[5]);
    const revenue = money(row[7]);
    if (cost || revenue) return { cost, revenue };
    const nums = row.map(money).filter(n => n >= 1000);
    return { cost: nums[0] || 0, revenue: nums[1] || 0 };
}

function findValueAfterLabel(rows, label) {
    const needle = label.toLowerCase();
    for (const row of rows) {
        const idx = row.findIndex(cell => String(cell || '').trim().toLowerCase().startsWith(needle));
        if (idx >= 0) {
            for (let i = idx + 1; i < row.length; i += 1) {
                const value = String(row[i] || '').trim();
                if (value) return value;
            }
        }
    }
    return '';
}

function customerMatch(text, customers) {
    const lower = text.toLowerCase();
    let best = null;
    for (const c of customers || []) {
        const names = [c.alias, c.full_name].map(v => String(v || '').trim()).filter(Boolean);
        if (names.some(name => lower.includes(name.toLowerCase()))) {
            const score = Math.max(...names.map(name => name.length));
            if (!best || score > best.score) best = { customer: c, score };
        }
    }
    return best?.customer || null;
}

async function parseBudgetFile(file, customers) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheets = wb.SheetNames.map(name => ({
        name,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' })
    }));
    const target = sheets.find(s => {
        const text = s.rows.slice(0, 80).map(rowText).join('\n').toLowerCase();
        return text.includes('cost breakdown') && (text.includes('subscription') || text.includes('support services'));
    }) || sheets[0];

    const rows = target?.rows || [];
    const allText = rows.map(rowText).join('\n');
    const client = findValueAfterLabel(rows, 'Client');
    const project = findValueAfterLabel(rows, 'Project');
    const description = findValueAfterLabel(rows, 'Description') || project;
    const matchedCustomer = customerMatch(`${client}\n${allText}`, customers);

    const out = {
        sheet_name: target?.name || '',
        project_description: description || project || '',
        customer_id: matchedCustomer?.id || '',
        customer_hint: client || '',
        subscription_cost: 0,
        subscription_revenue: 0,
        implementation_cost: 0,
        implementation_revenue: 0,
        service_ma_cost: 0,
        service_ma_revenue: 0
    };

    for (const row of rows) {
        const text = rowText(row).toLowerCase();
        if (!text.startsWith('total')) continue;
        if (text.includes('subscription') && !out.subscription_revenue) {
            const pair = pairFromRow(row);
            out.subscription_cost = pair.cost;
            out.subscription_revenue = pair.revenue;
        } else if (text.includes('professional service') && text.includes('implementation') && !out.implementation_revenue) {
            const pair = pairFromRow(row);
            out.implementation_cost = pair.cost;
            out.implementation_revenue = pair.revenue;
        } else if (text.includes('support services') && !out.service_ma_revenue) {
            const pair = pairFromRow(row);
            out.service_ma_cost = pair.cost;
            out.service_ma_revenue = pair.revenue;
        }
    }

    return out;
}

async function uploadProjectAttachment(projectId, file, documentTypeId) {
    const params = new URLSearchParams({ filename: file.name });
    if (documentTypeId) params.set('document_type_id', String(documentTypeId));
    return api.post(`/projects/${projectId}/attachments?${params.toString()}`, file, {
        headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name),
            'X-File-Type': file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'X-Document-Type-Id': documentTypeId || ''
        },
        timeout: 0
    });
}

function defaultForm() {
    const start = addMonths(new Date(), 1);
    const end = addMonths(start, 12);
    return {
        project_code: '',
        description: '',
        customer_id: '',
        project_start_date: ymd(start),
        project_end_date: ymd(end),
        status: 'Pipeline',
        pipeline_win_pct: 50,
        pipeline_target_date: '',
        note: '',
        subscription_cost: 0,
        subscription_revenue: 0,
        implementation_cost: 0,
        implementation_revenue: 0,
        service_ma_cost: 0,
        service_ma_revenue: 0,
        analysis_note: ''
    };
}

export default function PipelineManagement() {
    const [projects, setProjects] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [documentTypes, setDocumentTypes] = useState([]);
    const [creating, setCreating] = useState(false);
    const [loading, setLoading] = useState(true);

    async function load() {
        setLoading(true);
        try {
            const [p, c, d] = await Promise.all([
                api.get('/projects'),
                api.get('/customers'),
                api.get('/admin/project-attachment-types')
            ]);
            setProjects((p.data || []).filter(row => row.status === 'Pipeline'));
            setCustomers(c.data || []);
            setDocumentTypes(d.data || []);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load pipelines');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, []);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Pipeline Management</h1>
                    <p className="text-sm text-slate-500">Create and review Pipeline projects from budget Excel files.</p>
                </div>
                <button className="btn-primary ml-auto" onClick={() => setCreating(true)}>
                    <PlusIcon className="w-4 h-4" /> Add Pipeline Project
                </button>
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead>
                        <tr>
                            <th>Project Code</th><th>Description</th><th>Customer</th><th>Status</th>
                            <th>% to Win</th><th>Start</th><th>End</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={7} className="text-center text-slate-400 py-6">Loading...</td></tr>}
                        {!loading && projects.map(p => (
                            <tr key={p.id}>
                                <td className="font-mono text-xs">{p.project_code}</td>
                                <td className="max-w-[340px] truncate" title={p.description}>{p.description}</td>
                                <td>{p.customer_alias || '-'}</td>
                                <td><StatusPill status={p.status} /></td>
                                <td>{Number(p.pipeline_win_pct ?? 50).toFixed(0)}%</td>
                                <td>{formatDate(p.project_start_date)}</td>
                                <td>{formatDate(p.project_end_date)}</td>
                            </tr>
                        ))}
                        {!loading && projects.length === 0 && (
                            <tr><td colSpan={7} className="text-center text-slate-400 py-6">No pipeline projects.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {creating && (
                <PipelineModal
                    customers={customers}
                    documentTypes={documentTypes}
                    onClose={() => setCreating(false)}
                    onCreated={() => { setCreating(false); load(); }}
                />
            )}
        </div>
    );
}

function PipelineModal({ customers, documentTypes, onClose, onCreated }) {
    const fileRef = useRef(null);
    const [f, setF] = useState(defaultForm);
    const [file, setFile] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [saving, setSaving] = useState(false);
    const documentTypeId = useMemo(() => {
        const general = (documentTypes || []).find(t => t.name === 'General');
        return general?.id || (documentTypes || [])[0]?.id || '';
    }, [documentTypes]);

    async function chooseFile(e) {
        const selected = e.target.files?.[0];
        e.target.value = '';
        if (!selected) return;
        setFile(selected);
        setAnalyzing(true);
        try {
            const [code, analysis] = await Promise.all([
                api.get('/projects/dummy-code'),
                parseBudgetFile(selected, customers)
            ]);
            setF(current => ({
                ...current,
                project_code: code.data.project_code || current.project_code,
                description: analysis.project_description || current.description,
                customer_id: analysis.customer_id || '',
                subscription_cost: analysis.subscription_cost,
                subscription_revenue: analysis.subscription_revenue,
                implementation_cost: analysis.implementation_cost,
                implementation_revenue: analysis.implementation_revenue,
                service_ma_cost: analysis.service_ma_cost,
                service_ma_revenue: analysis.service_ma_revenue,
                note: [
                    current.note,
                    analysis.customer_hint && !analysis.customer_id ? `Customer hint from budget file: ${analysis.customer_hint}` : '',
                    analysis.sheet_name ? `Budget analysis sheet: ${analysis.sheet_name}` : ''
                ].filter(Boolean).join('\n'),
                analysis_note: analysis.customer_hint && !analysis.customer_id
                    ? `Found customer text "${analysis.customer_hint}", but it did not match an existing Customer.`
                    : 'Budget file analyzed. Please review before saving.'
            }));
            toast.success('Budget file analyzed');
        } catch (err) {
            toast.error(err.message || 'Analyze failed');
        } finally {
            setAnalyzing(false);
        }
    }

    async function save() {
        if (!f.project_code.trim()) return toast.error('Project Code is required');
        setSaving(true);
        try {
            const created = await api.post('/projects', {
                project_code: f.project_code.trim(),
                description: f.description || '',
                customer_id: f.customer_id ? Number(f.customer_id) : null,
                project_start_date: f.project_start_date || null,
                project_end_date: f.project_end_date || null,
                status: 'Pipeline',
                pipeline_win_pct: Number(f.pipeline_win_pct || 50),
                pipeline_target_date: f.pipeline_target_date || null,
                note: f.note || ''
            });
            const id = created.data.id;
            if (Number(f.subscription_revenue || 0) || Number(f.subscription_cost || 0)) {
                await api.put(`/projects/${id}/subscription`, {
                    license_name: 'Subscription License',
                    license_start_date: f.project_start_date || null,
                    license_end_date: f.project_end_date || null,
                    license_revenue: Number(f.subscription_revenue || 0),
                    license_cost: Number(f.subscription_cost || 0)
                });
            }
            if (Number(f.implementation_revenue || 0) || Number(f.implementation_cost || 0)) {
                await api.put(`/projects/${id}/implementation`, {
                    description: 'Implementation',
                    progress_last_year_pct: 0,
                    progress_this_year_pct: 0,
                    revenue: Number(f.implementation_revenue || 0),
                    cost: Number(f.implementation_cost || 0)
                });
            }
            if (Number(f.service_ma_revenue || 0) || Number(f.service_ma_cost || 0)) {
                await api.post(`/projects/${id}/service-ma`, {
                    description: 'Service MA',
                    start_date: f.project_start_date || null,
                    end_date: f.project_end_date || null,
                    revenue: Number(f.service_ma_revenue || 0),
                    cost: Number(f.service_ma_cost || 0)
                });
            }
            if (file) await uploadProjectAttachment(id, file, documentTypeId);
            toast.success('Pipeline project created');
            onCreated(id);
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Create failed');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal open onClose={onClose} title="New Pipeline Project" size="xl"
               footer={<>
                   <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
                   <button className="btn-primary" onClick={save} disabled={saving || analyzing}>
                       {saving ? 'Saving...' : 'Save Pipeline Project'}
                   </button>
               </>}>
            <div className="space-y-4">
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 font-bold text-indigo-900">
                            <SparklesIcon className="w-5 h-5 text-indigo-600" />
                            AI Budget Helper
                        </div>
                        <button type="button" className="btn-ghost ml-auto" disabled={analyzing || saving}
                                onClick={() => fileRef.current?.click()}>
                            <ArrowUpTrayIcon className="w-4 h-4" />
                            {file ? 'Replace Excel Budget File' : 'Upload Excel Budget File'}
                        </button>
                        <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" className="hidden" onChange={chooseFile} />
                    </div>
                    <div className="mt-2 text-sm text-slate-600 flex items-center gap-2">
                        <PaperClipIcon className="w-4 h-4 text-slate-400" />
                        {file ? file.name : 'Upload a budget Excel file to auto-fill project code, customer, dates, revenue, and cost.'}
                    </div>
                    {analyzing && <div className="mt-2 text-sm text-indigo-700 animate-pulse">Reading and analyzing budget file...</div>}
                    {f.analysis_note && <div className="mt-2 text-sm text-indigo-800">{f.analysis_note}</div>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">Project Code</label>
                        <input className="input font-mono" value={f.project_code} onChange={e => setF({ ...f, project_code: e.target.value })} /></div>
                    <div><label className="label">% to Win</label>
                        <input type="number" min="0" max="100" className="input" value={f.pipeline_win_pct}
                               onChange={e => setF({ ...f, pipeline_win_pct: e.target.value })} /></div>
                    <div className="col-span-2"><label className="label">Project Description</label>
                        <input className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
                    <div><label className="label">Customer</label>
                        <select className="input" value={f.customer_id} onChange={e => setF({ ...f, customer_id: e.target.value })}>
                            <option value="">-</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.alias} - {c.full_name}</option>)}
                        </select></div>
                    <div><label className="label">Status</label>
                        <input className="input bg-slate-100" value="Pipeline" disabled /></div>
                    <div><label className="label">Start Date</label>
                        <input type="date" className="input" value={f.project_start_date}
                               onChange={e => setF({ ...f, project_start_date: e.target.value })} /></div>
                    <div><label className="label">End Date</label>
                        <input type="date" className="input" value={f.project_end_date}
                               onChange={e => setF({ ...f, project_end_date: e.target.value })} /></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <BudgetBox title="Subscription License"
                               cost={f.subscription_cost}
                               revenue={f.subscription_revenue}
                               onCost={v => setF({ ...f, subscription_cost: v })}
                               onRevenue={v => setF({ ...f, subscription_revenue: v })} />
                    <BudgetBox title="Implementation"
                               cost={f.implementation_cost}
                               revenue={f.implementation_revenue}
                               onCost={v => setF({ ...f, implementation_cost: v })}
                               onRevenue={v => setF({ ...f, implementation_revenue: v })} />
                    <BudgetBox title="Service MA"
                               cost={f.service_ma_cost}
                               revenue={f.service_ma_revenue}
                               onCost={v => setF({ ...f, service_ma_cost: v })}
                               onRevenue={v => setF({ ...f, service_ma_revenue: v })} />
                </div>

                <div>
                    <label className="label">Note</label>
                    <textarea className="input" rows={3} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
                </div>
            </div>
        </Modal>
    );
}

function BudgetBox({ title, cost, revenue, onCost, onRevenue }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-800">
                <DocumentMagnifyingGlassIcon className="w-5 h-5 text-indigo-500" />
                {title}
            </div>
            <div>
                <label className="label">Cost</label>
                <input type="number" className="input" value={cost} onChange={e => onCost(e.target.value)} />
            </div>
            <div>
                <label className="label">Revenue</label>
                <input type="number" className="input" value={revenue} onChange={e => onRevenue(e.target.value)} />
            </div>
            <div className="text-xs text-slate-500">
                Margin: <span className="font-semibold">{baht(Number(revenue || 0) - Number(cost || 0))}</span>
            </div>
        </div>
    );
}
