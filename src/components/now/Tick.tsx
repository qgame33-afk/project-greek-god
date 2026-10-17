"use client";

import { AnimatePresence, m } from "motion/react";
import { cn } from "@/lib/cn";
import { EASE } from "@/lib/motion";

/**
 * Tick (docs/DESIGN-V2.md §1.8.2): a number that changes in place rolls per digit — the old digit
 * lifts 40% and fades, the new one rises from +40% — in 180 ms on ease-gold. Only the digits that
 * changed move and the first render never animates. Reduced motion (MotionConfig) swaps at once.
 * Screen readers get the whole value once (`label`, or the text itself).
 */
export function Tick({ value, className, label }: { value: string; className?: string; label?: string }) {
  const chars = [...value];
  return (
    <span className={cn("relative inline-flex", className)}>
      <span className="sr-only">{label ?? value}</span>
      {chars.map((c, i) => (
        // keyed by position from the right, so 99.8 → 100.2 keeps the units aligned
        <span key={chars.length - i} aria-hidden className="relative inline-block overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span
              key={c}
              className="inline-block"
              initial={{ y: "40%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-40%", opacity: 0 }}
              transition={{ duration: 0.18, ease: [...EASE.gold] }}
            >
              {c}
            </m.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
