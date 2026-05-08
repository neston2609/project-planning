import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import toast from 'react-hot-toast';
import { ChartPieIcon, EnvelopeIcon } from '@heroicons/react/24/outline';

const ALLOWED_DOMAIN = '@mfec.co.th';

export default function Register() {
    const nav = useNavigate();
    const [f, setF] = useState({ username: '', password: '', confirm: '', email: '', full_name: '', phone_number: '' });
    const [busy, setBusy]   = useState(false);
    const [done, setDone]   = useState(null); // success message after registration

    function update(k) { return e => setF(s => ({ ...s, [k]: e.target.value })); }

    async function submit(e) {
        e.preventDefault();
        if (!f.email.toLowerCase().endsWith(ALLOWED_DOMAIN))
            return toast.error(`Only ${ALLOWED_DOMAIN} email addresses can register`);
        if (f.password.length < 8)
            return toast.error('Password must be at least 8 characters');
        if (f.password !== f.confirm)
            return toast.error("Passwords don't match");
        setBusy(true);
        try {
            const r = await api.post('/auth/register', {
                username: f.username, password: f.password, email: f.email,
                full_name: f.full_name, phone_number: f.phone_number
            });
            setDone(r.data.message || `Confirmation email sent to ${f.email}.`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Registration failed');
        } finally { setBusy(false); }
    }

    if (done) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
                <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30 blur-3xl"
                     style={{ backgroundImage: 'linear-gradient(135deg, #6366f1, #ec4899)' }} />
                <div className="card p-7 w-full max-w-md text-center space-y-4 relative">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-500/30 mx-auto"
                         style={{ backgroundImage: 'linear-gradient(135deg, #10b981, #14b8a6)' }}>
                        <EnvelopeIcon className="w-8 h-8" />
                    </div>
                    <h1 className="text-xl font-bold text-slate-800">Check your inbox</h1>
                    <p className="text-sm text-slate-600">{done}</p>
                    <p className="text-xs text-slate-400">The link expires in 24 hours. Don't forget the spam folder.</p>
                    <button className="btn-primary w-full justify-center" onClick={() => nav('/login')}>
                        Back to login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30 blur-3xl"
                 style={{ backgroundImage: 'linear-gradient(135deg, #6366f1, #ec4899)' }} />
            <div className="absolute -bottom-40 -right-40 w-[28rem] h-[28rem] rounded-full opacity-25 blur-3xl"
                 style={{ backgroundImage: 'linear-gradient(135deg, #10b981, #14b8a6)' }} />

            <form onSubmit={submit} className="card p-7 w-full max-w-md space-y-4 relative">
                <div className="flex flex-col items-center text-center">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-500/40 mb-3"
                         style={{ backgroundImage: 'var(--grad-brand)' }}>
                        <ChartPieIcon className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl brand-mark">Create Account</h1>
                    <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">Self-Registration</p>
                </div>

                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    Only <span className="font-bold">{ALLOWED_DOMAIN}</span> email addresses can register.
                    You'll receive a confirmation email; click the link inside to activate your account.
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><label className="label">Email</label>
                        <input type="email" className="input" required value={f.email} onChange={update('email')}
                               placeholder={`name${ALLOWED_DOMAIN}`} /></div>
                    <div><label className="label">Username</label>
                        <input className="input" required minLength={3} value={f.username} onChange={update('username')} /></div>
                    <div><label className="label">Phone</label>
                        <input className="input" value={f.phone_number} onChange={update('phone_number')} /></div>
                    <div className="col-span-2"><label className="label">Full Name</label>
                        <input className="input" value={f.full_name} onChange={update('full_name')} /></div>
                    <div><label className="label">Password</label>
                        <input type="password" className="input" required minLength={8}
                               value={f.password} onChange={update('password')} /></div>
                    <div><label className="label">Confirm Password</label>
                        <input type="password" className="input" required minLength={8}
                               value={f.confirm} onChange={update('confirm')} /></div>
                </div>

                <button className="btn-primary w-full justify-center" disabled={busy}>
                    {busy ? 'Sending confirmation...' : 'Register'}
                </button>
                <div className="text-center text-xs text-slate-500">
                    <Link to="/login" className="hover:text-indigo-600 transition-colors">← Already have an account? Login</Link>
                </div>
            </form>
        </div>
    );
}
