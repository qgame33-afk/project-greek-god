"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The rest dial, as a plain ring (docs/DESIGN-V3-SIMPLE.md §1.7.4, §4.2.4): white draining on
 * --track, round caps, starting at 12 o'clock, no bezel ticks, no gold countdown. Pure CSS
 * animation (stroke-dashoffset on a pathLength-100 circle) started with a negative delay of the
 * elapsed seconds, so only the digits re-render each second. It keeps draining under reduced
 * motion (`motion-keep`: it carries information). The props are unchanged.
 *
 *   <Sundial rest={{ total: 120, elapsed: 48, key: startSec }}>
 *     <span className="t-timer">1:12</span>
 *   </Sundial>
 *
 * `variant="bar"` is a 6 px linear bar (digits go below it, from the caller).
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
  /** null = idle (no rest running): the track only. */
  rest: SundialRest | null;
  /** The last 10 seconds (kept for callers; the ring does not change colour). */
  final?: boolean;
  variant?: "arc" | "bar";
  /** Diameter in px (at most 252, the rest ring). */
  width?: number;
  /** VoiceOver label for the dial. */
  label?: string;
  /** The digits, centred in the ring. */
  children?: ReactNode;
  className?: string;
}

const STROKE = 12;

export function Sundial({ rest, variant = "arc", width, label = "Remaining rest", children, className }: SundialProps) {
  const total = rest ? Math.max(1, rest.total) : 120;
  const elapsed = rest ? Math.max(0, Math.min(total, rest.elapsed)) : 0;
  const anim = rest ? ({ "--sd-dur": `${total}s`, "--sd-delay": `${-elapsed}s` } as CSSProperties) : undefined;

  if (variant === "bar") {
    return (
      <div className={cn("w-full", className)}>
        <div role="img" aria-label={label} className="relative h-1.5 w-full overflow-hidden rounded-full bg-track">
          {rest && <div key={rest.key} className="sundial-bar motion-keep absolute inset-0 origin-left rounded-full bg-fg" data-paused={rest.paused || undefined} style={anim} />}
        </div>
        {children && <div className="mt-3 flex flex-col items-center text-center">{children}</div>}
      </div>
    );
  }

  const d = Math.min(width ?? 252, 252);
  const r = (d - STROKE) / 2;
  return (
    <div className={cn("relative mx-auto grid shrink-0 place-items-center", className)} style={{ width: d, height: d, maxWidth: "100%", aspectRatio: "1" }}>
      <svg viewBox={`0 0 ${d} ${d}`} className="absolute inset-0 size-full -rotate-90" role="img" aria-label={label}>
        <circle cx={d / 2} cy={d / 2} r={r} fill="none" style={{ stroke: "var(--track)" }} strokeWidth={STROKE} />
        {rest && (
          <circle
            key={rest.key}
            cx={d / 2}
            cy={d / 2}
            r={r}
            fill="none"
            pathLength={100}
            strokeDasharray="100 100"
            className="sundial-arc motion-keep"
            data-paused={rest.paused || undefined}
            style={{ ...anim, stroke: "var(--text)" }}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
        )}
      </svg>
      {children && <div className="relative flex flex-col items-center text-center">{children}</div>}
    </div>
  );
}
