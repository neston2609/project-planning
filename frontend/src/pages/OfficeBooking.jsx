import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import api from '../api';
import { useAuth, isAdmin } from '../auth';
import { CalendarDaysIcon, Cog6ToothIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n) {
    return String(n).padStart(2, '0');
}

function dateISO(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function monthLabel(date) {
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function monthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, n) {
    return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function monthEnd(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function calendarDays(monthDate) {
    const start = monthStart(monthDate);
    const end = monthEnd(monthDate);
    const days = [];
    for (let i = 0; i < start.getDay(); i += 1) days.push(null);
    for (let d = 1; d <= end.getDate(); d += 1) {
        days.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), d));
    }
    while (days.length % 7 !== 0) days.push(null);
    return days;
}

export default function OfficeBooking() {
    const { user } = useAuth();
    const [bookings, setBookings] = useState([]);
    const [config, setConfig] = useState({ max_bookings_per_day: 6, extra_bookings_per_day: 3 });
    const [today, setToday] = useState(dateISO(new Date()));
    const [loading, setLoading] = useState(true);
    const [fullModal, setFullModal] = useState(null);
    const [summary, setSummary] = useState(null);
    const [configDraft, setConfigDraft] = useState({ max_bookings_per_day: 6, extra_bookings_per_day: 3 });

    const baseMonth = monthStart(new Date());
    const months = useMemo(() => [baseMonth, addMonths(baseMonth, 1)], []);
    const range = useMemo(() => ({
        start: dateISO(monthStart(months[0])),
        end: dateISO(monthEnd(months[1]))
    }), [months]);

    const byDate = useMemo(() => {
        const map = new Map();
        for (const b of bookings) {
            if (!map.has(b.booking_date)) map.set(b.booking_date, []);
            map.get(b.booking_date).push(b);
        }
        return map;
    }, [bookings]);

    async function load() {
        setLoading(true);
        try {
            const res = await api.get(`/office-bookings?start=${range.start}&end=${range.end}`);
            setBookings(res.data.bookings || []);
            setConfig(res.data.config || { max_bookings_per_day: 6, extra_bookings_per_day: 3 });
            setConfigDraft(res.data.config || { max_bookings_per_day: 6, extra_bookings_per_day: 3 });
            setToday(res.data.today || dateISO(new Date()));
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load office bookings');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, []);

    function dayCapacity(dayBookings) {
        const normal = dayBookings.filter(b => !b.is_extra).length;
        const extra = dayBookings.filter(b => b.is_extra).length;
        return {
            normal,
            extra,
            isFull: normal >= Number(config.max_bookings_per_day || 0),
            isExtraFull: extra >= Number(config.extra_bookings_per_day || 0)
        };
    }

    async function onDayClick(day) {
        if (!day) return;
        const date = dateISO(day);
        const dayBookings = byDate.get(date) || [];
        const mine = dayBookings.find(b => Number(b.user_id) === Number(user.id));
        if (mine) {
            if (date < today) return toast.error('Cannot delete a past booking');
            if (!confirm(`Delete office booking on ${date}?`)) return;
            try {
                await api.delete(`/office-bookings/${mine.id}`);
                toast.success('Booking deleted');
                load();
            } catch (err) {
                toast.error(err.response?.data?.error || 'Delete failed');
            }
            return;
        }
        if (date < today) return toast.error('Cannot book a past date');

        const cap = dayCapacity(dayBookings);
        if (cap.isFull) {
            setFullModal({ date, bookings: dayBookings, capacity: cap, reason: '' });
            return;
        }

        try {
            await api.post('/office-bookings', { booking_date: date });
            toast.success('Office booked');
            load();
        } catch (err) {
            if (err.response?.data?.code === 'FULL') {
                setFullModal({
                    date,
                    bookings: err.response.data.bookings || dayBookings,
                    capacity: err.response.data.capacity || cap,
                    reason: ''
                });
            } else {
                toast.error(err.response?.data?.error || 'Booking failed');
            }
        }
    }

    async function requestExtra(f) {
        if (!String(f.reason || '').trim()) return toast.error('Please enter a reason');
        try {
            await api.post('/office-bookings', { booking_date: f.date, reason: f.reason });
            toast.success('Extra booking saved');
            setFullModal(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Extra booking failed');
        }
    }

    async function saveConfig() {
        const max = Number(configDraft.max_bookings_per_day);
        const extra = Number(configDraft.extra_bookings_per_day);
        if (!Number.isInteger(max) || max < 0 || !Number.isInteger(extra) || extra < 0) {
            return toast.error('Capacity must be non-negative whole numbers');
        }
        try {
            const res = await api.put('/office-bookings/config', {
                max_bookings_per_day: max,
                extra_bookings_per_day: extra
            });
            setConfig(res.data);
            setConfigDraft(res.data);
            toast.success('Office booking capacity saved');
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        }
    }

    async function openSummary(monthDate) {
        const key = monthKey(monthDate);
        try {
            const res = await api.get(`/office-bookings/summary?month=${key}`);
            setSummary(res.data);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load booking summary');
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <CalendarDaysIcon className="w-7 h-7 text-blue-600" /> Office Booking
                    </h1>
                    <p className="text-sm text-slate-500">Book office days for this month and next month.</p>
                </div>
                {isAdmin(user) && (
                    <div className="ml-auto card p-3 flex flex-wrap items-end gap-2">
                        <div>
                            <label className="label">Maximum Book</label>
                            <input className="input w-28" type="number" min="0" value={configDraft.max_bookings_per_day}
                                   onChange={e => setConfigDraft({ ...configDraft, max_bookings_per_day: e.target.value })} />
                        </div>
                        <div>
                            <label className="label">Extra Book</label>
                            <input className="input w-28" type="number" min="0" value={configDraft.extra_bookings_per_day}
                                   onChange={e => setConfigDraft({ ...configDraft, extra_bookings_per_day: e.target.value })} />
                        </div>
                        <button className="btn-primary" onClick={saveConfig}>
                            <Cog6ToothIcon className="w-4 h-4" /> Save
                        </button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {months.map(m => (
                    <MonthCalendar key={monthKey(m)}
                                   month={m}
                                   today={today}
                                   userId={user.id}
                                   bookingsByDate={byDate}
                                   config={config}
                                   loading={loading}
                                   onDayClick={onDayClick}
                                   onSummary={() => openSummary(m)} />
                ))}
            </div>

            {fullModal && <FullBookingModal initial={fullModal} config={config}
                                            onClose={() => setFullModal(null)}
                                            onSubmit={requestExtra} />}
            {summary && <SummaryModal summary={summary} onClose={() => setSummary(null)} />}
        </div>
    );
}

function MonthCalendar({ month, today, userId, bookingsByDate, config, loading, onDayClick, onSummary }) {
    const days = calendarDays(month);
    return (
        <div className="card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
                <h2 className="text-lg font-bold">{monthLabel(month)}</h2>
                <button className="btn-ghost ml-auto" onClick={onSummary}>
                    <ClipboardDocumentListIcon className="w-4 h-4" /> Booking Summary
                </button>
            </div>
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                {WEEKDAYS.map(d => <div key={d} className="px-2 py-2 text-center text-xs font-bold text-slate-500">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
                {days.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} className="min-h-[120px] border-r border-b border-slate-100 bg-slate-50/60" />;
                    const date = dateISO(day);
                    const bookings = bookingsByDate.get(date) || [];
                    const normal = bookings.filter(b => !b.is_extra).length;
                    const extra = bookings.filter(b => b.is_extra).length;
                    const mine = bookings.some(b => Number(b.user_id) === Number(userId));
                    const isPast = date < today;
                    const isFull = normal >= Number(config.max_bookings_per_day || 0);
                    return (
                        <button key={date}
                                className={`min-h-[120px] border-r border-b border-slate-100 p-2 text-left align-top transition
                                            ${isPast ? 'bg-slate-50 text-slate-400' : 'hover:bg-blue-50'}
                                            ${mine ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/60' : ''}
                                            ${isFull && !mine ? 'bg-amber-50/70' : ''}`}
                                onClick={() => onDayClick(day)}>
                            <div className="flex items-start justify-between gap-1">
                                <span className="font-bold text-sm">{day.getDate()}</span>
                                <span className={`text-[10px] rounded-full px-2 py-0.5 ${isFull ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {normal}/{config.max_bookings_per_day}
                                </span>
                            </div>
                            {extra > 0 && <div className="mt-1 text-[10px] text-amber-700">Extra {extra}/{config.extra_bookings_per_day}</div>}
                            <div className="mt-2 space-y-1">
                                {loading && bookings.length === 0 && <div className="h-4 rounded bg-slate-100 animate-pulse" />}
                                {bookings.slice(0, 4).map(b => (
                                    <div key={b.id}
                                         className={`truncate rounded px-2 py-1 text-xs ${b.is_extra ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}
                                         title={b.display_name}>
                                        {b.display_name}{Number(b.user_id) === Number(userId) ? ' (You)' : ''}
                                    </div>
                                ))}
                                {bookings.length > 4 && <div className="text-xs text-slate-400">+{bookings.length - 4} more</div>}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function FullBookingModal({ initial, config, onClose, onSubmit }) {
    const [f, setF] = useState({ ...initial });
    const normalBookings = f.bookings.filter(b => !b.is_extra);
    const extraBookings = f.bookings.filter(b => b.is_extra);
    const extraAvailable = Math.max(0, Number(config.extra_bookings_per_day || 0) - extraBookings.length);
    return (
        <Modal open onClose={onClose} title={`Office booking full - ${f.date}`} size="lg"
               footer={<>
                   <button className="btn-ghost" onClick={onClose}>Cancel</button>
                   <button className="btn-primary" disabled={extraAvailable <= 0 || !String(f.reason || '').trim()}
                           onClick={() => onSubmit(f)}>
                       Request Extra Booking
                   </button>
               </>}>
            <div className="space-y-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="font-semibold text-amber-800">Maximum booking is full for this date.</div>
                    <div className="text-sm text-amber-700">
                        Maximum Book {normalBookings.length}/{config.max_bookings_per_day}
                        {' '}- Extra Book {extraBookings.length}/{config.extra_bookings_per_day}
                    </div>
                </div>
                <div>
                    <h3 className="font-bold mb-2">Booked Users</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {f.bookings.map(b => (
                            <div key={b.id} className={`rounded border px-3 py-2 text-sm ${b.is_extra ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                                <div className="font-semibold">{b.display_name}</div>
                                <div className="text-xs text-slate-500">{b.username}{b.is_extra ? ' - Extra' : ''}</div>
                                {b.reason && <div className="text-xs text-amber-700 mt-1">{b.reason}</div>}
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="label">Reason for Extra Booking</label>
                    <textarea className="input" rows={3} value={f.reason}
                              disabled={extraAvailable <= 0}
                              onChange={e => setF({ ...f, reason: e.target.value })} />
                    {extraAvailable <= 0 && (
                        <p className="text-xs text-red-500 mt-1">Extra booking capacity is also full.</p>
                    )}
                </div>
            </div>
        </Modal>
    );
}

function SummaryModal({ summary, onClose }) {
    return (
        <Modal open onClose={onClose} title={`Booking Summary - ${summary.month}`} size="xl"
               footer={<button className="btn-primary" onClick={onClose}>Close</button>}>
            <div className="overflow-x-auto">
                <table className="table-clean">
                    <thead>
                        <tr><th>Resource</th><th>Username</th><th>Booked Dates</th><th className="text-right">Days</th><th className="text-right">Extra</th></tr>
                    </thead>
                    <tbody>
                        {(summary.people || []).map(p => (
                            <tr key={p.key}>
                                <td className="font-semibold">{p.display_name}</td>
                                <td className="font-mono text-xs">{p.username}</td>
                                <td>
                                    <div className="flex flex-wrap gap-1">
                                        {p.days.map(d => (
                                            <span key={d.booking_id}
                                                  className={`rounded-full px-2 py-1 text-xs ${d.is_extra ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                                                {d.booking_date.slice(-2)}{d.is_extra ? ' extra' : ''}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="text-right font-bold">{p.total_days}</td>
                                <td className="text-right">{p.extra_days}</td>
                            </tr>
                        ))}
                        {(!summary.people || summary.people.length === 0) && (
                            <tr><td colSpan={5} className="text-center text-slate-400 py-8">No bookings in this month.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Modal>
    );
}
