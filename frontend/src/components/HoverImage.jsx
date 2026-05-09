import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Wraps a thumbnail (passed as children) and shows a larger floating preview
 * of `previewSrc` while the user hovers over it.
 *
 *   <HoverImage previewSrc={url} previewAlt="…" previewSize={320}>
 *       <img className="w-10 h-10 ..." src={thumbnail} />
 *   </HoverImage>
 *
 * - If `previewSrc` is empty/falsy, hover behavior is disabled and the
 *   children render as-is (so callers can pass a fallback initials block).
 * - The preview is rendered via a portal on document.body, so it isn't
 *   clipped by overflow:hidden parents (table rows, cards, etc.).
 * - Position auto-flips to the left when there isn't room on the right.
 */
export default function HoverImage({
    previewSrc,
    previewAlt = '',
    previewSize = 320,
    children,
    className = ''
}) {
    const [hover, setHover] = useState(false);
    const [pos, setPos]     = useState({ x: 0, y: 0 });
    const ref = useRef(null);

    function show() {
        if (!previewSrc || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const margin = 8;
        // Default: anchor to the right edge of the thumbnail, vertically centered.
        let x = rect.right + 12;
        let y = rect.top + rect.height / 2 - previewSize / 2;
        // Flip to left side if not enough room on the right.
        if (x + previewSize > window.innerWidth - margin) {
            x = rect.left - previewSize - 12;
        }
        // Clamp to viewport.
        if (x < margin) x = margin;
        if (y < margin) y = margin;
        if (y + previewSize > window.innerHeight - margin) {
            y = window.innerHeight - previewSize - margin;
        }
        setPos({ x, y });
        setHover(true);
    }
    function hide() { setHover(false); }

    return (
        <>
            <span ref={ref}
                  onMouseEnter={show}
                  onMouseLeave={hide}
                  className={`inline-block align-middle ${previewSrc ? 'cursor-zoom-in' : ''} ${className}`}>
                {children}
            </span>

            {hover && previewSrc && createPortal(
                <div
                    className="fixed z-[100] pointer-events-none rounded-xl shadow-2xl border-2 border-white bg-white"
                    style={{ left: pos.x, top: pos.y, width: previewSize, height: previewSize }}>
                    <img src={previewSrc} alt={previewAlt}
                         className="w-full h-full object-contain rounded-xl bg-slate-50" />
                </div>,
                document.body
            )}
        </>
    );
}
