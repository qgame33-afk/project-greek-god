"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { DURATION, prefersReducedMotion } from "@/lib/motion";
import { bustFillLine } from "@/lib/today/ascent";

/**
 * The Statue (docs/DESIGN-V2.md §1.5, §4.1.4): the marble Hermes gilded from the plinth up to the
 * real 7-day trend (`p` = gildFraction(), 0 below 4 weigh-ins — it tracks the trend down too).
 *
 * Two alpha-cut WebPs (public/art/statue-marble.webp, statue-gold.webp; scripts/dev/grade-statue.mjs)
 * stacked in an overflow-clipped wrapper: the gold layer's wrapper moves up while its child
 * counter-moves, so only transforms animate. No blend modes, no CSS mask on the photo, no SVG
 * filters. The molten edge is a ~3 px leaf-100 band at the gild line, masked by the statue's own
 * alpha (one static mask image), animated with opacity only.
 *
 * Modes: `now` (hero) · `dawn` (dimmed to .55 under the rose light) · `unveil` (the daily Unveiling:
 * spotlight up, gild rises from `fromP`) · `chronicle` (a month's end) · `oath` (onboarding/sign-in,
 * always marble). Budget: once per screen, only on Now, the Chronicle title, the Oath and sign-in.
 *
 * Motion: Gild 600–1400 ms (by distance) on ease-gold, from `fromP` to `p` when they differ.
 * `skip` (or reduced motion) jumps to the end state — the Unveiling's "any tap skips".
 */
export type StatueMode = "now" | "dawn" | "unveil" | "chronicle" | "oath";

export interface StatueProps {
  /** Gild fraction 0–1 from gildFraction(). */
  p: number;
  /** Where the gold starts for this showing (yesterday's fraction for the Unveiling). */
  fromP?: number;
  mode?: StatueMode;
  /** Rendered height in px; the box is 3:4. Omit to fill the parent's width (aspect 3/4). */
  height?: number;
  /** VoiceOver sentence, e.g. "Your statue, gilded to 27 percent of the climb. Trend 168.4 pounds." */
  label: string;
  /** Jump straight to the end state (a tap during the Unveiling). */
  skip?: boolean;
  /** Draw the warm spotlight behind the bust (rose at Dawn). */
  spotlight?: boolean;
  /** Load eagerly with high priority (the Now hero). */
  priority?: boolean;
  onSettled?: () => void;
  className?: string;
}

const MARBLE = "/art/statue-marble.webp";
const GOLD = "/art/statue-gold.webp";
const noop = () => () => {};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Gild duration scaled by distance: 600 ms for a sliver, up to 1400 ms for the whole figure. */
export function gildDuration(from: number, to: number) {
  return Math.round(600 + Math.min(1, Math.abs(to - from) / 0.5) * 800);
}

function maskSupported() {
  try {
    return CSS.supports("mask-image", `url("${MARBLE}")`) || CSS.supports("-webkit-mask-image", `url("${MARBLE}")`);
  } catch {
    return false;
  }
}

export function Statue({ p, fromP, mode = "now", height, label, skip, spotlight, priority, onSettled, className }: StatueProps) {
  const target = mode === "oath" ? 0 : clamp01(p);
  const start = fromP == null || mode === "oath" ? target : clamp01(fromP);
  const reduced = useSyncExternalStore(noop, prefersReducedMotion, () => false);
  const hasMask = useSyncExternalStore(noop, maskSupported, () => false);
  const instant = reduced || !!skip;

  // `shown` is the fraction the transforms render; it starts at `start` and moves to `target`.
  const [shown, setShown] = useState(instant ? target : start);
  const [moving, setMoving] = useState(false);
  const duration = gildDuration(start, target);
  const settledFor = useRef<number | null>(null);

  useEffect(() => {
    if (instant) {
      const id = requestAnimationFrame(() => {
        setMoving(false);
        setShown(target);
      });
      return () => cancelAnimationFrame(id);
    }
    if (shown === target) return;
    // two frames so the start position paints before the transition runs
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        setMoving(true);
        setShown(target);
      });
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, instant]);

  useEffect(() => {
    if (shown !== target || settledFor.current === target) return;
    const t = window.setTimeout(
      () => {
        settledFor.current = target;
        setMoving(false);
        onSettled?.();
      },
      moving && !instant ? duration : 0,
    );
    return () => window.clearTimeout(t);
  }, [shown, target, moving, instant, duration, onSettled]);

  const line = bustFillLine(shown); // 0–1 of the box height, from the bottom
  const transition = moving && !instant ? `transform ${duration}ms var(--ease-gold)` : "none";
  const edgeOn = hasMask && line > 0.004 && line < 0.996;
  const dim = mode === "dawn" ? 0.55 : 1;

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("relative isolate shrink-0 select-none", className)}
      style={height ? { height, width: Math.round((height * 3) / 4) } : { aspectRatio: "3 / 4", width: "100%" }}
      data-statue={mode}
    >
      {spotlight && (
        <div
          aria-hidden
          className={cn("pointer-events-none absolute -inset-[18%] -z-10", mode === "unveil" && !instant && "spot-in")}
          style={{
            background:
              mode === "dawn"
                ? "radial-gradient(55% 48% at 52% 34%, rgb(236 160 150 / .14), transparent 70%)"
                : "radial-gradient(55% 48% at 48% 34%, rgb(236 200 140 / .14), transparent 70%)",
            opacity: "var(--spot-opacity)",
          }}
        />
      )}
      <div className="absolute inset-0 overflow-hidden" style={{ opacity: dim }}>
        {/* the marble, whole */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={MARBLE}
          alt=""
          aria-hidden
          draggable={false}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
        {/* the gold, revealed from the plinth up: wrapper rises, child counter-moves */}
        {line > 0 && (
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ transform: `translateY(${(1 - line) * 100}%)`, transition }}>
            <div className="absolute inset-0" style={{ transform: `translateY(${(line - 1) * 100}%)`, transition }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={GOLD} alt="" draggable={false} decoding="async" loading={priority ? "eager" : "lazy"} className="absolute inset-0 size-full object-cover" />
            </div>
          </div>
        )}
        {/* the molten edge at the gild line, masked by the statue's own alpha */}
        {edgeOn && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              WebkitMaskImage: `url("${MARBLE}")`,
              maskImage: `url("${MARBLE}")`,
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
              opacity: moving ? 0 : 0.7,
              transition: moving ? "opacity 120ms var(--ease-out)" : `opacity ${DURATION.lift}ms var(--ease-out)`,
            }}
          >
            <div
              className="absolute inset-x-0"
              style={{
                top: `calc(${(1 - line) * 100}% - 2px)`,
                height: 4,
                background: "linear-gradient(180deg, transparent, var(--leaf-100) 45%, var(--leaf-50) 55%, transparent)",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
