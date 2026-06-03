import { useEffect, useMemo, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

const PAGE_SIZES = [20, 50, 100, 200];

export default function LoginLogsPage() {
    const [list, setList] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [search, setSearch] = useState('');
    const [date, setDate] = useState('');
    const [status, setStatus] = useState('');
    const [retentionDays, setRetentionDays] = useState(14);
    const [loading, setLoading] = useState(true);

    async function load(nextPage = page) {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(nextPage),
                page_size: String(pageSize)
            });
            if (search.trim()) params.set('search', search.trim());
            if (date) params.set('date', date);
            if (status) params.set('status', status);
            const res = await api.get(`/admin/login-logs?${params.toString()}`);
            setList(res.data.rows || []);
            setTotal(Number(res.data.total || 0));
            setPage(Number(res.data.page || nextPage));
            setRetentionDays(Number(res.data.retention_days || 14));
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load login logs');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(1); }, [pageSize, status]);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

    function submitSearch(e) {
        e.preventDefault();
        load(1);
    }

    function changePage(next) {
        const safe = Math.max(1, Math.min(totalPages, next));
        load(safe);
    }

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-bold">Login Logs</h1>
                <p className="text-sm text-slate-500 mt-1">Retention: {retentionDays} day(s). Configure in App Config.</p>
            </div>

            <form className="card p-3 flex flex-wrap items-end gap-3" onSubmit={submitSearch}>
                <div className="flex-1 min-w-[240px]">
                    <label className="label">Search</label>
                    <div className="flex items-center gap-2">
                        <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
                        <input className="input" placeholder="Username, status, or date YYYY-MM-DD"
                               value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                </div>
                <div>
                    <label className="label">Date</label>
                    <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div>
                    <label className="label">Status</label>
                    <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                        <option value="">All</option>
                        <option value="Success">Success</option>
                        <option value="Failed">Failed</option>
                    </select>
                </div>
                <div>
                    <label className="label">Rows</label>
                    <select className="input" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>
                <button className="btn-primary" type="submit">Search</button>
            </form>

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead><tr><th>Date / Time</th><th>Username</th><th>IP</th><th>Status</th><th>User Agent</th></tr></thead>
                    <tbody>
                        {loading && <tr><td colSpan={5} className="text-center text-slate-400 py-6">Loading...</td></tr>}
                        {!loading && list.map(r => (
                            <tr key={r.id}>
                                <td className="text-xs whitespace-nowrap">{new Date(r.login_at).toLocaleString()}</td>
                                <td>{r.username}</td>
                                <td className="font-mono text-xs">{r.ip_address}</td>
                                <td>{r.status === 'Success'
                                    ? <span className="pill bg-emerald-100 text-emerald-700">Success</span>
                                    : <span className="pill bg-red-100 text-red-700">Failed</span>}</td>
                                <td className="max-w-[400px] truncate text-xs text-slate-500" title={r.user_agent}>{r.user_agent}</td>
                            </tr>
                        ))}
                        {!loading && list.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-6">No login logs.</td></tr>}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500">Page {page} of {totalPages} · {total} record(s)</span>
                <button className="btn-ghost ml-auto" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button>
                <button className="btn-ghost" disabled={page >= totalPages} onClick={() => changePage(page + 1)}>Next</button>
            </div>
        </div>
    );
}
