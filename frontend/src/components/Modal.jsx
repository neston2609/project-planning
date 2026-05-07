import { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;
    const sizeCls = size === 'lg' ? 'max-w-3xl' : size === 'xl' ? 'max-w-5xl' : 'max-w-lg';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
            <div className={`bg-white rounded-xl shadow-xl w-full ${sizeCls} max-h-[90vh] flex flex-col`}>
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <h3 className="font-semibold text-slate-800">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-4 overflow-y-auto">{children}</div>
                {footer && <div className="border-t border-slate-200 px-4 py-3 flex justify-end gap-2">{footer}</div>}
            </div>
        </div>
    );
}
