import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import Modal from '../components/Modal';
import StatusPill from '../components/StatusPill';
import { baht, formatDate } from '../format';
import { ChartPieIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline';

function dateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
}

function num(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
}

function revenueForProject(project = {}) {
    const subscriptionRevenue = num(project.subscription?.license_revenue);
    let perpetualRevenue = 0;
    let softwareMaRevenue = 0;
    for (const row of project.perpetual_ma || []) {
        if (row.item_type === 'License') perpetualRevenue += num(row.revenue);
        else softwareMaRevenue += num(row.revenue);
    }
    const serviceMaRevenue = (project.service_ma || []).reduce((sum, row) => sum + num(row.revenue), 0);
    const implementationRevenue = num(project.implementation?.revenue);
    let outsourceRevenue = 0;
    if (project.outsource) {
        outsourceRevenue = project.outsource.outsource_type === 'Man-Month'
            ? (project.outsource.months || []).reduce((sum, row) => sum + num(row.revenue), 0)
            : num(project.outsource.revenue);
    }
    const totalRevenue = subscriptionRevenue + perpetualRevenue + softwareMaRevenue
        + serviceMaRevenue + implementationRevenue + outsourceRevenue;
    return {
        subscriptionRevenue,
        perpetualRevenue,
        softwareMaRevenue,
        serviceMaRevenue,
        implementationRevenue,
        outsourceRevenue,
        totalRevenue
    };
}

export default function PipelineDashboard() {
    const [projects, setProjects] = useState([]);
    const [notes, setNotes] = useState([]);
    const [noteProject, setNoteProject] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            api.get('/projects'),
            api.get('/projects/pipeline-notes/all')
        ])
            .then(([p, n]) => {
                const pipelineProjects = (p.data || []).filter(row => row.status === 'Pipeline');
                setNotes(n.data || []);
                return Promise.all(pipelineProjects.map(project => api.get(`/projects/${project.id}`)
                    .then(detail => ({ ...project, ...detail.data, revenue: revenueForProject(detail.data) }))
                    .catch(() => ({ ...project, revenue: revenueForProject(project) }))));
            })
            .then(detailRows => {
                setProjects(detailRows || []);
            })
            .catch(() => {
                setProjects([]);
                setNotes([]);
            })
            .finally(() => setLoading(false));
    }, []);

    const notesByProject = useMemo(() => {
        const m = new Map();
        for (const note of notes) {
            if (!m.has(note.project_code)) m.set(note.project_code, []);
            m.get(note.project_code).push(note);
        }
        return m;
    }, [notes]);

    const totals = useMemo(() => projects.reduce((sum, project) => ({
        subscriptionRevenue: sum.subscriptionRevenue + num(project.revenue?.subscriptionRevenue),
        perpetualRevenue: sum.perpetualRevenue + num(project.revenue?.perpetualRevenue),
        softwareMaRevenue: sum.softwareMaRevenue + num(project.revenue?.softwareMaRevenue),
        serviceMaRevenue: sum.serviceMaRevenue + num(project.revenue?.serviceMaRevenue),
        implementationRevenue: sum.implementationRevenue + num(project.revenue?.implementationRevenue),
        outsourceRevenue: sum.outsourceRevenue + num(project.revenue?.outsourceRevenue),
        totalRevenue: sum.totalRevenue + num(project.revenue?.totalRevenue)
    }), {
        subscriptionRevenue: 0,
        perpetualRevenue: 0,
        softwareMaRevenue: 0,
        serviceMaRevenue: 0,
        implementationRevenue: 0,
        outsourceRevenue: 0,
        totalRevenue: 0
    }), [projects]);

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-3xl font-extrabold">
                    <span className="brand-mark">Pipeline Dashboard</span>
                </h1>
                <p className="text-sm text-slate-500 mt-1">Read-only pipeline project view with note history.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-amber-100 text-amber-700">
                        <ChartPieIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Pipeline Projects</div>
                        <div className="text-xl font-extrabold text-amber-700">{projects.length}</div>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-emerald-100 text-emerald-700">
                        <CurrencyDollarIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Total Revenue</div>
                        <div className="text-xl font-extrabold text-emerald-700">{baht(totals.totalRevenue)}</div>
                    </div>
                </div>
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean min-w-[1800px]">
                    <thead>
                        <tr>
                            <th>Project Code</th>
                            <th>Description</th>
                            <th>Customer</th>
                            <th>Status</th>
                            <th>% to Win</th>
                            <th>Start</th>
                            <th>End</th>
                            <th className="text-right">Subscription Revenue</th>
                            <th className="text-right">Perpetual Revenue</th>
                            <th className="text-right">Software MA Revenue</th>
                            <th className="text-right">Service MA Revenue</th>
                            <th className="text-right">Implementation Revenue</th>
                            <th className="text-right">Outsource Revenue</th>
                            <th className="text-right">Total Revenue</th>
                            <th>Note</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={15} className="text-center text-slate-400 py-6">Loading...</td></tr>}
                        {!loading && projects.map(project => {
                            const projectNotes = notesByProject.get(project.project_code) || [];
                            const revenue = project.revenue || revenueForProject(project);
                            return (
                                <tr key={project.id}>
                                    <td className="font-mono text-xs">{project.project_code}</td>
                                    <td className="max-w-[320px] truncate" title={project.description}>{project.description}</td>
                                    <td>{project.customer_alias || '-'}</td>
                                    <td><StatusPill status={project.status} /></td>
                                    <td>{Number(project.pipeline_win_pct ?? 50).toFixed(0)}%</td>
                                    <td>{formatDate(project.project_start_date)}</td>
                                    <td>{formatDate(project.project_end_date)}</td>
                                    <MoneyCell value={revenue.subscriptionRevenue} />
                                    <MoneyCell value={revenue.perpetualRevenue} />
                                    <MoneyCell value={revenue.softwareMaRevenue} />
                                    <MoneyCell value={revenue.serviceMaRevenue} />
                                    <MoneyCell value={revenue.implementationRevenue} />
                                    <MoneyCell value={revenue.outsourceRevenue} />
                                    <MoneyCell value={revenue.totalRevenue} strong />
                                    <td className="min-w-[320px] max-w-[420px]">
                                        {projectNotes.length === 0 ? (
                                            <span className="text-slate-400">-</span>
                                        ) : (
                                            <div className="space-y-1">
                                                <div className="text-xs font-semibold text-slate-500">{dateTime(projectNotes[0].created_at)}</div>
                                                <div className="truncate text-sm text-slate-700" title={projectNotes[0].note}>
                                                    {projectNotes[0].note}
                                                </div>
                                                <button type="button"
                                                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                                                        onClick={() => setNoteProject(project)}>
                                                    View More ({projectNotes.length})
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {!loading && projects.length === 0 && (
                            <tr><td colSpan={15} className="text-center text-slate-400 py-6">No pipeline projects.</td></tr>
                        )}
                        {!loading && projects.length > 0 && (
                            <tr className="bg-slate-50 font-bold">
                                <td colSpan={7}>Total</td>
                                <MoneyCell value={totals.subscriptionRevenue} strong />
                                <MoneyCell value={totals.perpetualRevenue} strong />
                                <MoneyCell value={totals.softwareMaRevenue} strong />
                                <MoneyCell value={totals.serviceMaRevenue} strong />
                                <MoneyCell value={totals.implementationRevenue} strong />
                                <MoneyCell value={totals.outsourceRevenue} strong />
                                <MoneyCell value={totals.totalRevenue} strong />
                                <td></td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {noteProject && (
                <PipelineNotesModal
                    project={noteProject}
                    notes={notesByProject.get(noteProject.project_code) || []}
                    onClose={() => setNoteProject(null)}
                />
            )}
        </div>
    );
}

function MoneyCell({ value, strong = false }) {
    return (
        <td className={`text-right tabular-nums ${strong ? 'font-extrabold text-emerald-700' : ''}`}>
            {baht(value || 0)}
        </td>
    );
}

function PipelineNotesModal({ project, notes, onClose }) {
    return (
        <Modal open onClose={onClose} title={`Pipeline Notes - ${project.project_code}`} size="lg"
               footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
            <div className="space-y-3">
                {notes.length === 0 ? (
                    <div className="py-6 text-center text-sm text-slate-400">No notes yet.</div>
                ) : notes.map(note => (
                    <div key={note.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold text-slate-500">{dateTime(note.created_at)}</div>
                        <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{note.note}</div>
                    </div>
                ))}
            </div>
        </Modal>
    );
}
