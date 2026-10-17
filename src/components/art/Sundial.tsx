"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The Sundial (docs/DESIGN-V2.md §3.2.1, §1.8.2): Gym Mode's rest dial — a 180° arc with bezel ticks
 * every 15 s that drains linearly while the rest runs. Pure CSS animation (stroke-dashoffset on a
 * pathLength-100 arc) started with a negative delay of the elapsed seconds, so only the digits
 * re-render each second. It keeps draining under reduced motion (it carries information).
 *
 *   <Sundial rest={{ total: 120, elapsed: 48, key: startSec }} final={rem <= 10}>
 *     <span className="t-timer">1:12</span>
 *   </Sundial>
 *
 * `variant="bar"` is the AX layout: a 6 px linear bar (digits go below it, from the caller).
 * Cooking-mode timers reuse it at a smaller `width`.
 */
export interface SundialRest {
  /** Total rest in seconds. */
  total: number;
  /** Seconds already rested. */
  elapsed: number;
  paused?: boolean;
  /** Changes whenever the rest restarts or is adjusted (e.g. startSec + total), to restart the drain. */
  key?: string | number;
}

export interface SundialProps {
  /** null = idle (no rest running): the bezel and track only. */
  rest: SundialRest | null;
  /** The last 10 seconds: the arc brightens and gains a leaf outer stroke. */
  final?: boolean;
  variant?: "arc" | "bar";
  /** Width in px (the arc is about half as tall). Default: the container's width, up to 400 px —
   *  the 96–120 px digits need a wide arc to sit inside it. */
  width?: number;
  /** VoiceOver label for the dial. */
  label?: string;
  /** The digits, centred in the dial. */
  children?: ReactNode;
  className?: string;
}

const CX = 100;
const CY = 100;
const R = 86;

function arcPoint(f: number, r = R) {
  const a = Math.PI + f * Math.PI;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function arcPath(r = R) {
  const a = arcPoint(0, r);
  const b = arcPoint(1, r);
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)}A${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function bezel(total: number) {
  // one tick per 15 s (≤ 60), a longer one each minute
  const n = Math.max(1, Math.min(60, Math.round(total / 15)));
  let minor = "";
  let major = "";
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const sec = Math.round(f * total);
    const long = sec % 60 === 0;
    const p1 = arcPoint(f, R + 7);
    const p2 = arcPoint(f, R + (long ? 14 : 11));
    const seg = `M${p1.x.toFixed(2)} ${p1.y.toFixed(2)}L${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    if (long) major += seg;
    else minor += seg;
  }
  return { minor, major };
}

export function Sundial({ rest, final, variant = "arc", width, label = "Remaining rest", children, className }: SundialProps) {
  const gid = `sd-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const total = rest ? Math.max(1, rest.total) : 120;
  const elapsed = rest ? Math.max(0, Math.min(total, rest.elapsed)) : 0;
  const anim = rest ? ({ "--sd-dur": `${total}s`, "--sd-delay": `${-elapsed}s` } as CSSProperties) : undefined;

  if (variant === "bar") {
    return (
      <div className={cn("w-full", className)}>
        <div role="img" aria-label={label} className="relative h-1.5 w-full overflow-hidden rounded-full bg-vein-2">
          {rest && (
            <div
              key={rest.key}
              className="sundial-bar motion-keep absolute inset-0 origin-left rounded-full"
              data-paused={rest.paused || undefined}
              style={{ ...anim, background: final ? "var(--leaf-200)" : "var(--leaf-300)" }}
            />
          )}
        </div>
        {children && <div className="mt-3 flex flex-col items-center text-center">{children}</div>}
      </div>
    );
  }

  const { minor, major } = bezel(total);
  const d = arcPath();
  return (
    <div className={cn("relative mx-auto", className)} style={{ width: width ?? "100%", maxWidth: width ? "100%" : 400, aspectRatio: "200 / 112" }}>
      <svg viewBox="0 -4 200 116" className="absolute inset-0 size-full overflow-visible" role="img" aria-label={label}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: "var(--leaf-500)" }} />
            <stop offset="0.55" style={{ stopColor: "var(--leaf-300)" }} />
            <stop offset="1" style={{ stopColor: "var(--leaf-100)" }} />
          </linearGradient>
        </defs>
        <path d={minor} style={{ stroke: "var(--ui-line)" }} strokeWidth={1} strokeLinecap="round" />
        <path d={major} style={{ stroke: "var(--stone)" }} strokeWidth={1.4} strokeLinecap="round" />
        <path d={d} fill="none" style={{ stroke: "var(--vein-2)" }} strokeWidth={6} strokeLinecap="round" />
        {rest && (
          <path
            key={rest.key}
            d={d}
            fill="none"
            pathLength={100}
            strokeDasharray="100 100"
            className="sundial-arc motion-keep"
            data-paused={rest.paused || undefined}
            style={{ ...anim, stroke: final ? "var(--leaf-200)" : `url(#${gid})` }}
            strokeWidth={6}
            strokeLinecap="round"
          />
        )}
        {rest && final && <path d={arcPath(R + 4.5)} fill="none" style={{ stroke: "var(--leaf-300)" }} strokeWidth={2} strokeLinecap="round" />}
      </svg>
      {children && <div className="absolute inset-x-0 bottom-0 flex flex-col items-center text-center">{children}</div>}
    </div>
  );
}
