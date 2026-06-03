import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import { useAuth, isAdmin } from '../auth';
import {
    ArrowUpTrayIcon, BookOpenIcon, LinkIcon, MagnifyingGlassIcon,
    PaperClipIcon, PencilSquareIcon, PlusIcon, TrashIcon
} from '@heroicons/react/24/outline';

function toList(value) {
    if (Array.isArray(value)) return value;
    return String(value || '').split(/[,\n]/).map(v => v.trim()).filter(Boolean);
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return div.textContent || div.innerText || '';
}

export default function KnowledgeBase() {
    const { user } = useAuth();
    const [articles, setArticles] = useState([]);
    const [config, setConfig] = useState({ categories: [], products: [], version_limit: 20 });
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);
    const [edit, setEdit] = useState(null);
    const canDelete = isAdmin(user);

    async function load() {
        const [cfg, list] = await Promise.all([
            api.get('/knowledge-base/config'),
            api.get('/knowledge-base/articles')
        ]);
        setConfig(cfg.data);
        setArticles(list.data || []);
    }

    useEffect(() => { load().catch(() => toast.error('Could not load knowledge base')); }, []);

    async function openArticle(article) {
        try {
            const res = await api.get(`/knowledge-base/articles/${article.id}`);
            setSelected(res.data);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not open article');
        }
    }

    async function saveArticle(payload) {
        try {
            if (payload.id) await api.put(`/knowledge-base/articles/${payload.id}`, payload);
            else await api.post('/knowledge-base/articles', payload);
            toast.success('Article saved');
            setEdit(null);
            await load();
            if (selected?.id === payload.id) openArticle(payload);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Save failed');
        }
    }

    async function deleteArticle(article) {
        if (!confirm(`Delete "${article.title}"?`)) return;
        try {
            await api.delete(`/knowledge-base/articles/${article.id}`);
            toast.success('Article deleted');
            setSelected(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Delete failed');
        }
    }

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return articles;
        return articles.filter(a =>
            (a.title || '').toLowerCase().includes(q) ||
            (a.category_name || '').toLowerCase().includes(q) ||
            (a.product_name || '').toLowerCase().includes(q) ||
            (a.tags || []).some(tag => String(tag).toLowerCase().includes(q))
        );
    }, [articles, search]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <BookOpenIcon className="w-7 h-7 text-blue-600" /> Knowledge Base
                    </h1>
                    <p className="text-sm text-slate-500">Team articles, troubleshooting notes, references, and attachments.</p>
                </div>
                <button className="btn-primary ml-auto" onClick={() => setEdit({ title: '', content: '', tags: [], reference_urls: [], attachments: [], related_ids: [] })}>
                    <PlusIcon className="w-4 h-4" /> Add Article
                </button>
            </div>

            <div className="card p-3 flex items-center gap-2">
                <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
                <input className="input !border-0 !bg-transparent !p-0 focus:!ring-0 flex-1"
                       placeholder="Search title / category / product / tags..."
                       value={search} onChange={e => setSearch(e.target.value)} />
                <span className="text-xs text-slate-500">{filtered.length} article(s)</span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
                <div className="space-y-3">
                    {filtered.map(article => (
                        <button key={article.id} className="card p-4 w-full text-left hover:shadow-md transition"
                                onClick={() => openArticle(article)}>
                            <div className="flex items-start gap-3">
                                <BookOpenIcon className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <div className="font-bold text-slate-900 truncate">{article.title}</div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        {article.category_name || 'No category'} · {article.product_name || 'No product'} · v{article.version}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-2 line-clamp-2">
                                        {stripHtml(article.content)}
                                    </div>
                                    <TagRow tags={article.tags} />
                                </div>
                            </div>
                        </button>
                    ))}
                    {filtered.length === 0 && <div className="card p-8 text-center text-slate-400">No articles found.</div>}
                </div>

                <div className="card p-5 min-h-[480px]">
                    {selected ? (
                        <ArticleDetail article={selected}
                                       canDelete={canDelete}
                                       onEdit={() => setEdit(selected)}
                                       onDelete={() => deleteArticle(selected)}
                                       onOpen={openArticle} />
                    ) : (
                        <div className="h-full flex items-center justify-center text-slate-400">
                            Select an article to read.
                        </div>
                    )}
                </div>
            </div>

            {edit && (
                <ArticleForm initial={edit}
                             config={config}
                             articles={articles}
                             onClose={() => setEdit(null)}
                             onSave={saveArticle} />
            )}
        </div>
    );
}

function TagRow({ tags }) {
    const values = Array.isArray(tags) ? tags : [];
    if (values.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-1 mt-2">
            {values.slice(0, 6).map(tag => (
                <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{tag}</span>
            ))}
        </div>
    );
}

function ArticleDetail({ article, canDelete, onEdit, onDelete, onOpen }) {
    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-extrabold text-slate-900">{article.title}</h2>
                    <div className="text-xs text-slate-500 mt-1">
                        {article.category_name || 'No category'} · {article.product_name || 'No product'} · v{article.version}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                        Author: {article.author_name || article.author_username || '-'} · Last updated by {article.last_updated_by_name || article.last_updated_by_username || '-'} · {new Date(article.updated_at).toLocaleString()}
                    </div>
                </div>
                <button className="btn-ghost" onClick={onEdit}><PencilSquareIcon className="w-4 h-4" /> Edit</button>
                {canDelete && <button className="btn-ghost" onClick={onDelete}><TrashIcon className="w-4 h-4 text-red-500" /> Delete</button>}
            </div>

            <TagRow tags={article.tags} />

            <div className="kb-article-content max-w-none rounded-lg border border-slate-200 bg-white p-4 text-sm"
                 dangerouslySetInnerHTML={{ __html: article.content || '' }} />

            {(article.reference_urls || []).length > 0 && (
                <div>
                    <h3 className="font-bold mb-2">Reference URLs</h3>
                    <div className="space-y-1">
                        {article.reference_urls.map(url => (
                            <a key={url} className="flex items-center gap-2 text-sm text-blue-700 hover:underline"
                               href={url} target="_blank" rel="noreferrer">
                                <LinkIcon className="w-4 h-4" /> {url}
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {(article.attachments || []).length > 0 && (
                <div>
                    <h3 className="font-bold mb-2">Attachments</h3>
                    <div className="flex flex-wrap gap-2">
                        {article.attachments.map(f => (
                            <a key={f.id || f.file_name} className="btn-ghost"
                               href={f.data_url} download={f.file_name}>
                                <PaperClipIcon className="w-4 h-4" /> {f.file_name}
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {(article.related_articles || []).length > 0 && (
                <div>
                    <h3 className="font-bold mb-2">Related Articles</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {article.related_articles.map(a => (
                            <button key={a.id} className="rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"
                                    onClick={() => onOpen(a)}>
                                <div className="font-semibold text-sm">{a.title}</div>
                                <div className="text-xs text-slate-500">{a.category_name || '-'} · {a.product_name || '-'}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {(article.history || []).length > 0 && (
                <div>
                    <h3 className="font-bold mb-2">Version History</h3>
                    <div className="overflow-x-auto">
                        <table className="table-clean">
                            <thead><tr><th>Version</th><th>Changed By</th><th>Changed At</th><th>Change</th></tr></thead>
                            <tbody>
                                {article.history.map(h => (
                                    <tr key={h.id}>
                                        <td className="font-bold">v{h.version}</td>
                                        <td>{h.changed_by_name || h.changed_by_username || '-'}</td>
                                        <td className="text-xs">{new Date(h.changed_at).toLocaleString()}</td>
                                        <td className="text-sm">{h.change_summary}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function ArticleForm({ initial, config, articles, onClose, onSave }) {
    const [f, setF] = useState({
        ...initial,
        category_id: initial.category_id || '',
        product_id: initial.product_id || '',
        tags_text: (initial.tags || []).join(', '),
        refs_text: (initial.reference_urls || []).join('\n'),
        related_ids: (initial.related_articles || []).map(a => a.id).concat(initial.related_ids || []),
        attachments: initial.attachments || []
    });
    const editorRef = useRef(null);
    const imageRef = useRef(null);
    const attachRef = useRef(null);

    useEffect(() => {
        if (editorRef.current) editorRef.current.innerHTML = initial.content || '';
    }, [initial.id]);

    function exec(command) {
        editorRef.current?.focus();
        document.execCommand(command, false, null);
        setF(s => ({ ...s, content: editorRef.current?.innerHTML || '' }));
    }

    async function insertImage(e) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) return toast.error('Please choose an image file');
        if (file.size > 2 * 1024 * 1024) return toast.error('Inline image must be 2 MB or smaller');
        const dataUrl = await fileToDataUrl(file);
        editorRef.current?.focus();
        document.execCommand('insertImage', false, dataUrl);
        setF(s => ({ ...s, content: editorRef.current?.innerHTML || '' }));
    }

    async function addAttachments(e) {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        const next = [];
        for (const file of files) {
            if (file.size > 5 * 1024 * 1024) {
                toast.error(`${file.name} is larger than 5 MB`);
                continue;
            }
            next.push({
                file_name: file.name,
                mime_type: file.type,
                file_size: file.size,
                data_url: await fileToDataUrl(file)
            });
        }
        setF(s => ({ ...s, attachments: [...(s.attachments || []), ...next] }));
    }

    function submit() {
        const content = editorRef.current?.innerHTML || '';
        onSave({
            id: f.id,
            title: f.title || '',
            content,
            category_id: f.category_id ? Number(f.category_id) : null,
            product_id: f.product_id ? Number(f.product_id) : null,
            tags: toList(f.tags_text),
            reference_urls: toList(f.refs_text),
            attachments: f.attachments || [],
            related_ids: (f.related_ids || []).map(Number).filter(Boolean)
        });
    }

    function toggleRelated(id) {
        setF(s => {
            const cur = new Set((s.related_ids || []).map(Number));
            if (cur.has(id)) cur.delete(id); else cur.add(id);
            return { ...s, related_ids: [...cur] };
        });
    }

    return (
        <Modal open onClose={onClose} title={f.id ? `Edit Article - ${f.title}` : 'New Article'} size="xl"
               footer={<>
                   <button className="btn-ghost" onClick={onClose}>Cancel</button>
                   <button className="btn-primary" onClick={submit}>Save Article</button>
               </>}>
            <div className="space-y-4">
                <div>
                    <label className="label">Title</label>
                    <input className="input" value={f.title || ''} onChange={e => setF({ ...f, title: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="label">Category</label>
                        <select className="input" value={f.category_id || ''} onChange={e => setF({ ...f, category_id: e.target.value })}>
                            <option value="">Select category</option>
                            {(config.categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="label">Product</label>
                        <select className="input" value={f.product_id || ''} onChange={e => setF({ ...f, product_id: e.target.value })}>
                            <option value="">Select product</option>
                            {(config.products || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="label">Content</label>
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                        <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 p-2">
                            <button type="button" className="btn-ghost !py-1" onClick={() => exec('bold')}>B</button>
                            <button type="button" className="btn-ghost !py-1 italic" onClick={() => exec('italic')}>I</button>
                            <button type="button" className="btn-ghost !py-1 underline" onClick={() => exec('underline')}>U</button>
                            <button type="button" className="btn-ghost !py-1" onClick={() => exec('insertUnorderedList')}>List</button>
                            <button type="button" className="btn-ghost !py-1" onClick={() => imageRef.current?.click()}>
                                <ArrowUpTrayIcon className="w-4 h-4" /> Image
                            </button>
                            <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={insertImage} />
                        </div>
                        <div ref={editorRef}
                             contentEditable
                             className="kb-article-content min-h-[260px] bg-white p-4 text-sm outline-none"
                             onInput={() => setF(s => ({ ...s, content: editorRef.current?.innerHTML || '' }))} />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="label">Tags</label>
                        <input className="input" placeholder="tag1, tag2, tag3"
                               value={f.tags_text} onChange={e => setF({ ...f, tags_text: e.target.value })} />
                    </div>
                    <div>
                        <label className="label">Reference URLs</label>
                        <textarea className="input" rows={2} placeholder="One URL per line"
                                  value={f.refs_text} onChange={e => setF({ ...f, refs_text: e.target.value })} />
                    </div>
                </div>

                <div>
                    <label className="label">Attachments</label>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-ghost" onClick={() => attachRef.current?.click()}>
                            <PaperClipIcon className="w-4 h-4" /> Add Files
                        </button>
                        <input ref={attachRef} type="file" multiple className="hidden" onChange={addAttachments} />
                        {(f.attachments || []).map((file, idx) => (
                            <span key={`${file.file_name}-${idx}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs flex items-center gap-2">
                                {file.file_name}
                                <button type="button" onClick={() => setF(s => ({ ...s, attachments: s.attachments.filter((_, i) => i !== idx) }))}>x</button>
                            </span>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="label">Related Articles</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-2">
                        {articles.filter(a => Number(a.id) !== Number(f.id)).map(a => (
                            <label key={a.id} className="flex items-center gap-2 rounded p-2 hover:bg-slate-50">
                                <input type="checkbox"
                                       checked={(f.related_ids || []).map(Number).includes(Number(a.id))}
                                       onChange={() => toggleRelated(Number(a.id))} />
                                <span className="text-sm truncate">{a.title}</span>
                            </label>
                        ))}
                        {articles.filter(a => Number(a.id) !== Number(f.id)).length === 0 && (
                            <div className="text-sm text-slate-400 p-2">No other articles yet.</div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
