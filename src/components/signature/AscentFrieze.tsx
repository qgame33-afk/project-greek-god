"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

/**
 * The Ascent Frieze (DESIGN §6.3): a 14px meander for the whole programme. The hairline base
 * is the full timeline; a gold-400 copy covers the share already behind you, and a 7px gold-300
 * diamond marks today. `draw` animates the gold in over 1400ms (Dawn, first open of the day);
 * otherwise it renders settled. Only transforms and opacity animate.
 */
export interface AscentFriezeProps {
  /** Fraction of the programme already passed, 0–1. */
  elapsed: number;
  /** "OCT 2026" */
  startLabel: string;
  /** "AUG 2027" */
  endLabel: string;
  /** Override the centre caption (defaults to "N% of timeline"). */
  caption?: string;
  /** Play the 1400ms draw-in. */
  draw?: boolean;
  /** ms before the draw starts. */
  delay?: number;
  className?: string;
}

const UNIT_W = 12;
const UNIT_H = 8;
const HEIGHT = 14;
const SCALE = HEIGHT / UNIT_H; // 1.75 → each unit is 21px wide on screen
const noop = () => () => {};

/** One unit of the key: `M0 7.5H12M3 7.5V.5h7.5V5h-4V3`, offset along x. */
function friezePath(units: number) {
  let d = "";
  for (let i = 0; i < units; i++) {
    const o = i * UNIT_W;
    d += `M${o} 7.5H${o + UNIT_W}M${o + 3} 7.5V.5h7.5V5h-4V3`;
  }
  return d;
}

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function AscentFrieze({ elapsed, startLabel, endLabel, caption, draw = false, delay = 0, className }: AscentFriezeProps) {
  const e = Number.isFinite(elapsed) ? Math.min(1, Math.max(0, elapsed)) : 0;
  const box = useRef<HTMLDivElement>(null);
  const [units, setUnits] = useState(16);
  const reduced = useSyncExternalStore(noop, reducedMotion, () => false);
  const animate = draw && !reduced;
  const [shown, setShown] = useState(animate ? 0 : e);

  // Fit a whole number of units to the width so the key never looks stretched.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setUnits(Math.max(6, Math.round(el.clientWidth / (UNIT_W * SCALE))));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (shown === e) return;
    const t = window.setTimeout(() => setShown(e), animate ? delay : 0);
    return () => window.clearTimeout(t);
  }, [e, shown, animate, delay]);

  const d = friezePath(units);
  const vb = `0 0 ${units * UNIT_W} ${UNIT_H}`;
  const transition = animate ? "transform 1400ms var(--ease-gold)" : "transform 900ms var(--ease-gold)";
  const pct = Math.round(e * 100);

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={box}
        className="relative w-full"
        style={{ height: HEIGHT }}
        role="img"
        aria-label={`Programme timeline: ${pct} percent elapsed, from ${startLabel} to ${endLabel}.`}
      >
        <svg viewBox={vb} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
          <path d={d} fill="none" stroke="var(--line-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeLinecap="square" />
        </svg>
        {/* Gold copy, revealed left → right by a counter-translated clip (compositor only) */}
        <div aria-hidden className="pointer-events-none absolute inset-y-[-2px] left-0 right-0 overflow-hidden" style={{ transform: `translateX(${(shown - 1) * 100}%)`, transition }}>
          <div className="absolute inset-0" style={{ top: 2, bottom: 2, transform: `translateX(${(1 - shown) * 100}%)`, transition }}>
            <svg viewBox={vb} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
              <path d={d} fill="none" stroke="var(--gold-400)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" strokeLinecap="square" />
            </svg>
          </div>
        </div>
        {/* Today marker: a 7px gold-300 diamond, moved by transform inside its own clip */}
        <div aria-hidden className="pointer-events-none absolute -inset-x-[8px] -inset-y-[6px] overflow-hidden">
          <div className="absolute inset-y-0 left-[8px] right-[8px]" style={{ transform: `translateX(${shown * 100}%)`, transition }}>
            <span
              className="absolute left-0 top-1/2 -ml-[3.5px] -mt-[3.5px] size-[7px] rotate-45 bg-gold-300 shadow-[0_0_0_3px_var(--surface-1)]"
              style={{ opacity: animate && shown !== e ? 0 : 1, transition: animate ? "opacity 240ms ease 1150ms" : undefined }}
            />
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-fg-3">
        <span>{startLabel}</span>
        <span className="text-[11px] font-semibold normal-case tracking-normal text-fg-2">{caption ?? `${pct}% of timeline`}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}
