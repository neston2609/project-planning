import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../auth';
import toast from 'react-hot-toast';
import { ChartPieIcon } from '@heroicons/react/24/outline';

export default function Login() {
    const { login } = useAuth();
    const nav = useNavigate();
    const loc = useLocation();
    const [u, setU] = useState('');
    const [p, setP] = useState('');
    const [busy, setBusy] = useState(false);

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        try {
            const user = await login(u, p);
            toast.success(`Welcome, ${user.full_name || user.username}`);
            const to = user.must_change_password ? '/change-password' : (loc.state?.from || '/');
            nav(to, { replace: true });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Login failed');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Decorative blobs */}
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30 blur-3xl"
                 style={{ backgroundImage: 'linear-gradient(135deg, #6366f1, #ec4899)' }} />
            <div className="absolute -bottom-40 -right-40 w-[28rem] h-[28rem] rounded-full opacity-25 blur-3xl"
                 style={{ backgroundImage: 'linear-gradient(135deg, #10b981, #14b8a6)' }} />

            <form onSubmit={submit} className="card p-7 w-full max-w-sm space-y-5 relative">
                <div className="flex flex-col items-center text-center">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-500/40 mb-3"
                         style={{ backgroundImage: 'var(--grad-brand)' }}>
                        <ChartPieIcon className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl brand-mark">RPA Planning</h1>
                    <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">Admin Login</p>
                </div>
                <div>
                    <label className="label">Username</label>
                    <input className="input" value={u} onChange={(e) => setU(e.target.value)} autoFocus required />
                </div>
                <div>
                    <label className="label">Password</label>
                    <input type="password" className="input" value={p} onChange={(e) => setP(e.target.value)} required />
                </div>
                <button className="btn-primary w-full justify-center" disabled={busy}>
                    {busy ? 'Signing in...' : 'Sign in'}
                </button>
                <div className="text-center text-xs text-slate-500 pt-1 border-t border-slate-100">
                    <span>Don't have an account? </span>
                    <Link to="/register" className="font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
                        Register
                    </Link>
                </div>
            </form>
        </div>
    );
}
