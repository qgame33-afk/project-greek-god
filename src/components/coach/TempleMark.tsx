"use client";

import { m } from "motion/react";
import { cn } from "@/lib/cn";

// DESIGN §5.10 temple mark (24×24, stroke 1.5): pediment, architrave, stylobate and three
// columns. Used as the coach avatar, the thinking loader and the empty-state glyph.

const ROOF = "M2 9 12 3l10 6";
const BEAM = "M3 11h18";
const BASE = "M2 21h20";
const COLS = [6, 12, 18];

export function TempleMark({ size = 24, className, strokeWidth = 1.5 }: { size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ROOF} />
      <path d={BEAM} />
      {COLS.map((x) => (
        <path key={x} d={`M${x} 13v6`} />
      ))}
      <path d={BASE} />
    </svg>
  );
}

/** 28px avatar disc for assistant messages. `thinking` animates the columns (the loader). */
export function CoachAvatar({ thinking = false, className }: { thinking?: boolean; className?: string }) {
  return (
    <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border border-line-gold bg-s2 text-gold-300", className)} aria-hidden>
      {thinking ? <TempleLoader size={16} /> : <TempleMark size={16} strokeWidth={1.6} />}
    </span>
  );
}

/** Columns rise 0.3 → 1, staggered 90 ms (DESIGN §5.10). Static under reduced motion. */
export function TempleLoader({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ROOF} />
      <path d={BEAM} />
      {COLS.map((x, i) => (
        <m.path
          key={x}
          d={`M${x} 13v6`}
          style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
          initial={{ scaleY: 0.3 }}
          animate={{ scaleY: [0.3, 1, 0.3] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.09 }}
        />
      ))}
      <path d={BASE} />
    </svg>
  );
}

/** 56px empty-state glyph: 1.25px gold-600 strokes with one gold-300 accent (the pediment). */
export function TempleGlyph({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <g stroke="var(--gold-600)" strokeWidth={0.55}>
        <path d={BEAM} />
        {COLS.map((x) => (
          <path key={x} d={`M${x} 13v6`} />
        ))}
        <path d={BASE} />
      </g>
      <path d={ROOF} stroke="var(--gold-300)" strokeWidth={0.6} />
    </svg>
  );
}
