import { useEffect, useRef, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';

const AI_PROVIDERS = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'google', label: 'Google Gemini' },
    { value: 'azure_openai', label: 'Azure OpenAI' },
    { value: 'custom', label: 'Custom Endpoint' }
];

const WEB_SEARCH_PROVIDERS = [
    { value: 'disabled', label: 'Disabled' },
    { value: 'google_cse', label: 'Google Custom Search' },
    { value: 'bing', label: 'Bing Web Search' },
    { value: 'serpapi', label: 'SerpAPI' },
    { value: 'custom', label: 'Custom Endpoint' }
];

export default function AppConfigPage() {
    const [defaultYear, setDefaultYear] = useState('');
    const [licenseDays, setLicenseDays] = useState('');
    const [loginRetentionDays, setLoginRetentionDays] = useState('14');
    const [postItExpiryDays, setPostItExpiryDays] = useState('30');
    const [postItBoardSize, setPostItBoardSize] = useState('40');
    const [footerText, setFooterText] = useState('');
    const [announcementEnabled, setAnnouncementEnabled] = useState(false);
    const [announcementContent, setAnnouncementContent] = useState('');
    const [aiProvider, setAiProvider] = useState('openai');
    const [aiApiKey, setAiApiKey] = useState('');
    const [aiEndpoint, setAiEndpoint] = useState('');
    const [aiModel, setAiModel] = useState('');
    const [aiModels, setAiModels] = useState([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [testingAi, setTestingAi] = useState(false);
    const [webSearchProvider, setWebSearchProvider] = useState('disabled');
    const [webSearchApiKey, setWebSearchApiKey] = useState('');
    const [webSearchEndpoint, setWebSearchEndpoint] = useState('');
    const [webSearchCx, setWebSearchCx] = useState('');
    const [documentTypes, setDocumentTypes] = useState([]);
    const [newDocumentType, setNewDocumentType] = useState('');
    const [editingDocumentType, setEditingDocumentType] = useState(null);
    const [editingDocumentTypeName, setEditingDocumentTypeName] = useState('');
    const announcementEditorRef = useRef(null);
    const announcementImageRef = useRef(null);

    async function load() {
        const [r, ai, search, docTypes] = await Promise.all([
            api.get('/admin/app-config'),
            api.get('/admin/ai-config'),
            api.get('/admin/web-search-config'),
            api.get('/admin/project-attachment-types')
        ]);
        setDefaultYear(r.data.default_year || '');
        setLicenseDays(r.data.license_expiring_days || '30');
        setLoginRetentionDays(r.data.login_log_retention_days || '14');
        setPostItExpiryDays(r.data.post_it_expiry_days || '30');
        setPostItBoardSize(r.data.post_it_board_size || '40');
        setFooterText(r.data.footer_text || 'Implemented and Maintain by BSM RPA Team. For Internal use only');
        setAnnouncementEnabled(String(r.data.announcement_enabled || 'false') === 'true');
        setAnnouncementContent(r.data.announcement_content || '');
        if (announcementEditorRef.current) announcementEditorRef.current.innerHTML = r.data.announcement_content || '';
        setAiProvider(ai.data.provider || 'openai');
        setAiApiKey(ai.data.api_key || '');
        setAiEndpoint(ai.data.endpoint || '');
        setAiModel(ai.data.model || '');
        setWebSearchProvider(search.data.provider || 'disabled');
        setWebSearchApiKey(search.data.api_key || '');
        setWebSearchEndpoint(search.data.endpoint || '');
        setWebSearchCx(search.data.cx || '');
        setDocumentTypes(docTypes.data || []);
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

    function execAnnouncement(command, value = null) {
        announcementEditorRef.current?.focus();
        document.execCommand(command, false, value);
        setAnnouncementContent(announcementEditorRef.current?.innerHTML || '');
    }

    function insertAnnouncementImage(e) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            return toast.error('Image must be 2 MB or smaller');
        }
        const reader = new FileReader();
        reader.onload = () => execAnnouncement('insertImage', reader.result);
        reader.readAsDataURL(file);
    }

    async function saveAnnouncement() {
        const content = announcementEditorRef.current?.innerHTML || announcementContent || '';
        try {
            await Promise.all([
                api.put('/admin/app-config/announcement_enabled', { value: announcementEnabled ? 'true' : 'false' }),
                api.put('/admin/app-config/announcement_content', { value: content })
            ]);
            setAnnouncementContent(content);
            toast.success('Announcement saved');
        } catch {
            toast.error('Save failed');
        }
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

    async function savePostItExpiry() {
        const n = Number(postItExpiryDays);
        if (!Number.isInteger(n) || n <= 0) {
            return toast.error('Enter a positive whole number of days');
        }
        try {
            await api.put('/admin/app-config/post_it_expiry_days', { value: String(n) });
            toast.success('Post-It expiry saved');
        } catch { toast.error('Save failed'); }
    }

    async function savePostItBoardSize() {
        const n = Number(postItBoardSize);
        if (!Number.isInteger(n) || n < 1 || n > 100) {
            return toast.error('Enter a whole number from 1 to 100');
        }
        try {
            await api.put('/admin/app-config/post_it_board_size', { value: String(n) });
            toast.success('Post-It board size saved');
        } catch { toast.error('Save failed'); }
    }

    async function saveAiConfig() {
        if ((aiProvider === 'azure_openai' || aiProvider === 'custom') && !aiEndpoint.trim()) {
            return toast.error('Endpoint is required for this provider');
        }
        try {
            const r = await api.put('/admin/ai-config', {
                provider: aiProvider,
                api_key: aiApiKey,
                endpoint: aiEndpoint,
                model: aiModel
            });
            setAiApiKey(r.data.api_key || '');
            toast.success('AI configuration saved');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        }
    }

    async function loadAiModels() {
        setLoadingModels(true);
        try {
            const r = await api.post('/admin/ai-config/models', {
                provider: aiProvider,
                api_key: aiApiKey,
                endpoint: aiEndpoint
            });
            const models = r.data.models || [];
            setAiModels(models);
            if (!aiModel && models[0]) setAiModel(models[0]);
            toast.success(models.length ? `Loaded ${models.length} model(s)` : 'No models returned');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load models');
        } finally {
            setLoadingModels(false);
        }
    }

    async function testAiConfig() {
        if ((aiProvider === 'azure_openai' || aiProvider === 'custom') && !aiEndpoint.trim()) {
            return toast.error('Endpoint is required for this provider');
        }
        setTestingAi(true);
        try {
            const r = await api.post('/admin/ai-config/test', {
                provider: aiProvider,
                api_key: aiApiKey,
                endpoint: aiEndpoint,
                model: aiModel
            });
            const count = Number(r.data.model_count || 0);
            toast.success(aiModel
                ? `AI test passed. Model found. (${count} model(s) available)`
                : `AI test passed. ${count} model(s) available`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'AI configuration test failed');
        } finally {
            setTestingAi(false);
        }
    }

    function changeAiProvider(value) {
        setAiProvider(value);
        setAiModels([]);
        if (value !== 'azure_openai' && value !== 'custom') setAiEndpoint('');
    }

    async function saveWebSearchConfig() {
        if (webSearchProvider === 'google_cse' && (!webSearchApiKey.trim() || !webSearchCx.trim())) {
            return toast.error('Google Custom Search requires API key and Search Engine ID');
        }
        if ((webSearchProvider === 'bing' || webSearchProvider === 'serpapi') && !webSearchApiKey.trim()) {
            return toast.error('This search provider requires an API key');
        }
        if (webSearchProvider === 'custom' && !webSearchEndpoint.trim()) {
            return toast.error('Custom search endpoint is required');
        }
        try {
            const r = await api.put('/admin/web-search-config', {
                provider: webSearchProvider,
                api_key: webSearchApiKey,
                endpoint: webSearchEndpoint,
                cx: webSearchCx
            });
            setWebSearchApiKey(r.data.api_key || '');
            toast.success('Web Search configuration saved');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        }
    }

    function changeWebSearchProvider(value) {
        setWebSearchProvider(value);
        if (value !== 'custom') setWebSearchEndpoint('');
        if (value !== 'google_cse') setWebSearchCx('');
    }

    async function reloadDocumentTypes() {
        const r = await api.get('/admin/project-attachment-types');
        setDocumentTypes(r.data || []);
    }

    async function addDocumentType() {
        if (!newDocumentType.trim()) return toast.error('Please enter a document type');
        try {
            await api.post('/admin/project-attachment-types', { name: newDocumentType.trim() });
            setNewDocumentType('');
            toast.success('Document type added');
            reloadDocumentTypes();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        }
    }

    function beginEditDocumentType(item) {
        setEditingDocumentType(item.id);
        setEditingDocumentTypeName(item.name || '');
    }

    async function saveDocumentType(item) {
        if (!editingDocumentTypeName.trim()) return toast.error('Please enter a document type');
        try {
            await api.put(`/admin/project-attachment-types/${item.id}`, { name: editingDocumentTypeName.trim() });
            setEditingDocumentType(null);
            setEditingDocumentTypeName('');
            toast.success('Document type updated');
            reloadDocumentTypes();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Update failed');
        }
    }

    async function deleteDocumentType(item) {
        if (!confirm(`Delete "${item.name}"? Existing files will move to General.`)) return;
        try {
            await api.delete(`/admin/project-attachment-types/${item.id}`);
            toast.success('Document type deleted');
            reloadDocumentTypes();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Delete failed');
        }
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

            <div className="card p-4 max-w-md space-y-3">
                <div>
                    <label className="label">Post-It Expiry (Days)</label>
                    <input type="number" min="1" className="input" value={postItExpiryDays}
                           onChange={e => setPostItExpiryDays(e.target.value)} />
                    <p className="text-xs text-slate-400 mt-1">
                        New and extended Post-It notes expire after this many days. Default 30.
                    </p>
                </div>
                <button className="btn-primary" onClick={savePostItExpiry}>Save Post-It Expiry</button>
            </div>

            <div className="card p-4 max-w-md space-y-3">
                <div>
                    <label className="label">Post-It Per Board</label>
                    <input type="number" min="1" max="100" className="input" value={postItBoardSize}
                           onChange={e => setPostItBoardSize(e.target.value)} />
                    <p className="text-xs text-slate-400 mt-1">
                        Maximum number of Post-It notes on each board. The board layout expands notes to fill the board. Default 40.
                    </p>
                </div>
                <button className="btn-primary" onClick={savePostItBoardSize}>Save Post-It Board Size</button>
            </div>

            <div className="card p-4 max-w-2xl space-y-3">
                <div>
                    <label className="label">Project Attachment Document Types</label>
                    <p className="text-xs text-slate-400 mt-1">
                        Used when uploading project attachments. Default type is General.
                    </p>
                </div>
                <div className="flex gap-2">
                    <input className="input" placeholder="New document type"
                           value={newDocumentType}
                           onChange={e => setNewDocumentType(e.target.value)}
                           onKeyDown={e => { if (e.key === 'Enter') addDocumentType(); }} />
                    <button className="btn-primary" onClick={addDocumentType}>Add</button>
                </div>
                <div className="overflow-x-auto">
                    <table className="table-clean">
                        <thead>
                            <tr><th>Name</th><th>Default</th><th></th></tr>
                        </thead>
                        <tbody>
                            {documentTypes.map(item => {
                                const editing = editingDocumentType === item.id;
                                return (
                                    <tr key={item.id}>
                                        <td>
                                            {editing ? (
                                                <input className="input !py-1.5"
                                                       value={editingDocumentTypeName}
                                                       onChange={e => setEditingDocumentTypeName(e.target.value)}
                                                       onKeyDown={e => {
                                                           if (e.key === 'Enter') saveDocumentType(item);
                                                           if (e.key === 'Escape') setEditingDocumentType(null);
                                                       }} />
                                            ) : (
                                                <span className="font-semibold">{item.name}</span>
                                            )}
                                        </td>
                                        <td>{item.is_system ? <span className="pill bg-blue-100 text-blue-700">Default</span> : ''}</td>
                                        <td className="text-right">
                                            {editing ? (
                                                <>
                                                    <button className="btn-ghost" onClick={() => saveDocumentType(item)}>Save</button>
                                                    <button className="btn-ghost" onClick={() => setEditingDocumentType(null)}>Cancel</button>
                                                </>
                                            ) : (
                                                <>
                                                    <button className="btn-ghost" onClick={() => beginEditDocumentType(item)}>Edit</button>
                                                    <button className="btn-ghost text-red-600" onClick={() => deleteDocumentType(item)}>Delete</button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {documentTypes.length === 0 && (
                                <tr><td colSpan={3} className="text-center text-slate-400 py-6">No document types.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card p-4 max-w-2xl space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <label className="label">Announcement</label>
                        <p className="text-xs text-slate-400 mt-1">
                            Enabled announcements pop up for users when they enter the system.
                        </p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                        <input type="checkbox"
                               checked={announcementEnabled}
                               onChange={e => setAnnouncementEnabled(e.target.checked)} />
                        Enabled
                    </label>
                </div>
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 p-2">
                        <button type="button" className="btn-ghost !py-1" onClick={() => execAnnouncement('bold')}>B</button>
                        <button type="button" className="btn-ghost !py-1 italic" onClick={() => execAnnouncement('italic')}>I</button>
                        <button type="button" className="btn-ghost !py-1 underline" onClick={() => execAnnouncement('underline')}>U</button>
                        <button type="button" className="btn-ghost !py-1" onClick={() => execAnnouncement('insertUnorderedList')}>List</button>
                        <button type="button" className="btn-ghost !py-1" onClick={() => announcementImageRef.current?.click()}>Image</button>
                        <input ref={announcementImageRef} type="file" accept="image/*" className="hidden" onChange={insertAnnouncementImage} />
                    </div>
                    <div ref={announcementEditorRef}
                         contentEditable
                         className="kb-article-content min-h-[220px] bg-white p-4 text-sm outline-none"
                         onInput={() => setAnnouncementContent(announcementEditorRef.current?.innerHTML || '')} />
                </div>
                <button className="btn-primary" onClick={saveAnnouncement}>Save Announcement</button>
            </div>

            <div className="card p-4 max-w-2xl space-y-3">
                <div>
                    <label className="label">AI Model Configuration</label>
                    <p className="text-xs text-slate-400 mt-1">
                        Configure the tenant AI provider for future AI features in the web app.
                    </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    <div>
                        <label className="label">Provider</label>
                        <select className="input" value={aiProvider}
                                onChange={e => changeAiProvider(e.target.value)}>
                            {AI_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="label">API Key</label>
                        <input className="input" type="password" value={aiApiKey}
                               onChange={e => setAiApiKey(e.target.value)}
                               placeholder="Paste API key" />
                    </div>
                    {(aiProvider === 'azure_openai' || aiProvider === 'custom') && (
                        <div className="md:col-span-2">
                            <label className="label">{aiProvider === 'azure_openai' ? 'Azure OpenAI Endpoint' : 'Custom Endpoint'}</label>
                            <input className="input" value={aiEndpoint}
                                   onChange={e => setAiEndpoint(e.target.value)}
                                   placeholder={aiProvider === 'azure_openai'
                                       ? 'https://your-resource.openai.azure.com'
                                       : 'https://your-ai-gateway.example.com/v1'} />
                        </div>
                    )}
                    <div className="md:col-span-2">
                        <label className="label">Model</label>
                        {aiModels.length > 0 ? (
                            <select className="input" value={aiModel}
                                    onChange={e => setAiModel(e.target.value)}>
                                <option value="">Select model</option>
                                {aiModels.map(model => <option key={model} value={model}>{model}</option>)}
                            </select>
                        ) : (
                            <input className="input" value={aiModel}
                                   onChange={e => setAiModel(e.target.value)}
                                   placeholder={aiProvider === 'custom' ? 'custom-model-name' : 'Load models or enter model manually'} />
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button className="btn-ghost" onClick={loadAiModels} disabled={loadingModels}>
                        {loadingModels ? 'Loading Models...' : 'Load Supported Models'}
                    </button>
                    <button className="btn-ghost" onClick={testAiConfig} disabled={testingAi || loadingModels}>
                        {testingAi ? 'Testing...' : 'Test Configuration'}
                    </button>
                    <button className="btn-primary" onClick={saveAiConfig}>Save AI Configuration</button>
                </div>
            </div>

            <div className="card p-4 max-w-2xl space-y-3">
                <div>
                    <label className="label">Web Search Configuration</label>
                    <p className="text-xs text-slate-400 mt-1">
                        Used by Resource AI Suggest to find source results before suggesting missing profile fields.
                    </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    <div>
                        <label className="label">Provider</label>
                        <select className="input" value={webSearchProvider}
                                onChange={e => changeWebSearchProvider(e.target.value)}>
                            {WEB_SEARCH_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                    </div>
                    {webSearchProvider !== 'disabled' && (
                        <div>
                            <label className="label">API Key</label>
                            <input className="input" type="password" value={webSearchApiKey}
                                   onChange={e => setWebSearchApiKey(e.target.value)}
                                   placeholder="Paste search API key" />
                        </div>
                    )}
                    {webSearchProvider === 'google_cse' && (
                        <div className="md:col-span-2">
                            <label className="label">Search Engine ID</label>
                            <input className="input" value={webSearchCx}
                                   onChange={e => setWebSearchCx(e.target.value)}
                                   placeholder="Google Programmable Search Engine ID (cx)" />
                        </div>
                    )}
                    {webSearchProvider === 'custom' && (
                        <div className="md:col-span-2">
                            <label className="label">Custom Search Endpoint</label>
                            <input className="input" value={webSearchEndpoint}
                                   onChange={e => setWebSearchEndpoint(e.target.value)}
                                   placeholder="https://your-search-gateway.example.com/search" />
                            <p className="text-xs text-slate-400 mt-1">
                                The app calls this endpoint with ?q=... and expects results/items with title, url/link, and snippet.
                            </p>
                        </div>
                    )}
                </div>
                <button className="btn-primary" onClick={saveWebSearchConfig}>Save Web Search Configuration</button>
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
