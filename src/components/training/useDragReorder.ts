"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

/**
 * Drag a list row by its handle (docs/DESIGN-V3-SIMPLE.md §4.3.6, §4.3.12): the row follows the
 * finger and drops on the row it is over. Up and down buttons stay beside it for one thumb and
 * VoiceOver; this is never the only way to reorder.
 *
 *   const drag = useDragReorder(list.length, (from, to) => move(from, to));
 *   <li style={drag.style(i)}><span {...drag.handle(i)} /></li>
 */
export function useDragReorder(count: number, onMove: (from: number, to: number) => void) {
  const start = useRef<{ i: number; y0: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ i: number; dy: number } | null>(null);
  const end = (e: PointerEvent<HTMLElement> | null) => {
    const s = start.current;
    start.current = null;
    setDrag(null);
    if (!s || !e) return;
    const to = Math.max(0, Math.min(count - 1, s.i + Math.round((e.clientY - s.y0) / s.h)));
    if (to !== s.i) onMove(s.i, to);
  };
  return {
    dragging: drag?.i ?? null,
    handle: (i: number) => ({
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        const row = e.currentTarget.closest("li");
        start.current = { i, y0: e.clientY, h: row?.getBoundingClientRect().height ?? 64 };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ i, dy: 0 });
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (start.current) setDrag({ i: start.current.i, dy: e.clientY - start.current.y0 });
      },
      onPointerUp: (e: PointerEvent<HTMLElement>) => end(e),
      onPointerCancel: () => end(null),
      "aria-hidden": true as const,
      className: "grid size-11 shrink-0 cursor-grab touch-none place-items-center text-fg-3",
    }),
    style: (i: number): CSSProperties | undefined => (drag?.i === i ? { transform: `translateY(${drag.dy}px)`, position: "relative", zIndex: 10 } : undefined),
  };
}
