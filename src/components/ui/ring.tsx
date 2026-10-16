"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type RingSize = "xl" | "lg" | "md" | "sm" | "xs";
export type RingTone = "gold" | "marble" | "terracotta" | "porphyry" | "lapis" | "verdigris" | "success";

const SIZES: Record<RingSize, { d: number; s: number; flute: boolean }> = {
  xl: { d: 240, s: 14, flute: true },
  lg: { d: 136, s: 11, flute: true },
  md: { d: 72, s: 7, flute: false },
  sm: { d: 52, s: 5, flute: false },
  xs: { d: 28, s: 3.5, flute: false },
};

const TONE: Record<Exclude<RingTone, "gold">, string> = {
  marble: "var(--s-marble)",
  terracotta: "var(--s-terracotta)",
  porphyry: "var(--s-porphyry)",
  lapis: "var(--s-lapis)",
  verdigris: "var(--s-verdigris)",
  success: "var(--success)",
};

export interface RingProps {
  /** 0–1+, values above 1 draw an overflow arc. */
  value: number;
  size?: RingSize;
  /** Custom diameter in px (overrides the preset's diameter, keeps its stroke). */
  diameter?: number;
  tone?: RingTone;
  label: string; // accessible label, e.g. "Protein 142 of 185 grams"
  delay?: number; // ms, for staggering on mount
  children?: ReactNode;
  className?: string;
  /** Hide the end-cap glow (used for tiny rings). */
  plain?: boolean;
}

export function Ring({ value, size = "md", diameter, tone = "gold", label, delay = 0, children, className, plain }: RingProps) {
  const id = useId().replace(/:/g, "");
  const preset = SIZES[size];
  const d = diameter ?? preset.d;
  const stroke = preset.s;
  const flute = preset.flute;
  const pad = flute ? 7 : 0;
  const r = (d - stroke) / 2 - pad;
  const c = 2 * Math.PI * r;
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const main = Math.min(safe, 1);
  const over = Math.min(Math.max(safe - 1, 0), 1);

  // Animate from empty on first paint, then old → new on change (CSS transitions).
  const [shown, setShown] = useState(0);
  const [shownOver, setShownOver] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setShown(main);
      setShownOver(over);
    }, delay + 30);
    return () => window.clearTimeout(t);
  }, [main, over, delay]);

  const color = tone === "gold" ? `url(#g-${id})` : TONE[tone];
  const cx = d / 2;
  const showCap = !plain && size !== "xs" && shown > 0.02 && shown < 0.995;

  return (
    <div className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: d, height: d }} role="img" aria-label={label}>
      <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1={d} x2={d} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#A97E40" />
            <stop offset="55%" stopColor="#D5AC67" />
            <stop offset="100%" stopColor="#F3DDA8" />
          </linearGradient>
          <radialGradient id={`h-${id}`}>
            <stop offset="0%" stopColor={tone === "gold" ? "#F3DDA8" : "#ffffff"} stopOpacity=".55" />
            <stop offset="100%" stopColor={tone === "gold" ? "#D5AC67" : "#ffffff"} stopOpacity="0" />
          </radialGradient>
        </defs>

        {flute && (
          <>
            <path d={ticks(cx, r + stroke / 2 + 3, 3, (i) => i % 15 !== 0)} stroke="var(--line-hair)" strokeWidth={1} />
            <path d={ticks(cx, r + stroke / 2 + 3, 3, (i) => i % 15 === 0)} stroke="var(--gold-800)" strokeWidth={1} />
          </>
        )}

        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={color}
          strokeOpacity={tone === "gold" ? 1 : 0.92}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          style={{ transition: `stroke-dashoffset 900ms var(--ease-gold)` }}
          opacity={shown > 0.001 ? 1 : 0}
        />
        {over > 0 && (
          <circle
            cx={cx}
            cy={cx}
            r={r - stroke * 0.95}
            fill="none"
            stroke="var(--gold-200)"
            strokeOpacity={0.6}
            strokeWidth={Math.max(1.5, stroke * 0.45)}
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * (r - stroke * 0.95)}
            strokeDashoffset={2 * Math.PI * (r - stroke * 0.95) * (1 - shownOver)}
            style={{ transition: `stroke-dashoffset 700ms var(--ease-gold) 400ms` }}
          />
        )}
        {showCap && (
          <g style={{ transform: `rotate(${shown * 360}deg)`, transformOrigin: `${cx}px ${cx}px`, transition: "transform 900ms var(--ease-gold)" }}>
            <circle cx={cx + r} cy={cx} r={stroke * 1.5} fill={`url(#h-${id})`} />
            <circle cx={cx + r} cy={cx} r={stroke * 0.42} fill={tone === "gold" ? "var(--gold-50)" : "rgb(255 255 255 / .85)"} />
          </g>
        )}
      </svg>
      {children && <div className="relative z-10 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}

function ticks(c: number, r1: number, len: number, include: (i: number) => boolean) {
  let d = "";
  for (let i = 0; i < 60; i++) {
    if (!include(i)) continue;
    const a = (i / 60) * Math.PI * 2;
    const x1 = c + r1 * Math.cos(a), y1 = c + r1 * Math.sin(a);
    const x2 = c + (r1 + len) * Math.cos(a), y2 = c + (r1 + len) * Math.sin(a);
    d += `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  return d;
}
