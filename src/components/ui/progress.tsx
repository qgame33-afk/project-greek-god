"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * The bar (docs/DESIGN-V3-SIMPLE.md §1.4.5): 8 px (4 px `thin`) --text fill on --track, radius
 * full. An optional `band={[lo, hi]}` (0–1 of the track) draws the target range as a --band
 * segment under the fill (Sets by muscle). It fills with scaleX over 600 ms on first paint and on
 * change. `tone` and `fluted` are kept for old callers and ignored.
 *
 *   <Bar value={0.1} label="10% of the way" />
 *   <Bar value={7 / 20} band={[8 / 20, 20 / 20]} thin />
 */
export function Bar({
  value,
  thin,
  band,
  className,
  label,
  delay = 0,
}: {
  value: number;
  thin?: boolean;
  /** The target range as fractions of the track, drawn under the fill. */
  band?: [number, number] | null;
  /** @deprecated ignored */
  tone?: string;
  /** @deprecated ignored */
  fluted?: boolean;
  className?: string;
  label?: string;
  delay?: number;
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const [shown, setShown] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(v), first.current ? delay + 30 : 0);
    first.current = false;
    return () => window.clearTimeout(t);
  }, [v, delay]);
  const lo = band ? Math.max(0, Math.min(1, band[0])) : 0;
  const hi = band ? Math.max(lo, Math.min(1, band[1])) : 0;
  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-full bg-track", thin ? "h-1" : "h-2", className)}
      role={label ? "progressbar" : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-valuenow={label ? Math.round(v * 100) : undefined}
      aria-hidden={label ? undefined : true}
    >
      {band && <div aria-hidden className="absolute inset-y-0 bg-band" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />}
      <div
        aria-hidden
        className="absolute inset-0 origin-left rounded-full bg-fg"
        style={{ transform: `scaleX(${shown})`, transition: "transform var(--dur-ring) var(--ease-out)" }}
      />
    </div>
  );
}
