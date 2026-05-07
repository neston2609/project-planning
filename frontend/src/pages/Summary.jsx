import { useEffect, useState } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import api from '../api';
import { useYear } from '../YearContext';
import { baht } from '../format';
import {
    BanknotesIcon, FlagIcon, PresentationChartLineIcon
} from '@heroicons/react/24/outline';

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

    if (loading) return <p className="text-slate-500 animate-pulse">Loading...</p>;
    if (!data) return <p className="text-slate-500">No data.</p>;

    const totalPipeline   = data.pipeline_license_revenue + data.pipeline_service_revenue;
    const totalBacklogWin = data.backlog_win_license_revenue + data.backlog_win_service_revenue;
    const remaining       = data.remaining_gap;
    const totalLicense    = data.pipeline_license_revenue + data.backlog_win_license_revenue;
    const totalService    = data.pipeline_service_revenue + data.backlog_win_service_revenue;
    const reachedPct = data.target_revenue > 0
        ? Math.min(100, (data.total_revenue / data.target_revenue) * 100) : 0;

    const pieData = {
        labels: ['Pipeline', 'Backlog & Win', 'Remaining Target'],
        datasets: [{
            data: [totalPipeline, totalBacklogWin, remaining],
            backgroundColor: ['#fbbf24', '#10b981', '#cbd5e1'],
            borderColor: '#ffffff',
            borderWidth: 3,
            hoverOffset: 10
        }]
    };
    const pieOptions = {
        plugins: {
            legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } }
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-extrabold text-slate-900">
                    <span className="brand-mark">Summary</span> · Year {data.year}
                </h1>
                <p className="text-sm text-slate-500 mt-1">A quick read on revenue progress against target.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="kpi kpi-blue">
                    <div className="flex items-center justify-between">
                        <PresentationChartLineIcon className="w-7 h-7 opacity-90" />
                        <span className="text-[11px] uppercase tracking-wider opacity-80">Recognized</span>
                    </div>
                    <div className="text-3xl font-extrabold tabular-nums mt-3">{baht(data.total_revenue)}</div>
                    <div className="text-xs opacity-80 mt-1">Pipeline + Backlog/Win</div>
                </div>
                <div className="kpi kpi-purple">
                    <div className="flex items-center justify-between">
                        <FlagIcon className="w-7 h-7 opacity-90" />
                        <span className="text-[11px] uppercase tracking-wider opacity-80">Target</span>
                    </div>
                    <div className="text-3xl font-extrabold tabular-nums mt-3">{baht(data.target_revenue)}</div>
                    <div className="text-xs opacity-80 mt-1">{data.headcount} HC × {baht(data.revenue_per_headcount)} / HC</div>
                </div>
                <div className={`kpi ${remaining > 0 ? 'kpi-amber' : 'kpi-green'}`}>
                    <div className="flex items-center justify-between">
                        <BanknotesIcon className="w-7 h-7 opacity-90" />
                        <span className="text-[11px] uppercase tracking-wider opacity-80">{remaining > 0 ? 'Remaining' : 'Surplus'}</span>
                    </div>
                    <div className="text-3xl font-extrabold tabular-nums mt-3">{baht(remaining)}</div>
                    <div className="text-xs opacity-80 mt-1">{remaining > 0 ? 'Below target' : 'Target reached'}</div>
                </div>
            </div>

            {/* Progress bar */}
            <div className="card p-5">
                <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-slate-700">Progress to target</div>
                    <div className="text-sm tabular-nums font-bold text-indigo-600">{reachedPct.toFixed(1)}%</div>
                </div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                         style={{ width: `${reachedPct}%`, backgroundImage: 'var(--grad-brand)' }} />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="card p-5 lg:col-span-2">
                    <h2 className="font-bold text-slate-800 mb-4">Revenue Detail</h2>
                    <table className="table-clean">
                        <thead>
                            <tr><th></th>
                                <th className="text-right">License (GM)</th>
                                <th className="text-right">Service (Rev)</th>
                                <th className="text-right">Total</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span className="pill-pipe">Pipeline</span></td>
                                <td className="text-right tabular-nums">{baht(data.pipeline_license_revenue)}</td>
                                <td className="text-right tabular-nums">{baht(data.pipeline_service_revenue)}</td>
                                <td className="text-right tabular-nums font-semibold">{baht(totalPipeline)}</td>
                            </tr>
                            <tr>
                                <td><span className="pill-win">Backlog &amp; Win</span></td>
                                <td className="text-right tabular-nums">{baht(data.backlog_win_license_revenue)}</td>
                                <td className="text-right tabular-nums">{baht(data.backlog_win_service_revenue)}</td>
                                <td className="text-right tabular-nums font-semibold">{baht(totalBacklogWin)}</td>
                            </tr>
                            <tr className="bg-gradient-to-r from-indigo-50/60 to-pink-50/60">
                                <td className="font-bold">Total</td>
                                <td className="text-right tabular-nums font-bold">{baht(totalLicense)}</td>
                                <td className="text-right tabular-nums font-bold">{baht(totalService)}</td>
                                <td className="text-right tabular-nums font-extrabold text-indigo-700">{baht(data.total_revenue)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className="card p-5">
                    <h2 className="font-bold text-slate-800 mb-4">Distribution</h2>
                    <Pie data={pieData} options={pieOptions} />
                </div>
            </div>
        </div>
    );
}
