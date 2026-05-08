import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../auth';

export default function SmtpPage() {
    const { user } = useAuth();
    const [f, setF] = useState({ host: 'smtp.gmail.com', port: 587, secure: false, username: '', password: '', from_email: '', from_name: 'RPA Planning' });
    const [testEmail, setTestEmail] = useState('');
    const [testing, setTesting]     = useState(false);
    const [saving, setSaving]       = useState(false);

    async function load() {
        const r = await api.get('/admin/smtp');
        setF((cur) => ({ ...cur, ...r.data }));
    }
    useEffect(() => { load(); }, []);

    // Default test recipient → from_email (when known) or the logged-in user
    useEffect(() => {
        if (testEmail) return;
        if (f.from_email) setTestEmail(f.from_email);
        else if (user?.email) setTestEmail(user.email);
    }, [f.from_email, user?.email]);

    async function save() {
        setSaving(true);
        try {
            await api.put('/admin/smtp', f);
            toast.success('SMTP saved');
            load();
        } catch { toast.error('Save failed'); }
        finally { setSaving(false); }
    }

    async function sendTest() {
        if (!testEmail) return toast.error('Enter a recipient email');
        setTesting(true);
        // Use a longer-running toast id we can update from result
        const tid = toast.loading('Sending test email…');
        try {
            await api.post('/admin/smtp/test', { recipient: testEmail });
            toast.success(`Test email sent to ${testEmail}`, { id: tid });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Test failed', { id: tid, duration: 8000 });
        } finally {
            setTesting(false);
        }
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
                <div className="col-span-2"><button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button></div>
            </div>

            {/* ---------- Test panel ---------- */}
            <div className="card p-4 max-w-2xl space-y-3">
                <div>
                    <h2 className="text-base font-bold text-slate-800">Test SMTP</h2>
                    <p className="text-xs text-slate-500 mt-1">
                        Sends a real test email using the <span className="font-semibold">currently saved</span> SMTP settings.
                        Save first if you just changed any values above.
                    </p>
                </div>
                <div>
                    <label className="label">Send test email to</label>
                    <div className="flex gap-2">
                        <input type="email" className="input flex-1"
                               placeholder="recipient@example.com"
                               value={testEmail} onChange={e => setTestEmail(e.target.value)} />
                        <button type="button" className="btn-primary" disabled={testing} onClick={sendTest}>
                            <PaperAirplaneIcon className="w-4 h-4" />
                            {testing ? 'Sending...' : 'Send Test'}
                        </button>
                    </div>
                </div>
                <div className="text-xs text-slate-500">
                    Tip: errors here usually mean either the host/port is wrong, the password is missing/expired,
                    or your network blocks outbound port 465/587.
                </div>
            </div>
        </div>
    );
}
