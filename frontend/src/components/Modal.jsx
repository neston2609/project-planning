import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';

/**
 * Modal — anchored to the TOP of the viewport (not center) so admins on long
 * pages don't have to scroll to find the popup. Renders through a portal on
 * document.body so its `position: fixed` always references the viewport,
 * regardless of any ancestor that has `transform`/`filter`/`perspective`
 * (which would otherwise create a containing block and break fixed
 * positioning — e.g. our fade-in animation on <main>).
 */
export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        // Lock background scroll while the modal is open so the page underneath
        // doesn't scroll under the user's pointer when they scroll the modal.
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, onClose]);

    if (!open) return null;
    const sizeCls = size === 'lg' ? 'max-w-3xl' : size === 'xl' ? 'max-w-5xl' : 'max-w-lg';

    // Click on the dimmed backdrop closes the modal; click inside the panel
    // does not (stopPropagation on the panel wrapper).
    function onBackdropClick(e) {
        if (e.target === e.currentTarget) onClose?.();
    }

    const node = (
        <div
            className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/50"
            onMouseDown={onBackdropClick}>
            {/* Anchor the panel near the top of the viewport. Top padding (~5vh)
                gives a little breathing room without pushing it offscreen, and
                bottom padding lets short modals breathe and tall modals scroll. */}
            <div className="min-h-full flex items-start justify-center px-4 pt-[5vh] pb-8">
                <div
                    className={`bg-white rounded-xl shadow-2xl w-full ${sizeCls} max-h-[90vh] flex flex-col`}
                    onMouseDown={(e) => e.stopPropagation()}>
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
        </div>
    );

    return createPortal(node, document.body);
}
