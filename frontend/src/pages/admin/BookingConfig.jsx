import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api';
import { useYear } from '../../YearContext';
import { CalendarDaysIcon, Cog6ToothIcon, TrashIcon } from '@heroicons/react/24/outline';

export default function BookingConfig() {
    const { year } = useYear();
    const [form, setForm] = useState({ max_bookings_per_day: 6, extra_bookings_per_day: 3 });
    const [holidays, setHolidays] = useState([]);
    const [holidayForm, setHolidayForm] = useState({ holiday_date: '', name: '' });
    const [loading, setLoading] = useState(true);

    async function load() {
        setLoading(true);
        try {
            const [configRes, holidayRes] = await Promise.all([
                api.get('/office-bookings/config'),
                api.get(`/office-bookings/holidays?year=${year}`)
            ]);
            setForm({
                max_bookings_per_day: configRes.data.max_bookings_per_day ?? 6,
                extra_bookings_per_day: configRes.data.extra_bookings_per_day ?? 3
            });
            setHolidays(holidayRes.data || []);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load booking config');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, [year]);

    async function save() {
        const max = Number(form.max_bookings_per_day);
        const extra = Number(form.extra_bookings_per_day);
        if (!Number.isInteger(max) || max < 0 || !Number.isInteger(extra) || extra < 0) {
            return toast.error('Capacity must be non-negative whole numbers');
        }
        try {
            const res = await api.put('/office-bookings/config', {
                max_bookings_per_day: max,
                extra_bookings_per_day: extra
            });
            setForm(res.data);
            toast.success('Booking config saved');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        }
    }

    async function saveHoliday() {
        const date = String(holidayForm.holiday_date || '').trim();
        const name = String(holidayForm.name || '').trim();
        if (!date) return toast.error('Please select a holiday date');
        if (!date.startsWith(`${year}-`)) return toast.error(`Holiday date must be in ${year}`);
        if (!name) return toast.error('Please enter holiday name');
        try {
            await api.post('/office-bookings/holidays', { holiday_date: date, name });
            setHolidayForm({ holiday_date: '', name: '' });
            toast.success('Holiday saved');
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Holiday save failed');
        }
    }

    async function deleteHoliday(holiday) {
        if (!confirm(`Delete holiday ${holiday.holiday_date} - ${holiday.name}?`)) return;
        try {
            await api.delete(`/office-bookings/holidays/${holiday.id}`);
            toast.success('Holiday deleted');
            setHolidays(prev => prev.filter(h => h.id !== holiday.id));
        } catch (err) {
            toast.error(err.response?.data?.error || 'Delete failed');
        }
    }

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Cog6ToothIcon className="w-7 h-7 text-blue-600" /> Booking Config
                </h1>
            </div>

            <div className="card p-4 max-w-md space-y-4">
                <div>
                    <label className="label">Maximum Book</label>
                    <input className="input" type="number" min="0" disabled={loading}
                           value={form.max_bookings_per_day}
                           onChange={e => setForm({ ...form, max_bookings_per_day: e.target.value })} />
                </div>
                <div>
                    <label className="label">Extra Book</label>
                    <input className="input" type="number" min="0" disabled={loading}
                           value={form.extra_bookings_per_day}
                           onChange={e => setForm({ ...form, extra_bookings_per_day: e.target.value })} />
                </div>
                <button className="btn-primary" disabled={loading} onClick={save}>
                    <Cog6ToothIcon className="w-4 h-4" /> Save
                </button>
            </div>

            <div className="card p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <CalendarDaysIcon className="w-5 h-5 text-blue-600" /> Holidays in {year}
                    </h2>
                    <span className="text-sm text-slate-500">{holidays.length} day(s)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3 items-end">
                    <div>
                        <label className="label">Holiday Date</label>
                        <input className="input" type="date"
                               min={`${year}-01-01`}
                               max={`${year}-12-31`}
                               value={holidayForm.holiday_date}
                               onChange={e => setHolidayForm({ ...holidayForm, holiday_date: e.target.value })} />
                    </div>
                    <div>
                        <label className="label">Holiday Name</label>
                        <input className="input"
                               placeholder="e.g. New Year, Songkran, Company Holiday"
                               value={holidayForm.name}
                               onChange={e => setHolidayForm({ ...holidayForm, name: e.target.value })} />
                    </div>
                    <button className="btn-primary" onClick={saveHoliday} disabled={loading}>
                        <CalendarDaysIcon className="w-4 h-4" /> Add Holiday
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="table-clean">
                        <thead>
                            <tr><th>Date</th><th>Holiday</th><th></th></tr>
                        </thead>
                        <tbody>
                            {holidays.map(h => (
                                <tr key={h.id}>
                                    <td className="font-mono text-sm">{h.holiday_date}</td>
                                    <td>{h.name}</td>
                                    <td className="text-right">
                                        <button className="btn-ghost" onClick={() => deleteHoliday(h)}>
                                            <TrashIcon className="w-4 h-4 text-red-500" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {holidays.length === 0 && (
                                <tr><td colSpan={3} className="text-center text-slate-400 py-8">No holidays configured for {year}.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
