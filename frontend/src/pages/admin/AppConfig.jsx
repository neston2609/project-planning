import { useEffect, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

export default function AppConfigPage() {
    const [defaultYear, setDefaultYear] = useState('');
    async function load() {
        const r = await api.get('/admin/app-config');
        setDefaultYear(r.data.default_year || '');
    }
    useEffect(() => { load(); }, []);

    async function save() {
        try {
            await api.put('/admin/app-config/default_year', { value: String(defaultYear) });
            toast.success('Saved');
        } catch { toast.error('Save failed'); }
    }
    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold">App Configuration</h1>
            <div className="card p-4 max-w-md space-y-3">
                <div>
                    <label className="label">Default Selected Year</label>
                    <input type="number" className="input" value={defaultYear} onChange={e => setDefaultYear(e.target.value)} />
                    <p className="text-xs text-slate-400 mt-1">If empty, the current calendar year is used by default.</p>
                </div>
                <button className="btn-primary" onClick={save}>Save</button>
            </div>
        </div>
    );
}
