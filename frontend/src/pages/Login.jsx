import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../auth';
import toast from 'react-hot-toast';

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
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
            <form onSubmit={submit} className="card p-6 w-full max-w-sm space-y-4">
                <div className="text-center">
                    <h1 className="text-xl font-bold text-brand-700">RPA Planning</h1>
                    <p className="text-sm text-slate-500">Admin login</p>
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
                <div className="text-center text-xs text-slate-400">
                    <Link to="/" className="hover:underline">Continue as Guest →</Link>
                </div>
            </form>
        </div>
    );
}
