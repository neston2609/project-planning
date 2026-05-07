import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

export default function SmtpPage() {
    const [f, setF] = useState({ host: 'smtp.gmail.com', port: 587, secure: false, username: '', password: '', from_email: '', from_name: 'RPA Planning' });

    async function load() {
        const r = await api.get('/admin/smtp');
        setF({ ...f, ...r.data });
    }
    useEffect(() => { load(); }, []);

    async function save() {
        try {
            // If password is left as masked, backend keeps existing.
            await api.put('/admin/smtp', f);
            toast.success('SMTP saved');
            load();
        } catch { toast.error('Save failed'); }
    }

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold">SMTP Configuration</h1>
            <div className="card p-4 max-w-2xl grid grid-cols-2 gap-3">
                <div className="col-span-2 text-sm text-slate-500">
                    For Gmail: enable 2FA and use an App Password. Host: <code>smtp.gmail.com</code>, Port 465 (secure) or 587 (STARTTLS).
                </div>
                <div><label className="label">Host</label><input className="input" value={f.host} onChange={e => setF({ ...f, host: e.target.value })} /></div>
                <div><label className="label">Port</label><input type="number" className="input" value={f.port} onChange={e => setF({ ...f, port: Number(e.target.value) })} /></div>
                <div><label className="label">Username</label><input className="input" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} /></div>
                <div><label className="label">Password</label><input type="password" className="input" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} placeholder="(unchanged if blank/********)" /></div>
                <div><label className="label">From Email</label><input className="input" value={f.from_email} onChange={e => setF({ ...f, from_email: e.target.value })} /></div>
                <div><label className="label">From Name</label><input className="input" value={f.from_name} onChange={e => setF({ ...f, from_name: e.target.value })} /></div>
                <div className="col-span-2 flex items-center gap-2">
                    <input id="secure" type="checkbox" checked={f.secure} onChange={e => setF({ ...f, secure: e.target.checked })} />
                    <label htmlFor="secure" className="text-sm">Use TLS (secure)</label>
                </div>
                <div className="col-span-2"><button className="btn-primary" onClick={save}>Save</button></div>
            </div>
        </div>
    );
}
