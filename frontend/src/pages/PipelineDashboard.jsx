import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import StatusPill from '../components/StatusPill';
import { formatDate } from '../format';
import { ChartPieIcon } from '@heroicons/react/24/outline';

function dateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
}

export default function PipelineDashboard() {
    const [projects, setProjects] = useState([]);
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            api.get('/projects'),
            api.get('/projects/pipeline-notes/all')
        ])
            .then(([p, n]) => {
                setProjects((p.data || []).filter(row => row.status === 'Pipeline'));
                setNotes(n.data || []);
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
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean min-w-[1200px]">
                    <thead>
                        <tr>
                            <th>Project Code</th>
                            <th>Description</th>
                            <th>Customer</th>
                            <th>Status</th>
                            <th>% to Win</th>
                            <th>Start</th>
                            <th>End</th>
                            <th>Note</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={8} className="text-center text-slate-400 py-6">Loading...</td></tr>}
                        {!loading && projects.map(project => {
                            const projectNotes = notesByProject.get(project.project_code) || [];
                            return (
                                <tr key={project.id}>
                                    <td className="font-mono text-xs">{project.project_code}</td>
                                    <td className="max-w-[320px] truncate" title={project.description}>{project.description}</td>
                                    <td>{project.customer_alias || '-'}</td>
                                    <td><StatusPill status={project.status} /></td>
                                    <td>{Number(project.pipeline_win_pct ?? 50).toFixed(0)}%</td>
                                    <td>{formatDate(project.project_start_date)}</td>
                                    <td>{formatDate(project.project_end_date)}</td>
                                    <td className="min-w-[320px]">
                                        {projectNotes.length === 0 ? (
                                            <span className="text-slate-400">-</span>
                                        ) : (
                                            <div className="space-y-2">
                                                {projectNotes.map(note => (
                                                    <div key={note.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                                        <div className="text-xs font-semibold text-slate-500">{dateTime(note.created_at)}</div>
                                                        <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{note.note}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {!loading && projects.length === 0 && (
                            <tr><td colSpan={8} className="text-center text-slate-400 py-6">No pipeline projects.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
