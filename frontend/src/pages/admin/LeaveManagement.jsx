import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
    CalendarDaysIcon,
    PencilSquareIcon,
    PlusIcon,
    TrashIcon,
    UserGroupIcon
} from '@heroicons/react/24/outline';
import api from '../../api';
import Modal from '../../components/Modal';

function pad(value) {
    return String(value).padStart(2, '0');
}

function localDateISO(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function monthBounds(month) {
    const [year, monthNumber] = month.split('-').map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    return {
        start: `${month}-01`,
        end: `${month}-${pad(lastDay)}`
    };
}

export default function LeaveManagement() {
    const [month, setMonth] = useState(currentMonthKey());
    const [leaves, setLeaves] = useState([]);
    const [users, setUsers] = useState([]);
    const [edit, setEdit] = useState(null);
    const [loading, setLoading] = useState(true);

    const bounds = useMemo(() => monthBounds(month), [month]);

    async function load() {
        setLoading(true);
        try {
            const [leaveRes, userRes] = await Promise.all([
                api.get(`/office-bookings/leaves?start=${bounds.start}&end=${bounds.end}`),
                api.get('/office-bookings/leaves/users')
            ]);
            setLeaves(leaveRes.data || []);
            setUsers(userRes.data || []);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load leave records');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, [bounds.start, bounds.end]);

    function addLeave() {
        if (users.length === 0) return toast.error('No active team members are available');
        setEdit({ user_id: users[0].id, leave_date: localDateISO() });
    }

    async function save(form) {
        const userId = Number(form.user_id);
        const leaveDate = String(form.leave_date || '').trim();
        if (!userId) return toast.error('Please select a team member');
        if (!leaveDate) return toast.error('Please select a leave date');

        try {
            if (form.id) {
                await api.put(`/office-bookings/leaves/${form.id}`, {
                    user_id: userId,
                    leave_date: leaveDate
                });
            } else {
                await api.post('/office-bookings/leaves', {
                    user_id: userId,
                    leave_date: leaveDate
                });
            }
            toast.success(form.id ? 'Leave record updated' : 'Leave record added');
            setEdit(null);
            const targetMonth = leaveDate.slice(0, 7);
            if (targetMonth !== month) setMonth(targetMonth);
            else load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not save leave record');
        }
    }

    async function remove(leave) {
        if (!confirm(`Delete leave for ${leave.display_name} on ${leave.leave_date}?`)) return;
        try {
            await api.delete(`/office-bookings/leaves/${leave.id}`);
            setLeaves(current => current.filter(row => row.id !== leave.id));
            toast.success('Leave record deleted');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not delete leave record');
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <UserGroupIcon className="w-7 h-7 text-rose-600" /> Leave Management
                    </h1>
                    <p className="text-sm text-slate-500">Manage team leave dates shown on the Office Booking calendar.</p>
                </div>
                <button className="btn-primary ml-auto" onClick={addLeave} disabled={loading || users.length === 0}>
                    <PlusIcon className="w-4 h-4" /> Add Leave
                </button>
            </div>

            <div className="card p-4">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="label">Displayed Month</label>
                        <input className="input !w-48" type="month" value={month}
                               onChange={event => setMonth(event.target.value || currentMonthKey())} />
                    </div>
                    <div className="pb-2 text-sm text-slate-500">
                        {loading ? 'Loading...' : `${leaves.length} leave record(s)`}
                    </div>
                </div>
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead>
                        <tr><th>Leave Date</th><th>Team Member</th><th>Username</th><th>Email</th><th></th></tr>
                    </thead>
                    <tbody>
                        {leaves.map(leave => (
                            <tr key={leave.id}>
                                <td>
                                    <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-800">
                                        <CalendarDaysIcon className="w-4 h-4" /> {leave.leave_date}
                                    </span>
                                </td>
                                <td className="font-semibold">{leave.display_name}</td>
                                <td>{leave.username}</td>
                                <td>{leave.email || '—'}</td>
                                <td className="text-right whitespace-nowrap">
                                    <button className="btn-ghost" title="Edit leave"
                                            onClick={() => setEdit({ ...leave })}>
                                        <PencilSquareIcon className="w-4 h-4" />
                                    </button>
                                    <button className="btn-ghost ml-1" title="Delete leave"
                                            onClick={() => remove(leave)}>
                                        <TrashIcon className="w-4 h-4 text-red-500" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {!loading && leaves.length === 0 && (
                            <tr><td colSpan={5} className="text-center text-slate-400 py-8">No leave records in this month.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {edit && (
                <LeaveForm initial={edit} users={users} onClose={() => setEdit(null)} onSave={save} />
            )}
        </div>
    );
}

function LeaveForm({ initial, users, onClose, onSave }) {
    const [form, setForm] = useState({ ...initial });
    const title = form.id ? 'Edit Leave' : 'Add Leave';
    return (
        <Modal open onClose={onClose} title={title}
               footer={<>
                   <button className="btn-ghost" onClick={onClose}>Cancel</button>
                   <button className="btn-primary" onClick={() => onSave(form)}>Save</button>
               </>}>
            <div className="space-y-4">
                <div>
                    <label className="label">Team Member</label>
                    <select className="input" value={form.user_id || ''}
                            onChange={event => setForm({ ...form, user_id: event.target.value })}>
                        <option value="">Select team member</option>
                        {users.map(user => (
                            <option key={user.id} value={user.id}>
                                {user.display_name} ({user.username})
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="label">Leave Date</label>
                    <input className="input" type="date" value={form.leave_date || ''}
                           onChange={event => setForm({ ...form, leave_date: event.target.value })} />
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                    This person will appear as <strong>“Name (Leave)”</strong> in a rose-colored item on the Office Booking calendar.
                </div>
            </div>
        </Modal>
    );
}
