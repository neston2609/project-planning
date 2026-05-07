import { useEffect, useState } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import api from '../api';
import { useYear } from '../YearContext';
import { baht } from '../format';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function Summary() {
    const { year } = useYear();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.get(`/dashboards/summary?year=${year}`)
            .then(r => setData(r.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [year]);

    if (loading) return <p className="text-slate-500">Loading...</p>;
    if (!data) return <p className="text-slate-500">No data.</p>;

    const totalPipeline    = data.pipeline_license_revenue + data.pipeline_service_revenue;
    const totalBacklogWin  = data.backlog_win_license_revenue + data.backlog_win_service_revenue;
    const remaining        = data.remaining_gap;

    const pieData = {
        labels: ['Pipeline', 'Backlog & Win', 'Remaining Target'],
        datasets: [{
            data: [totalPipeline, totalBacklogWin, remaining],
            backgroundColor: ['#fbbf24', '#10b981', '#cbd5e1'],
            borderWidth: 0
        }]
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Summary — Year {data.year}</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KPI label="Total Revenue (Recognized)" value={baht(data.total_revenue)} hint="Pipeline + Backlog/Win" />
                <KPI label="Target Revenue" value={baht(data.target_revenue)}
                     hint={`${data.headcount} HC × ${baht(data.revenue_per_headcount)} / HC`} />
                <KPI label="Remaining Gap" value={baht(remaining)}
                     tone={remaining > 0 ? 'warn' : 'good'}
                     hint={remaining > 0 ? 'Below target' : 'Target met'} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="card p-4 lg:col-span-2">
                    <h2 className="font-semibold mb-3">Revenue Detail</h2>
                    <table className="table-clean">
                        <thead>
                            <tr><th></th><th className="text-right">License (GM)</th><th className="text-right">Service (Rev)</th><th className="text-right">Total</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="font-medium text-amber-700">Pipeline</td>
                                <td className="text-right tabular-nums">{baht(data.pipeline_license_revenue)}</td>
                                <td className="text-right tabular-nums">{baht(data.pipeline_service_revenue)}</td>
                                <td className="text-right tabular-nums font-semibold">{baht(totalPipeline)}</td>
                            </tr>
                            <tr>
                                <td className="font-medium text-emerald-700">Backlog &amp; Win</td>
                                <td className="text-right tabular-nums">{baht(data.backlog_win_license_revenue)}</td>
                                <td className="text-right tabular-nums">{baht(data.backlog_win_service_revenue)}</td>
                                <td className="text-right tabular-nums font-semibold">{baht(totalBacklogWin)}</td>
                            </tr>
                            <tr className="bg-slate-50">
                                <td className="font-bold">Total</td>
                                <td className="text-right tabular-nums font-bold">{baht(data.pipeline_license_revenue + data.backlog_win_license_revenue)}</td>
                                <td className="text-right tabular-nums font-bold">{baht(data.pipeline_service_revenue + data.backlog_win_service_revenue)}</td>
                                <td className="text-right tabular-nums font-bold">{baht(data.total_revenue)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className="card p-4">
                    <h2 className="font-semibold mb-3">Distribution</h2>
                    <Pie data={pieData} />
                </div>
            </div>
        </div>
    );
}

function KPI({ label, value, hint, tone }) {
    const toneCls = tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-800';
    return (
        <div className="card p-4">
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`text-2xl font-bold tabular-nums mt-1 ${toneCls}`}>{value}</div>
            {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
        </div>
    );
}
