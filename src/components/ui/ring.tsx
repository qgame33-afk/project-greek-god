"use client";

import { Check, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type RingSize = "xl" | "lg" | "md" | "sm" | "xs";
/** @deprecated Rings have no colours any more (§1.4.4); the tone is ignored. */
export type RingTone = "gold" | "marble" | "terracotta" | "porphyry" | "lapis" | "verdigris" | "success";

const SIZES: Record<RingSize, { d: number; s: number }> = {
  xl: { d: 240, s: 14 },
  lg: { d: 112, s: 11 },
  md: { d: 64, s: 7 },
  sm: { d: 52, s: 5 },
  xs: { d: 28, s: 3.5 },
};

/**
 * The ring (docs/DESIGN-V3-SIMPLE.md §1.4.4): round caps, starting at 12 o'clock, --text progress
 * on --track, one centred Lucide glyph in --text (no macro colours). At its goal (`goal`) the
 * stroke and glyph turn --gold and the glyph becomes `Check`. It fills with stroke-dashoffset over
 * 600 ms on first paint and on change (drawn at its value under reduced motion).
 *
 *   <Ring value={0.57} size="lg" icon={Flame} label="1,887 of 3,300 calories" />
 *   <Ring value={1} size="md" icon={Drumstick} goal label="Protein goal done" />
 */
export interface RingProps {
  /** 0–1 (clamped; over 1 draws a full ring). */
  value: number;
  size?: RingSize;
  /** Diameter in px (overrides the preset's, keeps its stroke unless `stroke` is set). */
  diameter?: number;
  stroke?: number;
  /** The centred glyph: a Lucide icon. */
  icon?: LucideIcon;
  /** At its goal: gold stroke and a gold Check. */
  goal?: boolean;
  /** @deprecated ignored */
  tone?: RingTone;
  /** VoiceOver label, e.g. "Protein 142 of 185 grams". Omit when the surrounding button names it. */
  label?: string;
  /** ms before the first fill. */
  delay?: number;
  /** Custom centre content (instead of `icon`). */
  children?: ReactNode;
  className?: string;
  /** @deprecated ignored */
  plain?: boolean;
}

export function Ring({ value, size = "md", diameter, stroke: strokeProp, icon: Icon, goal, label, delay = 0, children, className }: RingProps) {
  const preset = SIZES[size];
  const d = diameter ?? preset.d;
  const stroke = strokeProp ?? preset.s;
  const r = (d - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

  // Empty on the first frame, then fill to the value; later changes move from the old value.
  const [shown, setShown] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(v), first.current ? delay + 30 : 0);
    first.current = false;
    return () => window.clearTimeout(t);
  }, [v, delay]);

  const color = goal ? "var(--gold)" : "var(--text)";
  const glyph = Math.round(d >= 100 ? 28 : d >= 56 ? 20 : 16);
  const Glyph = goal ? Check : Icon;
  return (
    <div
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: d, height: d }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={d / 2} cy={d / 2} r={r} fill="none" style={{ stroke: "var(--track)" }} strokeWidth={stroke} />
        <circle
          cx={d / 2}
          cy={d / 2}
          r={r}
          fill="none"
          style={{ stroke: color, transition: "stroke-dashoffset var(--dur-ring) var(--ease-out), stroke var(--dur-base) var(--ease-out)" }}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          opacity={shown > 0.001 ? 1 : 0}
        />
      </svg>
      {children ? (
        <div className="relative flex flex-col items-center justify-center text-center">{children}</div>
      ) : Glyph ? (
        <Glyph className="relative" style={{ width: glyph, height: glyph, color }} strokeWidth={glyph <= 16 ? 2.2 : 1.9} aria-hidden />
      ) : null}
    </div>
  );
}
