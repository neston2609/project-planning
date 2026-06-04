import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
    ArrowPathIcon, PlusIcon, TrashIcon, ClockIcon
} from '@heroicons/react/24/outline';
import api from '../api';

const BOARD_SIZE = 24;
const COLORS = [
    { value: 'yellow', label: 'Yellow', className: 'from-yellow-50 to-yellow-200 border-yellow-300', dot: 'bg-yellow-200' },
    { value: 'pink', label: 'Pink', className: 'from-rose-50 to-rose-200 border-rose-300', dot: 'bg-rose-200' },
    { value: 'blue', label: 'Blue', className: 'from-cyan-50 to-cyan-200 border-cyan-300', dot: 'bg-cyan-200' },
    { value: 'green', label: 'Green', className: 'from-emerald-50 to-emerald-200 border-emerald-300', dot: 'bg-emerald-200' },
    { value: 'purple', label: 'Purple', className: 'from-violet-50 to-violet-200 border-violet-300', dot: 'bg-violet-200' },
    { value: 'orange', label: 'Orange', className: 'from-orange-50 to-orange-200 border-orange-300', dot: 'bg-orange-200' }
];
const FONT_COLORS = [
    { value: 'slate', label: 'Black', className: 'text-slate-900', dot: 'bg-slate-900' },
    { value: 'blue', label: 'Blue', className: 'text-blue-900', dot: 'bg-blue-800' },
    { value: 'red', label: 'Red', className: 'text-red-900', dot: 'bg-red-700' },
    { value: 'green', label: 'Green', className: 'text-emerald-900', dot: 'bg-emerald-700' },
    { value: 'purple', label: 'Purple', className: 'text-violet-900', dot: 'bg-violet-800' },
    { value: 'brown', label: 'Brown', className: 'text-amber-950', dot: 'bg-amber-900' }
];
const FONT_SIZES = [
    { value: 'sm', label: 'S', className: 'text-xs' },
    { value: 'md', label: 'M', className: 'text-sm' },
    { value: 'lg', label: 'L', className: 'text-base' },
    { value: 'xl', label: 'XL', className: 'text-lg' }
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

function chunkBoards(notes) {
    const boards = [];
    for (let i = 0; i < notes.length; i += BOARD_SIZE) {
        boards.push(notes.slice(i, i + BOARD_SIZE));
    }
    if (boards.length === 0 || boards[boards.length - 1].length >= BOARD_SIZE) boards.push([]);
    return boards;
}

function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString();
}

export default function PostItBoard() {
    const [notes, setNotes] = useState([]);
    const [config, setConfig] = useState({ expiry_days: 30, expiring_soon_days: 7 });
    const [content, setContent] = useState('');
    const [color, setColor] = useState('yellow');
    const [fontColor, setFontColor] = useState('slate');
    const [fontSize, setFontSize] = useState('md');
    const [loading, setLoading] = useState(true);

    async function load() {
        setLoading(true);
        try {
            const res = await api.get('/post-its');
            setNotes(res.data.notes || []);
            setConfig(res.data.config || { expiry_days: 30, expiring_soon_days: 7 });
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
        try {
            await api.post('/post-its', { content: message, color, font_color: fontColor, font_size: fontSize });
            setContent('');
            toast.success('Post-It added');
            load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not add Post-It');
        }
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

    const boards = useMemo(() => chunkBoards(notes), [notes]);
    const remaining = BOARD_SIZE - (notes.length % BOARD_SIZE || BOARD_SIZE);

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
                <textarea className="input min-h-[90px]"
                          maxLength={500}
                          placeholder="Write a message for the board..."
                          value={content}
                          onChange={e => setContent(e.target.value)} />
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
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Font</span>
                        {FONT_COLORS.map(c => (
                            <button key={c.value}
                                    type="button"
                                    className={`w-8 h-8 rounded-full border-2 ${c.dot} ${fontColor === c.value ? 'border-slate-900 ring-2 ring-offset-2 ring-indigo-300' : 'border-white'}`}
                                    title={c.label}
                                    onClick={() => setFontColor(c.value)} />
                        ))}
                    </div>
                    <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
                        {FONT_SIZES.map(size => (
                            <button key={size.value}
                                    type="button"
                                    className={`h-8 px-3 text-xs font-bold ${fontSize === size.value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                                    onClick={() => setFontSize(size.value)}>
                                {size.label}
                            </button>
                        ))}
                    </div>
                    <span className="text-xs text-slate-500">{content.length}/500</span>
                    <span className="text-xs text-slate-500">
                        Expires after {config.expiry_days} day(s). Current board has {remaining} open spot(s).
                    </span>
                    <button className="btn-primary ml-auto" onClick={addNote}>
                        <PlusIcon className="w-4 h-4" /> Add Post-It
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto pb-3">
                <div className="flex gap-5 min-w-max">
                    {boards.map((boardNotes, idx) => (
                        <Board key={idx}
                               index={idx}
                               notes={boardNotes}
                               loading={loading && idx === 0}
                               onRemove={remove}
                               onExtend={extend} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function Board({ index, notes, loading, onRemove, onExtend }) {
    return (
        <section className="relative w-[980px] max-w-[calc(100vw-3rem)] shrink-0 rounded-xl border-[14px] border-amber-950/80 p-5 shadow-2xl"
                 style={{
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
                <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-semibold">{notes.length}/{BOARD_SIZE}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4 min-h-[560px] content-start">
                {loading && <div className="rounded bg-white/30 h-36 animate-pulse col-span-2" />}
                {notes.map(note => <PostIt key={note.id} note={note} onRemove={onRemove} onExtend={onExtend} />)}
                {!loading && notes.length === 0 && (
                    <div className="col-span-full flex h-40 items-center justify-center rounded border border-dashed border-white/50 text-sm font-semibold text-white/80">
                        Empty board
                    </div>
                )}
            </div>
        </section>
    );
}

function PostIt({ note, onRemove, onExtend }) {
    const color = colorFor(note.color);
    const fontColor = fontColorFor(note.font_color);
    const fontSize = fontSizeFor(note.font_size);
    const nearExpiry = note.is_mine && note.days_until_expiry != null && note.days_until_expiry <= 7;
    return (
        <article className={`relative min-h-[160px] rotate-[-1deg] rounded-sm border bg-gradient-to-br ${color.className} p-4 pt-8 shadow-xl`}
                 style={{ boxShadow: '0 12px 18px rgba(30,20,10,.26), inset 0 -18px 24px rgba(255,255,255,.22)' }}>
            <span className="absolute left-1/2 top-[-7px] h-7 w-7 -translate-x-1/2 rounded-full bg-gradient-to-br from-red-400 to-red-700 shadow-lg ring-2 ring-red-900/30">
                <span className="absolute left-1/2 top-[18px] h-6 w-1 -translate-x-1/2 rotate-12 rounded-full bg-slate-500 shadow" />
                <span className="absolute left-[7px] top-[6px] h-2 w-2 rounded-full bg-white/60" />
            </span>
            <p className={`whitespace-pre-wrap break-words ${fontSize.className} font-bold leading-relaxed ${fontColor.className}`}>
                {note.content}
            </p>
            <div className="mt-4 flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-600">
                <span className="inline-flex items-center gap-1">
                    <ClockIcon className="w-3 h-3" /> {formatDate(note.expires_at)}
                </span>
                {nearExpiry && <span className="rounded-full bg-white/70 px-2 py-0.5 text-amber-700">Soon</span>}
            </div>
            {note.is_mine && (
                <div className="mt-3 flex gap-1">
                    <button className="btn-ghost !bg-white/60 !py-1 !px-2 text-xs" onClick={() => onExtend(note)}>
                        Extend
                    </button>
                    <button className="btn-ghost !bg-white/60 !py-1 !px-2" title="Remove" onClick={() => onRemove(note)}>
                        <TrashIcon className="w-4 h-4 text-red-500" />
                    </button>
                </div>
            )}
        </article>
    );
}
