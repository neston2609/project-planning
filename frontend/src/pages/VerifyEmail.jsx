import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api';
import { CheckCircleIcon, XCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function VerifyEmail() {
    const [params] = useSearchParams();
    const token = params.get('token');
    const [state, setState] = useState({ status: 'pending', message: 'Verifying your email…' });

    useEffect(() => {
        if (!token) {
            setState({ status: 'error', message: 'Missing token' });
            return;
        }
        api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
            .then(r => setState({ status: 'success', message: r.data.message || 'Account activated.', username: r.data.username }))
            .catch(err => setState({ status: 'error', message: err.response?.data?.error || 'Verification failed' }));
    }, [token]);

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30 blur-3xl"
                 style={{ backgroundImage: 'linear-gradient(135deg, #6366f1, #ec4899)' }} />
            <div className="card p-7 w-full max-w-md text-center space-y-4 relative">
                {state.status === 'pending' && (
                    <>
                        <ArrowPathIcon className="w-12 h-12 mx-auto text-indigo-500 animate-spin" />
                        <p className="text-slate-600">{state.message}</p>
                    </>
                )}
                {state.status === 'success' && (
                    <>
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-500/30 mx-auto"
                             style={{ backgroundImage: 'linear-gradient(135deg, #10b981, #14b8a6)' }}>
                            <CheckCircleIcon className="w-8 h-8" />
                        </div>
                        <h1 className="text-xl font-bold text-slate-800">Email confirmed!</h1>
                        <p className="text-sm text-slate-600">{state.message}</p>
                        {state.username && <p className="text-xs text-slate-400">Username: <code>{state.username}</code></p>}
                        <Link to="/login" className="btn-primary w-full justify-center">Go to login</Link>
                    </>
                )}
                {state.status === 'error' && (
                    <>
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-red-500/30 mx-auto"
                             style={{ backgroundImage: 'linear-gradient(135deg, #f87171, #ef4444)' }}>
                            <XCircleIcon className="w-8 h-8" />
                        </div>
                        <h1 className="text-xl font-bold text-slate-800">Verification failed</h1>
                        <p className="text-sm text-slate-600">{state.message}</p>
                        <Link to="/register" className="btn-ghost">Register again</Link>
                        <Link to="/login" className="btn-primary w-full justify-center">Back to login</Link>
                    </>
                )}
            </div>
        </div>
    );
}
