import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import api from '../api';
import { useAuth } from '../auth';
import { CalendarDaysIcon, ClipboardDocumentListIcon, InformationCircleIcon, TrashIcon } from '@heroicons/react/24/outline';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BOOKABLE_WEEKDAYS = [
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' }
];

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

function bookingDayLabel(isoDate) {
    const d = new Date(`${isoDate}T00:00:00`);
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
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
    const [holidays, setHolidays] = useState([]);
    const [config, setConfig] = useState({ max_bookings_per_day: 6, extra_bookings_per_day: 3 });
    const [today, setToday] = useState(dateISO(new Date()));
    const [loading, setLoading] = useState(true);
    const [fullModal, setFullModal] = useState(null);
    const [summary, setSummary] = useState(null);
    const [bulkWeekdays, setBulkWeekdays] = useState([]);

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

    const holidaysByDate = useMemo(() => {
        const map = new Map();
        for (const h of holidays) map.set(h.holiday_date, h);
        return map;
    }, [holidays]);

    const myBookings = useMemo(() => {
        return bookings
            .filter(b => Number(b.user_id) === Number(user.id))
            .sort((a, b) => a.booking_date.localeCompare(b.booking_date));
    }, [bookings, user.id]);

    const bulkTargetCount = useMemo(() => {
        const selected = new Set(bulkWeekdays);
        let n = 0;
        const cur = new Date(`${range.start}T00:00:00`);
        const last = new Date(`${range.end}T00:00:00`);
        while (cur <= last) {
            const iso = dateISO(cur);
            if (iso >= today && selected.has(cur.getDay())) n += 1;
            cur.setDate(cur.getDate() + 1);
        }
        return n;
    }, [bulkWeekdays, range.start, range.end, today]);

    async function load() {
        setLoading(true);
        try {
            const res = await api.get(`/office-bookings?start=${range.start}&end=${range.end}`);
            setBookings(res.data.bookings || []);
            setHolidays(res.data.holidays || []);
            setConfig(res.data.config || { max_bookings_per_day: 6, extra_bookings_per_day: 3 });
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
            await deleteBooking(mine);
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

    async function deleteBooking(booking) {
        if (booking.booking_date < today) return toast.error('Cannot delete a past booking');
        if (!confirm(`Delete office booking on ${booking.booking_date}?`)) return;
        try {
            await api.delete(`/office-bookings/${booking.id}`);
            toast.success('Booking deleted');
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Delete failed');
        }
    }

    function toggleBulkWeekday(day) {
        setBulkWeekdays(prev => prev.includes(day) ? prev.filter(v => v !== day) : [...prev, day].sort());
    }

    async function bookWeekdays() {
        if (bulkWeekdays.length === 0) return toast.error('Please select weekdays');
        if (bulkTargetCount === 0) return toast.error('No available future dates in the displayed months');
        const labels = BOOKABLE_WEEKDAYS.filter(d => bulkWeekdays.includes(d.value)).map(d => d.label).join(', ');
        if (!confirm(`Book every ${labels} from ${range.start} to ${range.end}?`)) return;
        try {
            const res = await api.post('/office-bookings/bulk', {
                start: range.start,
                end: range.end,
                weekdays: bulkWeekdays
            });
            const created = Number(res.data.created_count || 0);
            const skipped = Number(res.data.skipped_count || 0);
            toast.success(`Booked ${created} day(s)${skipped ? `, skipped ${skipped}` : ''}`);
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Weekday booking failed');
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
            </div>

            <div className="card p-4">
                <div className="flex items-start gap-3">
                    <InformationCircleIcon className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
                    <div className="space-y-2">
                        <h2 className="font-bold text-slate-900">วิธีใช้งาน Office Booking</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm text-slate-600">
                            <p>1. เลือกวันที่บน Calendar เพื่อจองเข้า Office ถ้าวันนั้นยังไม่เต็มระบบจะบันทึกให้ทันที</p>
                            <p>2. ถ้าต้องการยกเลิก ให้กดวันที่ตัวเองจองไว้ หรือกดปุ่มลบในตาราง My Office Bookings</p>
                            <p>3. ถ้าวันที่เลือกเต็มแล้ว ระบบจะแสดงรายชื่อผู้จอง และสามารถขอจองกรณีพิเศษพร้อมระบุเหตุผลได้</p>
                            <p>4. ใช้ Book by Weekday เพื่อเลือก จ.-ศ. แล้วจองซ้ำทุกวันนั้นในเดือนปัจจุบันและเดือนถัดไป</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {months.map(m => (
                    <MonthCalendar key={monthKey(m)}
                                   month={m}
                                   today={today}
                                   userId={user.id}
                                   bookingsByDate={byDate}
                                   holidaysByDate={holidaysByDate}
                                   config={config}
                                   loading={loading}
                                   onDayClick={onDayClick}
                                   onSummary={() => openSummary(m)} />
                ))}
            </div>

            <MyBookingsTable bookings={myBookings}
                             today={today}
                             onDelete={deleteBooking} />

            <WeekdayBookingPanel selected={bulkWeekdays}
                                 targetCount={bulkTargetCount}
                                 onToggle={toggleBulkWeekday}
                                 onBook={bookWeekdays} />

            {fullModal && <FullBookingModal initial={fullModal} config={config}
                                            onClose={() => setFullModal(null)}
                                            onSubmit={requestExtra} />}
            {summary && <SummaryModal summary={summary} onClose={() => setSummary(null)} />}
        </div>
    );
}

function MonthCalendar({ month, today, userId, bookingsByDate, holidaysByDate, config, loading, onDayClick, onSummary }) {
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
                    const holiday = holidaysByDate.get(date);
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
                                            ${isFull && !mine ? 'bg-amber-50/70' : ''}
                                            ${holiday ? 'bg-rose-50/80 border-rose-200 hover:bg-rose-100/80' : ''}`}
                                title={holiday ? holiday.name : undefined}
                                onClick={() => onDayClick(day)}>
                            <div className="flex items-start justify-between gap-1">
                                <span className="font-bold text-sm">{day.getDate()}</span>
                                <span className={`text-[10px] rounded-full px-2 py-0.5 ${isFull ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {normal}/{config.max_bookings_per_day}
                                </span>
                            </div>
                            {holiday && (
                                <div className="mt-1 rounded bg-rose-100 px-2 py-1 text-[10px] font-semibold text-rose-700" title={holiday.name}>
                                    {holiday.name}
                                </div>
                            )}
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

function WeekdayBookingPanel({ selected, targetCount, onToggle, onBook }) {
    return (
        <div className="card p-4 space-y-3">
            <div>
                <h2 className="text-lg font-bold">Book by Weekday</h2>
            </div>
            <div className="flex flex-wrap gap-2">
                {BOOKABLE_WEEKDAYS.map(day => (
                    <button key={day.value}
                            className={`px-4 py-2 rounded-lg border text-sm font-semibold transition
                                        ${selected.includes(day.value)
                                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                            onClick={() => onToggle(day.value)}>
                        {day.label}
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-slate-500">{targetCount} future date(s) match the selected weekdays.</span>
                <button className="btn-primary" disabled={selected.length === 0 || targetCount === 0} onClick={onBook}>
                    <CalendarDaysIcon className="w-4 h-4" /> Confirm Weekday Booking
                </button>
            </div>
        </div>
    );
}

function MyBookingsTable({ bookings, today, onDelete }) {
    return (
        <div className="card overflow-x-auto">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
                <h2 className="text-lg font-bold">My Office Bookings</h2>
                <span className="text-sm text-slate-500">{bookings.length} booking(s)</span>
            </div>
            <table className="table-clean">
                <thead>
                    <tr><th>Date</th><th>Month</th><th></th></tr>
                </thead>
                <tbody>
                    {bookings.map(b => {
                        const d = new Date(`${b.booking_date}T00:00:00`);
                        const isPast = b.booking_date < today;
                        return (
                            <tr key={b.id}>
                                <td className="font-mono text-sm">{b.booking_date}</td>
                                <td>{monthLabel(monthStart(d))}</td>
                                <td className="text-right">
                                    <button className="btn-ghost" disabled={isPast}
                                            title={isPast ? 'Past bookings cannot be deleted' : 'Delete booking'}
                                            onClick={() => onDelete(b)}>
                                        <TrashIcon className={`w-4 h-4 ${isPast ? 'text-slate-300' : 'text-red-500'}`} />
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                    {bookings.length === 0 && (
                        <tr><td colSpan={3} className="text-center text-slate-400 py-8">No office bookings in the displayed months.</td></tr>
                    )}
                </tbody>
            </table>
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
                        <tr><th>Resource</th><th>Username</th><th>Booked Dates</th><th className="text-right">Days</th></tr>
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
                                                  className="rounded-full px-2 py-1 text-xs bg-blue-100 text-blue-800">
                                                {bookingDayLabel(d.booking_date)}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="text-right font-bold">{p.total_days}</td>
                            </tr>
                        ))}
                        {(!summary.people || summary.people.length === 0) && (
                            <tr><td colSpan={4} className="text-center text-slate-400 py-8">No bookings in this month.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Modal>
    );
}
