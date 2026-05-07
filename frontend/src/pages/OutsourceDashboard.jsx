import { useEffect, useState } from 'react';
import api from '../api';
import { useYear } from '../YearContext';
import StatusPill from '../components/StatusPill';
import { baht, pct, formatDate } from '../format';

export default function OutsourceDashboard() {
    const { year } = useYear();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.get(`/dashboards/outsource?year=${year}`)
            .then(r => setRows(r.data.rows))
            .finally(() => setLoading(false));
    }, [year]);

    const totals = rows.reduce((a, r) => ({
        rev: a.rev + r.recognize_revenue, gm: a.gm + r.recognize_gross_margin
    }), { rev: 0, gm: 0 });

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold">Outsource — {year}</h1>
            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead>
                        <tr>
                            <th>Code</th><th>Description</th><th>Customer</th><th>Status</th>
                            <th>Type</th><th>Start</th><th>End</th>
                            <th className="text-right">Revenue (Year)</th>
                            <th className="text-right">Cost (Year)</th>
                            <th className="text-right">GM</th>
                            <th className="text-right">% Rec</th>
                            <th className="text-right">Rec. Revenue</th>
                            <th className="text-right">Rec. GM</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={13} className="text-center py-6 text-slate-400">Loading...</td></tr>}
                        {!loading && rows.length === 0 && <tr><td colSpan={13} className="text-center py-6 text-slate-400">No data</td></tr>}
                        {rows.map(r => (
                            <tr key={r.id}>
                                <td className="font-mono text-xs">{r.project_code}</td>
                                <td className="max-w-[220px] truncate" title={r.description}>{r.description}</td>
                                <td>{r.customer || '-'}</td>
                                <td><StatusPill status={r.status} /></td>
                                <td>{r.outsource_type}</td>
                                <td>{formatDate(r.start_date)}</td>
                                <td>{formatDate(r.end_date)}</td>
                                <td className="text-right tabular-nums">{baht(r.revenue)}</td>
                                <td className="text-right tabular-nums">{baht(r.cost)}</td>
                                <td className="text-right tabular-nums">{baht(r.gross_margin)}</td>
                                <td className="text-right tabular-nums">{pct(r.pct_recognize)}</td>
                                <td className="text-right tabular-nums font-medium">{baht(r.recognize_revenue)}</td>
                                <td className="text-right tabular-nums font-medium">{baht(r.recognize_gross_margin)}</td>
                            </tr>
                        ))}
                        {!loading && rows.length > 0 && (
                            <tr className="bg-slate-50 font-semibold">
                                <td colSpan={11} className="text-right">Totals</td>
                                <td className="text-right tabular-nums">{baht(totals.rev)}</td>
                                <td className="text-right tabular-nums">{baht(totals.gm)}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
