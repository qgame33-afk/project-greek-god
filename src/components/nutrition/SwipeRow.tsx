"use client";

import { useRef, useState, type ReactNode } from "react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/cn";

const REVEAL = 144; // two 72px actions

/**
 * Touch row: swipe left (or long-press) to reveal actions; tap opens. Mouse and keyboard
 * users get the same actions in the sheet that `onTap` opens.
 */
export function SwipeRow({
  open,
  onOpenChange,
  onTap,
  actions,
  children,
  label,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTap: () => void;
  actions: ReactNode;
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const drag = useRef<{ x: number; y: number; off: number; lock: "x" | "y" | null; timer: number | null } | null>(null);
  const suppressClick = useRef(false);
  const [live, setLive] = useState<number | null>(null);
  const base = open ? -REVEAL : 0;
  const offset = live ?? base;

  const clearTimer = () => {
    const d = drag.current;
    if (d?.timer) window.clearTimeout(d.timer);
    if (d) d.timer = null;
  };

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: REVEAL }} inert={!open || undefined} aria-hidden={!open}>
        {actions}
      </div>
      <button
        type="button"
        aria-label={label}
        className="relative z-[1] block w-full bg-s1 text-left [touch-action:pan-y] [-webkit-touch-callout:none] select-none"
        style={{
          transform: `translate3d(${offset}px,0,0)`,
          transition: live == null ? "transform 240ms var(--ease-out)" : "none",
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          const d = { x: e.clientX, y: e.clientY, off: base, lock: null as "x" | "y" | null, timer: null as number | null };
          d.timer = window.setTimeout(() => {
            if (drag.current === d && d.lock == null) {
              suppressClick.current = true;
              haptic(12);
              onOpenChange(true);
              drag.current = null;
            }
          }, 480);
          drag.current = d;
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const mx = e.clientX - d.x;
          const my = e.clientY - d.y;
          if (!d.lock && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
            d.lock = Math.abs(mx) > Math.abs(my) ? "x" : "y";
            clearTimer();
          }
          if (d.lock === "x") {
            const raw = base + mx;
            d.off = raw > 0 ? 0 : raw < -REVEAL ? -REVEAL - (Math.abs(raw) - REVEAL) * 0.25 : raw;
            setLive(d.off);
          }
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          clearTimer();
          if (d.lock === "x") {
            suppressClick.current = true;
            setLive(null);
            const shouldOpen = d.off < -REVEAL / 2;
            if (shouldOpen !== open) onOpenChange(shouldOpen);
          }
        }}
        onPointerCancel={() => {
          clearTimer();
          drag.current = null;
          setLive(null);
        }}
        onContextMenu={(e) => {
          if (drag.current || suppressClick.current) e.preventDefault();
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (open) {
            onOpenChange(false);
            return;
          }
          onTap();
        }}
      >
        {children}
      </button>
    </div>
  );
}

export function RowAction({ onClick, children, tone = "neutral", label }: { onClick: () => void; children: ReactNode; tone?: "neutral" | "danger"; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-full w-[72px] flex-col items-center justify-center gap-1 text-[12px] font-bold",
        tone === "danger" ? "bg-danger-tint text-danger" : "bg-s4 text-fg",
      )}
    >
      {children}
    </button>
  );
}
