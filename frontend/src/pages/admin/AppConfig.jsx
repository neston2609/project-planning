import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

export default function AppConfigPage() {
    const [defaultYear, setDefaultYear] = useState('');
    const [licenseDays, setLicenseDays] = useState('');
    const [loginRetentionDays, setLoginRetentionDays] = useState('14');
    const [footerText, setFooterText] = useState('');

    async function load() {
        const r = await api.get('/admin/app-config');
        setDefaultYear(r.data.default_year || '');
        setLicenseDays(r.data.license_expiring_days || '30');
        setLoginRetentionDays(r.data.login_log_retention_days || '14');
        setFooterText(r.data.footer_text || 'Implemented and Maintain by BSM RPA Team. For Internal use only');
    }
    useEffect(() => { load(); }, []);

    async function saveYear() {
        try {
            await api.put('/admin/app-config/default_year', { value: String(defaultYear) });
            toast.success('Default year saved');
        } catch { toast.error('Save failed'); }
    }

    async function saveDays() {
        const n = Number(licenseDays);
        if (!Number.isFinite(n) || n < 0) {
            return toast.error('Enter a non-negative number of days');
        }
        try {
            await api.put('/admin/app-config/license_expiring_days', { value: String(Math.floor(n)) });
            toast.success('License threshold saved');
        } catch { toast.error('Save failed'); }
    }

    async function saveFooter() {
        try {
            await api.put('/admin/app-config/footer_text', { value: footerText });
            toast.success('Footer saved');
        } catch { toast.error('Save failed'); }
    }

    async function saveLoginRetention() {
        const n = Number(loginRetentionDays);
        if (!Number.isInteger(n) || n < 0) {
            return toast.error('Enter a non-negative whole number of days');
        }
        try {
            await api.put('/admin/app-config/login_log_retention_days', { value: String(n) });
            toast.success('Login log retention saved');
        } catch { toast.error('Save failed'); }
    }

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold">App Configuration</h1>

            <div className="card p-4 max-w-md space-y-3">
                <div>
                    <label className="label">Default Selected Year</label>
                    <input type="number" className="input" value={defaultYear}
                           onChange={e => setDefaultYear(e.target.value)} />
                    <p className="text-xs text-slate-400 mt-1">If empty, the current calendar year is used by default.</p>
                </div>
                <button className="btn-primary" onClick={saveYear}>Save Year</button>
            </div>

            <div className="card p-4 max-w-md space-y-3">
                <div>
                    <label className="label">License Expiring Soon Threshold (Days)</label>
                    <input type="number" min="0" className="input" value={licenseDays}
                           onChange={e => setLicenseDays(e.target.value)} />
                    <p className="text-xs text-slate-400 mt-1">
                        Licenses expiring within this many days are highlighted on the License Dashboard. Default 30.
                    </p>
                </div>
                <button className="btn-primary" onClick={saveDays}>Save Threshold</button>
            </div>

            <div className="card p-4 max-w-md space-y-3">
                <div>
                    <label className="label">Login Logs Retention (Days)</label>
                    <input type="number" min="0" className="input" value={loginRetentionDays}
                           onChange={e => setLoginRetentionDays(e.target.value)} />
                    <p className="text-xs text-slate-400 mt-1">
                        Login logs older than this value are removed automatically when Login Logs is opened. Default 14.
                    </p>
                </div>
                <button className="btn-primary" onClick={saveLoginRetention}>Save Login Retention</button>
            </div>

            <div className="card p-4 max-w-2xl space-y-3">
                <div>
                    <label className="label">Footer Text</label>
                    <textarea className="input" rows={3} value={footerText}
                              onChange={e => setFooterText(e.target.value)} />
                    <p className="text-xs text-slate-400 mt-1">
                        This footer is shown at the bottom of every page for this tenant.
                    </p>
                </div>
                <button className="btn-primary" onClick={saveFooter}>Save Footer</button>
            </div>
        </div>
    );
}
