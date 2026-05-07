import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../auth';
import toast from 'react-hot-toast';

export default function ChangePassword() {
    const { user, setUser } = useAuth();
    const nav = useNavigate();
    const [cur, setCur] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);

    if (!user) {
        return <p className="text-slate-600">Please log in first.</p>;
    }

    async function submit(e) {
        e.preventDefault();
        if (next !== confirm) return toast.error("Passwords don't match");
        if (next.length < 8) return toast.error('New password must be at least 8 characters');
        setBusy(true);
        try {
            await api.post('/auth/change-password', { current_password: cur, new_password: next });
            toast.success('Password updated');
            setUser({ ...user, must_change_password: false });
            localStorage.setItem('rpa_user', JSON.stringify({ ...user, must_change_password: false }));
            nav('/');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to update password');
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="card p-6 max-w-md mx-auto space-y-4">
            <h2 className="text-lg font-semibold">Change Password</h2>
            {user.must_change_password && (
                <p className="text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded p-2">
                    You must change the default password before continuing.
                </p>
            )}
            <div>
                <label className="label">Current password</label>
                <input type="password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} required />
            </div>
            <div>
                <label className="label">New password</label>
                <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} required />
            </div>
            <div>
                <label className="label">Confirm new password</label>
                <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            <button className="btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Update password'}</button>
        </form>
    );
}
