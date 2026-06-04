import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
    ArrowPathIcon, PlusIcon, TrashIcon, ClockIcon
} from '@heroicons/react/24/outline';
import api from '../api';

const BOARD_SIZE = 24;
const COLORS = [
    { value: 'yellow', className: 'from-yellow-100 to-yellow-300 border-yellow-300', dot: 'bg-yellow-300' },
    { value: 'pink', className: 'from-pink-100 to-pink-300 border-pink-300', dot: 'bg-pink-300' },
    { value: 'blue', className: 'from-sky-100 to-sky-300 border-sky-300', dot: 'bg-sky-300' },
    { value: 'green', className: 'from-lime-100 to-lime-300 border-lime-300', dot: 'bg-lime-300' },
    { value: 'purple', className: 'from-violet-100 to-violet-300 border-violet-300', dot: 'bg-violet-300' },
    { value: 'orange', className: 'from-orange-100 to-orange-300 border-orange-300', dot: 'bg-orange-300' }
];

function colorFor(value) {
    return COLORS.find(c => c.value === value) || COLORS[0];
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
            await api.post('/post-its', { content: message, color });
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
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        {COLORS.map(c => (
                            <button key={c.value}
                                    type="button"
                                    className={`w-8 h-8 rounded-full border-2 ${c.dot} ${color === c.value ? 'border-slate-900 ring-2 ring-offset-2 ring-indigo-300' : 'border-white'}`}
                                    title={c.value}
                                    onClick={() => setColor(c.value)} />
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
        <section className="w-[980px] max-w-[calc(100vw-3rem)] shrink-0 rounded-lg border border-amber-900/30 p-5 shadow-inner"
                 style={{
                     backgroundColor: '#b88952',
                     backgroundImage: 'radial-gradient(rgba(80,45,20,.22) 1px, transparent 1px), radial-gradient(rgba(255,255,255,.18) 1px, transparent 1px)',
                     backgroundSize: '9px 9px, 13px 13px',
                     backgroundPosition: '0 0, 4px 6px'
                 }}>
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
    const nearExpiry = note.is_mine && note.days_until_expiry != null && note.days_until_expiry <= 7;
    return (
        <article className={`relative min-h-[150px] rotate-[-1deg] rounded-sm border bg-gradient-to-br ${color.className} p-4 pt-6 shadow-lg`}>
            <span className="absolute left-1/2 top-1 h-4 w-4 -translate-x-1/2 rounded-full bg-red-500 shadow ring-2 ring-red-700/30" />
            <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-slate-800">
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
