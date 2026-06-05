import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
    ArrowPathIcon, PlusIcon, TrashIcon, ClockIcon, PencilSquareIcon, XMarkIcon,
    ChatBubbleLeftRightIcon, PaperAirplaneIcon
} from '@heroicons/react/24/outline';
import api from '../api';
import Modal from '../components/Modal';

const DEFAULT_BOARD_SIZE = 40;
const COLORS = [
    { value: 'yellow', label: 'Yellow', className: 'from-yellow-50 to-yellow-200 border-yellow-300', dot: 'bg-yellow-200', from: '#fefce8', to: '#fde68a' },
    { value: 'pink', label: 'Pink', className: 'from-rose-50 to-rose-200 border-rose-300', dot: 'bg-rose-200', from: '#fff1f2', to: '#fecdd3' },
    { value: 'blue', label: 'Blue', className: 'from-cyan-50 to-cyan-200 border-cyan-300', dot: 'bg-cyan-200', from: '#ecfeff', to: '#a5f3fc' },
    { value: 'green', label: 'Green', className: 'from-emerald-50 to-emerald-200 border-emerald-300', dot: 'bg-emerald-200', from: '#ecfdf5', to: '#a7f3d0' },
    { value: 'purple', label: 'Purple', className: 'from-violet-50 to-violet-200 border-violet-300', dot: 'bg-violet-200', from: '#f5f3ff', to: '#ddd6fe' },
    { value: 'orange', label: 'Orange', className: 'from-orange-50 to-orange-200 border-orange-300', dot: 'bg-orange-200', from: '#fff7ed', to: '#fed7aa' },
    { value: 'mint', label: 'Mint', className: 'from-teal-50 to-teal-200 border-teal-300', dot: 'bg-teal-200', from: '#f0fdfa', to: '#99f6e4' },
    { value: 'lavender', label: 'Lavender', className: 'from-fuchsia-50 to-fuchsia-200 border-fuchsia-300', dot: 'bg-fuchsia-200', from: '#fdf4ff', to: '#f5d0fe' },
    { value: 'peach', label: 'Peach', className: 'from-rose-50 to-orange-200 border-orange-300', dot: 'bg-orange-200', from: '#fff1f2', to: '#fed7aa' },
    { value: 'cream', label: 'Cream', className: 'from-stone-50 to-amber-100 border-amber-200', dot: 'bg-amber-100', from: '#fafaf9', to: '#fef3c7' },
    { value: 'gray', label: 'Gray', className: 'from-slate-50 to-slate-200 border-slate-300', dot: 'bg-slate-200', from: '#f8fafc', to: '#e2e8f0' },
    { value: 'teal', label: 'Teal', className: 'from-emerald-50 to-cyan-200 border-cyan-300', dot: 'bg-cyan-200', from: '#ecfdf5', to: '#a5f3fc' },
    { value: 'indigo', label: 'Indigo', className: 'from-indigo-50 to-indigo-200 border-indigo-300', dot: 'bg-indigo-200', from: '#eef2ff', to: '#c7d2fe' },
    { value: 'coral', label: 'Coral', className: 'from-pink-50 to-red-200 border-red-300', dot: 'bg-red-200', from: '#fdf2f8', to: '#fecaca' }
];
const FONT_COLORS = [
    { value: 'slate', label: 'Black', className: 'text-slate-900', dot: 'bg-slate-900', hex: '#0f172a' },
    { value: 'blue', label: 'Blue', className: 'text-blue-900', dot: 'bg-blue-800', hex: '#1e3a8a' },
    { value: 'red', label: 'Red', className: 'text-red-900', dot: 'bg-red-700', hex: '#b91c1c' },
    { value: 'green', label: 'Green', className: 'text-emerald-900', dot: 'bg-emerald-700', hex: '#047857' },
    { value: 'purple', label: 'Purple', className: 'text-violet-900', dot: 'bg-violet-800', hex: '#5b21b6' },
    { value: 'brown', label: 'Brown', className: 'text-amber-950', dot: 'bg-amber-900', hex: '#78350f' },
    { value: 'navy', label: 'Navy', className: 'text-indigo-950', dot: 'bg-indigo-950', hex: '#1e1b4b' },
    { value: 'cyan', label: 'Cyan', className: 'text-cyan-800', dot: 'bg-cyan-700', hex: '#0e7490' },
    { value: 'orange', label: 'Orange', className: 'text-orange-900', dot: 'bg-orange-700', hex: '#c2410c' },
    { value: 'pink', label: 'Pink', className: 'text-pink-900', dot: 'bg-pink-700', hex: '#be185d' },
    { value: 'gray', label: 'Gray', className: 'text-slate-600', dot: 'bg-slate-500', hex: '#475569' }
];
const FONT_SIZES = [
    { value: 'sm', label: 'S', className: 'text-xs', command: '2' },
    { value: 'md', label: 'M', className: 'text-sm', command: '3' },
    { value: 'lg', label: 'L', className: 'text-base', command: '4' },
    { value: 'xl', label: 'XL', className: 'text-lg', command: '5' }
];

function colorFor(value) {
    return COLORS.find(c => c.value === value) || COLORS[0];
}

function fontColorFor(value) {
    return FONT_COLORS.find(c => c.value === value) || FONT_COLORS[0];
}

function fontSizeFor(value) {
    return FONT_SIZES.find(s => s.value === value) || FONT_SIZES[1];
}

function paperBackground(color) {
    return `linear-gradient(135deg, ${color.from}, ${color.to})`;
}

function cleanBoardSize(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 100 ? n : DEFAULT_BOARD_SIZE;
}

function boardLayout(size) {
    const columns = Math.min(size, Math.max(1, Math.ceil(Math.sqrt(size * 1.6))));
    const rows = Math.max(1, Math.ceil(size / columns));
    return { columns, rows };
}

function chunkBoards(notes, size) {
    const boards = [];
    const boardSize = cleanBoardSize(size);
    for (let i = 0; i < notes.length; i += boardSize) {
        boards.push(notes.slice(i, i + boardSize));
    }
    if (boards.length === 0 || boards[boards.length - 1].length >= boardSize) boards.push([]);
    return boards;
}

function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString();
}

function htmlToText(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return div.textContent || div.innerText || '';
}

export default function PostItBoard() {
    const [notes, setNotes] = useState([]);
    const [config, setConfig] = useState({ expiry_days: 30, expiring_soon_days: 7, board_size: DEFAULT_BOARD_SIZE });
    const [content, setContent] = useState('');
    const [color, setColor] = useState('yellow');
    const [fontColor, setFontColor] = useState('slate');
    const [fontSize, setFontSize] = useState('md');
    const [editing, setEditing] = useState(null);
    const [editorKey, setEditorKey] = useState(0);
    const [loading, setLoading] = useState(true);
    const [replyModal, setReplyModal] = useState(null);
    const [replyLoading, setReplyLoading] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [replySaving, setReplySaving] = useState(false);
    const boardScrollerRef = useRef(null);
    const boardDragRef = useRef({ active: false, pointerId: null, x: 0, scrollLeft: 0, moved: false });
    const boardClickSuppressedRef = useRef(false);
    const [boardDragging, setBoardDragging] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const res = await api.get('/post-its');
            setNotes(res.data.notes || []);
            setConfig({
                expiry_days: res.data.config?.expiry_days || 30,
                expiring_soon_days: res.data.config?.expiring_soon_days || 7,
                board_size: cleanBoardSize(res.data.config?.board_size)
            });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load Post-It board');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, []);

    async function addNote() {
        const message = content.trim();
        if (!message) return toast.error('Please write a message');
        if (htmlToText(message).length > 500) return toast.error('Message must be 500 characters or fewer');
        try {
            const payload = { content: message, color, font_color: fontColor, font_size: fontSize };
            if (editing) {
                await api.put(`/post-its/${editing.id}`, payload);
                toast.success('Post-It updated');
            } else {
                await api.post('/post-its', payload);
                toast.success('Post-It added');
            }
            resetEditor();
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || (editing ? 'Could not update Post-It' : 'Could not add Post-It'));
        }
    }

    function resetEditor() {
        setEditing(null);
        setContent('');
        setColor('yellow');
        setFontColor('slate');
        setFontSize('md');
        setEditorKey(k => k + 1);
    }

    function startEdit(note) {
        setEditing(note);
        setContent(note.content || '');
        setColor(note.color || 'yellow');
        setFontColor(note.font_color || 'slate');
        setFontSize(note.font_size || 'md');
        setEditorKey(k => k + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function remove(note) {
        if (!confirm('Remove this Post-It?')) return;
        try {
            await api.delete(`/post-its/${note.id}`);
            toast.success('Post-It removed');
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not remove Post-It');
        }
    }

    async function extend(note) {
        try {
            await api.post(`/post-its/${note.id}/extend`);
            toast.success('Post-It extended');
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not extend Post-It');
        }
    }

    async function openReplies(note) {
        setReplyModal({ note, replies: [] });
        setReplyText('');
        setReplyLoading(true);
        try {
            const res = await api.get(`/post-its/${note.id}/replies`);
            setReplyModal({
                note: res.data.note || note,
                replies: res.data.replies || []
            });
            setNotes(prev => prev.map(n => n.id === note.id ? { ...n, ...(res.data.note || {}) } : n));
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load replies');
            setReplyModal(null);
        } finally {
            setReplyLoading(false);
        }
    }

    async function addReply() {
        const message = replyText.trim();
        if (!replyModal?.note?.id) return;
        if (!message) return toast.error('Please write a reply');
        if (message.length > 1000) return toast.error('Reply must be 1000 characters or fewer');
        setReplySaving(true);
        try {
            const res = await api.post(`/post-its/${replyModal.note.id}/replies`, { content: message });
            const nextReplies = [...(replyModal.replies || []), res.data];
            const nextNote = {
                ...replyModal.note,
                reply_count: nextReplies.length
            };
            setReplyModal({ note: nextNote, replies: nextReplies });
            setNotes(prev => prev.map(n => n.id === nextNote.id ? { ...n, reply_count: nextReplies.length } : n));
            setReplyText('');
            toast.success('Reply added');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not add reply');
        } finally {
            setReplySaving(false);
        }
    }

    function isInteractiveTarget(target) {
        return Boolean(target?.closest?.('button, a, input, textarea, select, [contenteditable="true"], [role="button"]'));
    }

    function startBoardDrag(e) {
        if (e.button !== 0 || isInteractiveTarget(e.target) || !boardScrollerRef.current) return;
        boardDragRef.current = {
            active: true,
            pointerId: e.pointerId,
            x: e.clientX,
            scrollLeft: boardScrollerRef.current.scrollLeft,
            moved: false
        };
        boardScrollerRef.current.setPointerCapture?.(e.pointerId);
        setBoardDragging(true);
    }

    function moveBoardDrag(e) {
        const drag = boardDragRef.current;
        if (!drag.active || drag.pointerId !== e.pointerId || !boardScrollerRef.current) return;
        if (Math.abs(e.clientX - drag.x) > 5) drag.moved = true;
        e.preventDefault();
        boardScrollerRef.current.scrollLeft = drag.scrollLeft - (e.clientX - drag.x);
    }

    function stopBoardDrag(e) {
        const drag = boardDragRef.current;
        if (!drag.active || drag.pointerId !== e.pointerId) return;
        boardScrollerRef.current?.releasePointerCapture?.(e.pointerId);
        if (drag.moved) {
            boardClickSuppressedRef.current = true;
            window.setTimeout(() => { boardClickSuppressedRef.current = false; }, 0);
        }
        boardDragRef.current = { active: false, pointerId: null, x: 0, scrollLeft: 0, moved: false };
        setBoardDragging(false);
    }

    const boardSize = cleanBoardSize(config.board_size);
    const boards = useMemo(() => chunkBoards(notes, boardSize), [notes, boardSize]);
    const remaining = boardSize - (notes.length % boardSize || boardSize);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Post-It Board</h1>
                    <p className="text-sm text-slate-500">
                        Anonymous notes for the team. Your own notes can be removed or extended before they expire.
                    </p>
                </div>
                <button className="btn-ghost ml-auto" onClick={load} disabled={loading}>
                    <ArrowPathIcon className="w-4 h-4" /> Refresh
                </button>
            </div>

            <div className="card p-4 space-y-3">
                {editing && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                        Editing your Post-It
                        <button className="btn-ghost ml-auto !py-1" onClick={resetEditor}>
                            <XMarkIcon className="w-4 h-4" /> Cancel
                        </button>
                    </div>
                )}
                <RichPostItEditor key={editorKey}
                                  value={content}
                                  paperColor={color}
                                  fontColor={fontColor}
                                  fontSize={fontSize}
                                  onChange={setContent}
                                  onFontColor={setFontColor}
                                  onFontSize={setFontSize} />
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Paper</span>
                        {COLORS.map(c => (
                            <button key={c.value}
                                    type="button"
                                    className={`w-8 h-8 rounded-full border-2 ${c.dot} ${color === c.value ? 'border-slate-900 ring-2 ring-offset-2 ring-indigo-300' : 'border-white'}`}
                                    title={c.label}
                                    onClick={() => setColor(c.value)} />
                        ))}
                    </div>
                    <span className="text-xs text-slate-500">{htmlToText(content).length}/500</span>
                    <span className="text-xs text-slate-500">
                        Expires after {config.expiry_days} day(s). Current board has {remaining} open spot(s).
                    </span>
                    <button className="btn-primary ml-auto" onClick={addNote}>
                        <PlusIcon className="w-4 h-4" /> {editing ? 'Save Post-It' : 'Add Post-It'}
                    </button>
                </div>
            </div>

            <div ref={boardScrollerRef}
                 className={`overflow-x-auto pb-3 ${boardDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
                 onPointerDown={startBoardDrag}
                 onPointerMove={moveBoardDrag}
                 onPointerUp={stopBoardDrag}
                 onPointerCancel={stopBoardDrag}
                 onPointerLeave={stopBoardDrag}>
                <div className="flex gap-5 min-w-max">
                    {boards.map((boardNotes, idx) => (
                        <Board key={idx}
                               index={idx}
                               boardSize={boardSize}
                               notes={boardNotes}
                               loading={loading && idx === 0}
                               onRemove={remove}
                               onExtend={extend}
                               onEdit={startEdit}
                               onViewReplies={openReplies}
                               shouldSuppressClick={() => boardClickSuppressedRef.current} />
                    ))}
                </div>
            </div>

            <ReplyModal data={replyModal}
                        loading={replyLoading}
                        replyText={replyText}
                        saving={replySaving}
                        onReplyText={setReplyText}
                        onSubmit={addReply}
                        onClose={() => setReplyModal(null)} />
        </div>
    );
}

function RichPostItEditor({ value, paperColor, fontColor, fontSize, onChange, onFontColor, onFontSize }) {
    const editorRef = useRef(null);
    const paper = colorFor(paperColor);
    const selectedFontColor = fontColorFor(fontColor);
    const selectedFontSize = fontSizeFor(fontSize);

    useEffect(() => {
        if (editorRef.current) editorRef.current.innerHTML = value || '';
    }, []);

    function update() {
        const html = editorRef.current?.innerHTML || '';
        onChange(html);
    }

    function run(command, arg = null) {
        editorRef.current?.focus();
        document.execCommand(command, false, arg);
        update();
    }

    function chooseFontColor(c) {
        onFontColor(c.value);
        run('foreColor', c.hex);
    }

    function chooseFontSize(s) {
        onFontSize(s.value);
        run('fontSize', s.command);
    }

    function toolbarAction(e, action) {
        e.preventDefault();
        action();
    }

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <button type="button" className="btn-ghost !py-1 !px-2 font-bold" onMouseDown={e => toolbarAction(e, () => run('bold'))}>B</button>
                <button type="button" className="btn-ghost !py-1 !px-2 italic" onMouseDown={e => toolbarAction(e, () => run('italic'))}>I</button>
                <button type="button" className="btn-ghost !py-1 !px-2 underline" onMouseDown={e => toolbarAction(e, () => run('underline'))}>U</button>
                <span className="ml-1 text-xs font-bold uppercase tracking-wider text-slate-500">Text Color</span>
                {FONT_COLORS.map(c => (
                    <button key={c.value}
                            type="button"
                            className={`w-7 h-7 rounded-full border-2 ${c.dot} ${selectedFontColor.value === c.value ? 'border-slate-900 ring-2 ring-offset-1 ring-indigo-300' : 'border-white'}`}
                            title={c.label}
                            onMouseDown={e => toolbarAction(e, () => chooseFontColor(c))} />
                ))}
                <span className="ml-1 text-xs font-bold uppercase tracking-wider text-slate-500">Size</span>
                <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {FONT_SIZES.map(size => (
                        <button key={size.value}
                                type="button"
                                className={`h-8 px-3 text-xs font-bold ${selectedFontSize.value === size.value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                                onMouseDown={e => toolbarAction(e, () => chooseFontSize(size))}>
                            {size.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex justify-center">
                <div ref={editorRef}
                     contentEditable
                     className={`min-h-[150px] w-full max-w-xl rounded-sm border ${paper.className} p-5 text-sm font-bold leading-relaxed shadow-inner outline-none`}
                     data-placeholder="Write a message for the board..."
                     onInput={update}
                     onBlur={update}
                     style={{
                         wordBreak: 'break-word',
                         background: paperBackground(paper),
                         color: selectedFontColor.hex
                     }} />
            </div>
        </div>
    );
}

function Board({ index, boardSize, notes, loading, onRemove, onExtend, onEdit, onViewReplies, shouldSuppressClick }) {
    const layout = boardLayout(boardSize);
    return (
        <section className="relative w-[calc(100vw-3rem)] min-w-[1120px] max-w-[1720px] shrink-0 rounded-xl border-[18px] border-amber-950/80 p-6 shadow-2xl"
                 style={{
                     borderColor: 'rgba(69, 26, 3, 0.80)',
                     backgroundColor: '#b8864f',
                     backgroundImage: 'linear-gradient(90deg, rgba(74,38,12,.14) 0 1px, transparent 1px), linear-gradient(0deg, rgba(74,38,12,.10) 0 1px, transparent 1px), radial-gradient(rgba(72,40,18,.30) 1px, transparent 1px), radial-gradient(rgba(255,245,215,.25) 1px, transparent 1px)',
                     backgroundSize: '46px 46px, 46px 46px, 8px 8px, 14px 14px',
                     backgroundPosition: '0 0, 0 0, 0 0, 5px 7px',
                     boxShadow: 'inset 0 0 0 4px rgba(255,255,255,.12), inset 0 0 32px rgba(65,34,12,.45), 0 22px 50px rgba(15,23,42,.22)'
                 }}>
            <div className="pointer-events-none absolute inset-[-14px] rounded-xl"
                 style={{ boxShadow: 'inset 0 0 0 3px rgba(255,220,160,.22), inset 0 0 18px rgba(0,0,0,.45)' }} />
            <div className="mb-4 flex items-center justify-between text-white drop-shadow">
                <h2 className="text-lg font-extrabold">Board {index + 1}</h2>
                <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-semibold">{notes.length}/{boardSize}</span>
            </div>
            <div className="grid gap-5 min-h-[720px]"
                 style={{
                     gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
                     gridTemplateRows: `repeat(${layout.rows}, minmax(160px, 1fr))`
                 }}>
                {loading && <div className="rounded bg-white/30 h-36 animate-pulse col-span-2" />}
                {notes.map(note => (
                    <PostIt key={note.id}
                            note={note}
                            onRemove={onRemove}
                            onExtend={onExtend}
                            onEdit={onEdit}
                            onViewReplies={onViewReplies}
                            shouldSuppressClick={shouldSuppressClick} />
                ))}
                {!loading && notes.length === 0 && (
                    <div className="col-span-full flex h-40 items-center justify-center rounded border border-dashed border-white/50 text-sm font-semibold text-white/80">
                        Empty board
                    </div>
                )}
            </div>
        </section>
    );
}

function PostIt({ note, onRemove, onExtend, onEdit, onViewReplies, shouldSuppressClick }) {
    const color = colorFor(note.color);
    const fontColor = fontColorFor(note.font_color);
    const fontSize = fontSizeFor(note.font_size);
    const nearExpiry = note.is_mine && note.days_until_expiry != null && note.days_until_expiry <= 7;
    const actionButtonStyle = { backgroundColor: 'rgba(255,255,255,0.72)', color: '#334155', borderColor: 'rgba(148,163,184,0.55)' };
    function openFromPostIt() {
        if (shouldSuppressClick?.()) return;
        onViewReplies(note);
    }

    return (
        <article className={`relative min-h-[160px] h-full rotate-[-1deg] rounded-sm border bg-gradient-to-br ${color.className} p-4 pt-8 shadow-xl`}
                 style={{
                     background: paperBackground(color),
                     borderColor: color.to,
                     boxShadow: '0 12px 18px rgba(30,20,10,.26), inset 0 -18px 24px rgba(255,255,255,.22)'
                 }}
                 role="button"
                 tabIndex={0}
                 onClick={openFromPostIt}
                 onKeyDown={e => {
                     if (e.key === 'Enter' || e.key === ' ') {
                         e.preventDefault();
                         openFromPostIt();
                     }
                 }}>
            <span className="absolute left-1/2 top-[-7px] h-7 w-7 -translate-x-1/2 rounded-full bg-gradient-to-br from-red-400 to-red-700 shadow-lg ring-2 ring-red-900/30">
                <span className="absolute left-1/2 top-[18px] h-6 w-1 -translate-x-1/2 rotate-12 rounded-full bg-slate-500 shadow" />
                <span className="absolute left-[7px] top-[6px] h-2 w-2 rounded-full bg-white/60" />
            </span>
            <div className={`post-it-content break-words ${fontSize.className} font-bold leading-relaxed`}
                 style={{ color: fontColor.hex }}
                 dangerouslySetInnerHTML={{ __html: note.content || '' }} />
            <div className="mt-4 flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-600"
                 style={{ color: '#475569' }}>
                <span className="inline-flex items-center gap-1">
                    <ClockIcon className="w-3 h-3" /> {formatDate(note.expires_at)}
                </span>
                {nearExpiry && (
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-amber-700"
                          style={{ backgroundColor: 'rgba(255,255,255,0.70)', color: '#b45309' }}>
                        Soon
                    </span>
                )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
                <button className="btn-ghost post-it-action-button !py-1 !px-2 text-xs"
                        style={actionButtonStyle}
                        onClick={e => {
                            e.stopPropagation();
                            onViewReplies(note);
                        }}>
                    <ChatBubbleLeftRightIcon className="w-4 h-4" />
                    View Reply{Number(note.reply_count || 0) > 0 ? ` (${note.reply_count})` : ''}
                </button>
                {note.is_mine && (
                    <>
                    <button className="btn-ghost post-it-action-button !py-1 !px-2" style={actionButtonStyle} title="Edit" onClick={e => { e.stopPropagation(); onEdit(note); }}>
                        <PencilSquareIcon className="w-4 h-4" />
                    </button>
                    <button className="btn-ghost post-it-action-button !py-1 !px-2 text-xs" style={actionButtonStyle} onClick={e => { e.stopPropagation(); onExtend(note); }}>
                        Extend
                    </button>
                    <button className="btn-ghost post-it-action-button !py-1 !px-2" style={actionButtonStyle} title="Remove" onClick={e => { e.stopPropagation(); onRemove(note); }}>
                        <TrashIcon className="w-4 h-4" />
                    </button>
                    </>
                )}
            </div>
        </article>
    );
}

function ReplyModal({ data, loading, replyText, saving, onReplyText, onSubmit, onClose }) {
    if (!data) return null;
    const note = data.note || {};
    const replies = data.replies || [];
    const color = colorFor(note.color);
    const fontColor = fontColorFor(note.font_color);
    const fontSize = fontSizeFor(note.font_size);

    return (
        <Modal open={!!data} onClose={onClose} title="Post-It Replies" size="xl"
               footer={(
                   <>
                       <button className="btn-ghost" onClick={onClose}>Close</button>
                       <button className="btn-primary" onClick={onSubmit} disabled={saving || loading}>
                           <PaperAirplaneIcon className="w-4 h-4" /> Reply
                       </button>
                   </>
               )}>
            <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.9fr)_minmax(320px,1.1fr)]">
                <div className={`relative min-h-[260px] rounded-sm border p-6 pt-10 shadow-xl ${color.className}`}
                     style={{
                         background: paperBackground(color),
                         borderColor: color.to,
                         boxShadow: '0 14px 24px rgba(30,20,10,.22), inset 0 -22px 30px rgba(255,255,255,.22)'
                     }}>
                    <span className="absolute left-1/2 top-[-7px] h-8 w-8 -translate-x-1/2 rounded-full bg-gradient-to-br from-red-400 to-red-700 shadow-lg ring-2 ring-red-900/30">
                        <span className="absolute left-1/2 top-[20px] h-7 w-1 -translate-x-1/2 rotate-12 rounded-full bg-slate-500 shadow" />
                        <span className="absolute left-[8px] top-[7px] h-2.5 w-2.5 rounded-full bg-white/60" />
                    </span>
                    <div className={`post-it-content break-words ${fontSize.className} font-bold leading-relaxed`}
                         style={{ color: fontColor.hex }}
                         dangerouslySetInnerHTML={{ __html: note.content || '' }} />
                    <div className="mt-5 text-xs font-semibold" style={{ color: '#475569' }}>
                        Expires {formatDate(note.expires_at)}
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-800">Replies</h4>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                            {replies.length}
                        </span>
                    </div>
                    <div className="max-h-[330px] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                        {loading && <div className="text-sm font-semibold text-slate-500">Loading replies...</div>}
                        {!loading && replies.length === 0 && (
                            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-sm font-semibold text-slate-500">
                                No replies yet
                            </div>
                        )}
                        {!loading && replies.map(reply => (
                            <div key={reply.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                                <div className="whitespace-pre-wrap break-words text-sm font-semibold text-slate-800">
                                    {reply.content}
                                </div>
                                <div className="mt-2 text-[11px] font-semibold text-slate-500">
                                    {formatDate(reply.created_at)}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div>
                        <textarea className="input min-h-[110px]"
                                  value={replyText}
                                  maxLength={1000}
                                  onChange={e => onReplyText(e.target.value)}
                                  placeholder="Write an anonymous reply..." />
                        <div className="mt-1 text-right text-xs font-semibold text-slate-500">
                            {replyText.length}/1000
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
