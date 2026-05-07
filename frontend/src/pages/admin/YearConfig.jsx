import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { useYear } from '../../YearContext';
import { baht } from '../../format';

export default function YearConfigPage() {
    const { year } = useYear();
    const [list, setList] = useState([]);
    const [editYear, setEditYear] = useState(year);
    const [form, setForm] = useState({ headcount: 0, revenue_per_headcount: 0 });

    async function load() {
        const r = await api.get('/admin/year-config');
        setList(r.data);
        const cur = r.data.find(x => x.year === editYear);
        if (cur) setForm({ headcount: cur.headcount, revenue_per_headcount: cur.revenue_per_headcount });
        else setForm({ headcount: 0, revenue_per_headcount: 0 });
    }
    useEffect(() => { load(); }, [editYear]);

    async function save() {
        try {
            await api.put(`/admin/year-config/${editYear}`, {
                headcount: Number(form.headcount),
                revenue_per_headcount: Number(form.revenue_per_headcount)
            });
            toast.success('Saved');
            load();
        } catch (err) { toast.error('Save failed'); }
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Year Configuration</h1>

            <div className="card p-4 space-y-3 max-w-xl">
                <div className="flex items-center gap-3">
                    <label className="label !mb-0">Year</label>
                    <input type="number" className="input !w-32" value={editYear} onChange={e => setEditYear(Number(e.target.value))} />
                </div>
                <div><label className="label">Team Headcount</label>
                    <input type="number" className="input" value={form.headcount} onChange={e => setForm({ ...form, headcount: e.target.value })} /></div>
                <div><label className="label">Revenue per Headcount (Baht)</label>
                    <input type="number" className="input" value={form.revenue_per_headcount} onChange={e => setForm({ ...form, revenue_per_headcount: e.target.value })} /></div>
                <div className="text-sm text-slate-600">
                    Target = {form.headcount} × {baht(form.revenue_per_headcount)} = <span className="font-semibold">{baht(Number(form.headcount) * Number(form.revenue_per_headcount))}</span>
                </div>
                <button className="btn-primary" onClick={save}>Save</button>
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr><th>Year</th><th>Headcount</th><th className="text-right">Revenue/HC</th><th className="text-right">Target</th></tr></thead>
                    <tbody>
                        {list.map(c => (
                            <tr key={c.year}>
                                <td>{c.year}</td>
                                <td>{c.headcount}</td>
                                <td className="text-right tabular-nums">{baht(c.revenue_per_headcount)}</td>
                                <td className="text-right tabular-nums font-semibold">{baht(Number(c.headcount) * Number(c.revenue_per_headcount))}</td>
                            </tr>
                        ))}
                        {list.length === 0 && <tr><td colSpan={4} className="text-center text-slate-400 py-6">No configurations.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
