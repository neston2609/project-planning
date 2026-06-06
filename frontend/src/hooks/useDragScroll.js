import { useRef } from 'react';

export default function useDragScroll() {
    const ref = useRef(null);
    const state = useRef({
        active: false,
        dragged: false,
        pointerId: null,
        startX: 0,
        scrollLeft: 0
    });

    function isInteractive(target) {
        return Boolean(target?.closest?.('button,a,input,select,textarea,summary,[role="button"]'));
    }

    function onPointerDown(event) {
        if (event.button !== 0 || isInteractive(event.target)) return;
        const el = ref.current;
        if (!el || el.scrollWidth <= el.clientWidth) return;
        state.current = {
            active: true,
            dragged: false,
            pointerId: event.pointerId,
            startX: event.clientX,
            scrollLeft: el.scrollLeft
        };
        el.classList.add('drag-scroll-active');
        el.setPointerCapture?.(event.pointerId);
    }

    function onPointerMove(event) {
        const el = ref.current;
        const s = state.current;
        if (!el || !s.active || s.pointerId !== event.pointerId) return;
        const dx = event.clientX - s.startX;
        if (Math.abs(dx) > 4) s.dragged = true;
        el.scrollLeft = s.scrollLeft - dx;
    }

    function endDrag(event) {
        const el = ref.current;
        const s = state.current;
        if (!el || !s.active || s.pointerId !== event.pointerId) return;
        el.classList.remove('drag-scroll-active');
        el.releasePointerCapture?.(event.pointerId);
        state.current.active = false;
        window.setTimeout(() => { state.current.dragged = false; }, 0);
    }

    function onClickCapture(event) {
        if (state.current.dragged) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    return {
        ref,
        dragScrollProps: {
            onPointerDown,
            onPointerMove,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            onClickCapture
        }
    };
}
