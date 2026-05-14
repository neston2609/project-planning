import { useRef, useState } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import Modal from './Modal';
import {
    DocumentArrowUpIcon, ArrowUpTrayIcon, TrashIcon,
    CheckCircleIcon, ExclamationCircleIcon
} from '@heroicons/react/24/outline';

/**
 * Import License rows from a PDF Certificate.
 *
 * Flow:
 *  1. Admin picks a PDF file → it's read in the browser as base64.
 *  2. POST /api/licenses/parse-pdf returns { detected_customer, rows: [...] }.
 *  3. Show each parsed row as an editable form line with an include checkbox.
 *  4. Admin reviews / edits / unchecks bad rows → "Import N licenses".
 *  5. POST /api/licenses/bulk inserts in a single transaction.
 *
 * Props:
 *  - customerId: the customer the licenses will be attached to
 *  - customerAlias: display label
 *  - onClose: () => void
 *  - onImported: () => void  (fires after a successful bulk insert; parent
 *    should refresh its license list)
 */
export default function ImportLicensePdfModal({
    customerId, customerAlias, onClose, onImported
}) {
    const [stage, setStage] = useState('pick');   // 'pick' | 'parsing' | 'review' | 'saving'
    const [fileName, setFileName] = useState('');
    const [parsedRows, setParsedRows] = useState([]);
    const [detectedCustomer, setDetectedCustomer] = useState('');
    const [error, setError] = useState('');
    const fileRef = useRef(null);

    function pick() { fileRef.current?.click(); }

    async function onFile(e) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            return toast.error('Please choose a PDF file.');
        }
        // 10 MB cap (≈14 MB base64) — backend also validates.
        if (file.size > 10 * 1024 * 1024) {
            return toast.error('PDF must be 10 MB or smaller.');
        }

        setFileName(file.name);
        setStage('parsing');
        setError('');

        try {
            const dataUrl = await readAsDataURL(file);
            const r = await api.post('/licenses/parse-pdf', { file_base64: dataUrl });
            const rows = (r.data?.rows || []).map(row => ({
                include: true,
                license_name:  row.license_name  || '',
                vendor:        row.vendor        || '',
                quantity:      row.quantity     ?? 1,
                license_key:   row.license_key   || '',
                start_date:    row.start_date    || '',
                expired_date:  row.end_date || row.expired_date || '',
                note:          ''
            }));
            setParsedRows(rows);
            setDetectedCustomer(r.data?.detected_customer || '');
            if (rows.length === 0) {
                setError('No license rows were detected in this PDF. The format may not be supported.');
            }
            setStage('review');
        } catch (err) {
            console.error('[ImportLicensePdfModal] parse failed', err);
            const msg = err.response?.data?.error || 'Failed to parse PDF';
            setError(msg);
            toast.error(msg);
            setStage('pick');
        }
    }

    function updateRow(i, patch) {
        setParsedRows(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
    }
    function removeRow(i) {
        setParsedRows(rows => rows.filter((_, idx) => idx !== i));
    }
    function toggleAll(include) {
        setParsedRows(rows => rows.map(r => ({ ...r, include })));
    }

    const selected   = parsedRows.filter(r => r.include);
    const canImport  = stage === 'review' && selected.length > 0;

    async function doImport() {
        if (!canImport) return;
        setStage('saving');
        try {
            const payload = {
                customer_id: customerId,
                licenses: selected.map(r => ({
                    license_name: r.license_name,
                    vendor:       r.vendor,
                    quantity:     Number(r.quantity) || 0,
                    license_key:  r.license_key,
                    note:         r.note,
                    start_date:   r.start_date   || null,
                    expired_date: r.expired_date || null
                }))
            };
            const r = await api.post('/licenses/bulk', payload);
            toast.success(`Imported ${r.data.inserted} license${r.data.inserted === 1 ? '' : 's'}`);
            onImported?.();
        } catch (err) {
            console.error('[ImportLicensePdfModal] bulk failed', err);
            toast.error(err.response?.data?.error || 'Import failed');
            setStage('review');
        }
    }

    return (
        <Modal open onClose={onClose} size="xl"
               title={`Import License PDF — ${customerAlias || ''}`}
               footer={stage === 'review' && (
                   <>
                       <button className="btn-ghost" onClick={onClose}>Cancel</button>
                       <button className="btn-primary" disabled={!canImport} onClick={doImport}>
                           <ArrowUpTrayIcon className="w-4 h-4" />
                           Import {selected.length} license{selected.length === 1 ? '' : 's'}
                       </button>
                   </>
               )}>

            {/* ----- File picker stage ----- */}
            {(stage === 'pick' || stage === 'parsing') && (
                <div className="space-y-4">
                    <div className="rounded-xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-indigo-400 transition cursor-pointer"
                         onClick={pick}>
                        <DocumentArrowUpIcon className="w-12 h-12 mx-auto text-slate-400" />
                        <p className="mt-3 text-sm text-slate-600">
                            {fileName ? <>Selected: <strong>{fileName}</strong></> : 'Click to choose a License Certificate PDF'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">PDF only · max 10 MB</p>
                        <input ref={fileRef} type="file" accept="application/pdf,.pdf"
                               className="hidden" onChange={onFile} />
                    </div>
                    {stage === 'parsing' && (
                        <div className="text-sm text-slate-500 text-center animate-pulse">Parsing PDF…</div>
                    )}
                    {error && (
                        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
                            <ExclamationCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}
                    <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                        Supported: UiPath License Certificate (table with Quantity / Product Name / Start Date / End Date / License Key columns).
                        Other formats may not parse correctly — admin can always edit each row before saving.
                    </div>
                </div>
            )}

            {/* ----- Review stage ----- */}
            {stage === 'review' && (
                <div className="space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 flex items-start gap-2 flex-1 min-w-[280px]">
                            <CheckCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                                Parsed <strong>{parsedRows.length}</strong> license row{parsedRows.length === 1 ? '' : 's'} from <code className="font-mono">{fileName}</code>.
                                {detectedCustomer && (
                                    <> Detected customer in PDF: <strong>{detectedCustomer}</strong> (rows will be saved to <strong>{customerAlias}</strong>).</>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button className="btn-ghost" onClick={() => toggleAll(true)}>Select all</button>
                            <button className="btn-ghost" onClick={() => toggleAll(false)}>Deselect all</button>
                            <button className="btn-ghost" onClick={pick}>Pick another PDF…</button>
                        </div>
                    </div>

                    {parsedRows.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">No rows parsed. Try a different PDF.</p>
                    ) : (
                        <div className="space-y-2">
                            {parsedRows.map((row, i) => (
                                <div key={i}
                                     className={`grid grid-cols-12 gap-2 p-3 rounded-xl border transition ${
                                         row.include
                                             ? 'border-slate-200 bg-white'
                                             : 'border-slate-100 bg-slate-50/60 opacity-60'
                                     }`}>
                                    <div className="col-span-12 flex items-center gap-3">
                                        <label className="flex items-center gap-2 text-xs">
                                            <input type="checkbox" checked={row.include}
                                                   onChange={e => updateRow(i, { include: e.target.checked })} />
                                            <span className="font-bold">#{i + 1}</span>
                                        </label>
                                        <span className="text-xs text-slate-400">— uncheck to skip this row</span>
                                        <button type="button" className="btn-ghost ml-auto text-red-500"
                                                onClick={() => removeRow(i)}>
                                            <TrashIcon className="w-4 h-4" /> Remove
                                        </button>
                                    </div>
                                    <div className="col-span-12 md:col-span-6">
                                        <label className="label">License Name</label>
                                        <input className="input" value={row.license_name}
                                               onChange={e => updateRow(i, { license_name: e.target.value })} />
                                    </div>
                                    <div className="col-span-6 md:col-span-3">
                                        <label className="label">Vendor</label>
                                        <input className="input" value={row.vendor}
                                               onChange={e => updateRow(i, { vendor: e.target.value })} />
                                    </div>
                                    <div className="col-span-6 md:col-span-3">
                                        <label className="label">Quantity</label>
                                        <input type="number" min="0" className="input" value={row.quantity}
                                               onChange={e => updateRow(i, { quantity: e.target.value })} />
                                    </div>
                                    <div className="col-span-6">
                                        <label className="label">Start Date</label>
                                        <input type="date" className="input" value={row.start_date || ''}
                                               onChange={e => updateRow(i, { start_date: e.target.value })} />
                                    </div>
                                    <div className="col-span-6">
                                        <label className="label">Expired Date</label>
                                        <input type="date" className="input" value={row.expired_date || ''}
                                               onChange={e => updateRow(i, { expired_date: e.target.value })} />
                                    </div>
                                    <div className="col-span-12">
                                        <label className="label">License Key</label>
                                        <textarea className="input font-mono text-xs" rows={2}
                                                  value={row.license_key}
                                                  onChange={e => updateRow(i, { license_key: e.target.value })} />
                                    </div>
                                    <div className="col-span-12">
                                        <label className="label">Note</label>
                                        <input className="input" value={row.note}
                                               onChange={e => updateRow(i, { note: e.target.value })} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {stage === 'saving' && (
                <div className="text-sm text-slate-500 text-center animate-pulse py-10">Saving…</div>
            )}
        </Modal>
    );
}

function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
    });
}
