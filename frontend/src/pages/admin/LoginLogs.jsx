import { useEffect, useState } from 'react';
import api from '../../api';

export default function LoginLogsPage() {
    const [list, setList] = useState([]);
    useEffect(() => { api.get('/admin/login-logs?limit=500').then(r => setList(r.data)); }, []);
    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold">Login Logs</h1>
            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr><th>Date / Time</th><th>Username</th><th>IP</th><th>Status</th><th>User Agent</th></tr></thead>
                    <tbody>
                        {list.map(r => (
                            <tr key={r.id}>
                                <td className="text-xs">{new Date(r.login_at).toLocaleString()}</td>
                                <td>{r.username}</td>
                                <td className="font-mono text-xs">{r.ip_address}</td>
                                <td>{r.status === 'Success'
                                    ? <span className="pill bg-emerald-100 text-emerald-700">Success</span>
                                    : <span className="pill bg-red-100 text-red-700">Failed</span>}</td>
                                <td className="max-w-[400px] truncate text-xs text-slate-500" title={r.user_agent}>{r.user_agent}</td>
                            </tr>
                        ))}
                        {list.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-6">No login logs.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
