import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';

export default function BookingConfig() {
    const [form, setForm] = useState({ max_bookings_per_day: 6, extra_bookings_per_day: 3 });
    const [loading, setLoading] = useState(true);

    async function load() {
        setLoading(true);
        try {
            const res = await api.get('/office-bookings/config');
            setForm({
                max_bookings_per_day: res.data.max_bookings_per_day ?? 6,
                extra_bookings_per_day: res.data.extra_bookings_per_day ?? 3
            });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load booking config');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, []);

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
        </div>
    );
}
