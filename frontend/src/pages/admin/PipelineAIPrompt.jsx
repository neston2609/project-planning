import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api';
import { SparklesIcon } from '@heroicons/react/24/outline';

export default function PipelineAIPrompt() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const r = await api.get('/admin/pipeline-ai-prompts');
            setRows(r.data || []);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load prompts');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, []);

    function update(fieldKey, patch) {
        setRows(current => current.map(row => (
            row.field_key === fieldKey ? { ...row, ...patch } : row
        )));
    }

    async function save() {
        setSaving(true);
        try {
            const r = await api.put('/admin/pipeline-ai-prompts', {
                prompts: rows.map(row => ({
                    field_key: row.field_key,
                    prompt: row.prompt || '',
                    enabled: Boolean(row.enabled)
                }))
            });
            setRows(r.data || []);
            toast.success('Pipeline AI prompts saved');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Pipeline AI Prompt</h1>
                    <p className="text-sm text-slate-500">
                        Configure one AI prompt per budget value. Disabled prompts fall back to the existing Excel parser.
                    </p>
                </div>
                <button className="btn-primary ml-auto" onClick={save} disabled={saving || loading}>
                    <SparklesIcon className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Prompts'}
                </button>
            </div>

            <div className="card p-4 space-y-3">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Prompts receive the Excel text from rows after COST BREAKDOWN. Ask the model to return only one numeric amount.
                </div>
                {loading ? (
                    <div className="py-8 text-center text-slate-400">Loading...</div>
                ) : (
                    <div className="space-y-4">
                        {rows.map(row => (
                            <div key={row.field_key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="flex flex-wrap items-center gap-3">
                                    <div>
                                        <div className="font-bold text-slate-800">{row.label}</div>
                                        <div className="font-mono text-xs text-slate-400">{row.field_key}</div>
                                    </div>
                                    <label className="ml-auto inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                                        <input type="checkbox"
                                               checked={Boolean(row.enabled)}
                                               onChange={e => update(row.field_key, { enabled: e.target.checked })} />
                                        Enabled
                                    </label>
                                </div>
                                <textarea className="input mt-3 min-h-[110px]"
                                          value={row.prompt || ''}
                                          onChange={e => update(row.field_key, { prompt: e.target.value })} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
