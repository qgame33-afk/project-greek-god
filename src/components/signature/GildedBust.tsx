"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Laurel } from "@/components/art/Motifs";
import { cn } from "@/lib/cn";
import { bustFillLine as fillLine } from "@/lib/today/ascent";

/**
 * The Gilded Bust (DESIGN §6.1). The engraved statue gilds from the plinth up as the 7-day
 * average climbs toward the goal. Only the gold rises — two counter-translated layers on the
 * compositor — and a molten edge plays once at the fill line after it settles.
 *
 *  - `p` is the shared ascent progress (0–1). `null` means no weigh-ins yet.
 *  - First reveal: starts 300ms after the bust enters the viewport, 1400ms `--ease-gold`.
 *  - New weigh-in: animates old p → new p over 900ms.
 *  - `instant`: render the settled state with no motion (later Today visits, reduced motion).
 *  - Without CSS mask support the gold layer is hidden; the meter beside it still shows p.
 */
export interface GildedBustProps {
  p: number | null;
  /** Rendered height in px (3:4 box). 168 on phones, 240 on desktop. */
  size?: number;
  caption?: ReactNode;
  instant?: boolean;
  className?: string;
}

const MASK = "/art/statue-mask.webp";
const noop = () => () => {};
const REVEAL_MS = 1400;
const UPDATE_MS = 900;
const START_DELAY_MS = 300;

function maskSupported() {
  try {
    return CSS.supports("mask-image", `url("${MASK}")`) || CSS.supports("-webkit-mask-image", `url("${MASK}")`);
  } catch {
    return false;
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const edgeVisible = (v: number) => v > 0.004 && v < 0.996;

type Edge = { mode: "off" | "play" | "static"; at: number };

const MASK_STYLE = {
  WebkitMaskImage: `url("${MASK}")`,
  maskImage: `url("${MASK}")`,
  WebkitMaskSize: "contain",
  maskSize: "contain",
  WebkitMaskPosition: "center bottom",
  maskPosition: "center bottom",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
} as const;

export function GildedBust({ p, size = 168, caption, instant = false, className }: GildedBustProps) {
  const progress = p == null ? 0 : clamp01(p);
  const target = fillLine(progress);
  const hasMask = useSyncExternalStore(noop, maskSupported, () => true);
  const reduced = useSyncExternalStore(noop, prefersReducedMotion, () => false);
  const settled = instant || reduced;

  const root = useRef<HTMLDivElement>(null);
  const edgeEl = useRef<HTMLDivElement>(null);
  const sweepEl = useRef<HTMLDivElement>(null);
  const edgePlayed = useRef(settled);

  // `shown` is what the transforms render; `phase` picks the transition timing.
  const [shown, setShown] = useState(settled ? target : 0);
  const [phase, setPhase] = useState<"idle" | "reveal" | "update">(settled ? "update" : "idle");
  const [inView, setInView] = useState(settled);
  const [edge, setEdge] = useState<Edge>(() => ({ mode: settled && edgeVisible(target) ? "static" : "off", at: target }));

  // Wait until the bust is on screen before the first rise.
  useEffect(() => {
    if (inView) return;
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      const t = window.setTimeout(() => setInView(true), 0);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  // First reveal 300ms after entering view; afterwards follow p (old → new over 900ms).
  useEffect(() => {
    if (!inView) return;
    if (phase === "idle") {
      const t = window.setTimeout(() => {
        setPhase("reveal");
        setShown(target);
      }, START_DELAY_MS);
      return () => window.clearTimeout(t);
    }
    if (shown === target) return;
    const t = window.setTimeout(() => {
      setPhase("update");
      setShown(target);
    }, 0);
    return () => window.clearTimeout(t);
  }, [inView, phase, target, shown]);

  // The molten edge hides while the gold moves, then reappears at the new fill line once
  // the transform settles. The fade + highlight sweep play only the first time.
  const duration = phase === "reveal" ? REVEAL_MS : UPDATE_MS;
  useEffect(() => {
    if (phase === "idle" || !hasMask) return;
    const hide = window.setTimeout(() => setEdge((e) => (e.mode === "off" || e.at === shown ? e : { mode: "off", at: e.at })), 0);
    const show = window.setTimeout(
      () => {
        if (!edgeVisible(shown)) return setEdge({ mode: "off", at: shown });
        if (edgePlayed.current) return setEdge({ mode: "static", at: shown });
        edgePlayed.current = true;
        setEdge({ mode: "play", at: shown });
      },
      settled ? 0 : duration,
    );
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(show);
    };
  }, [phase, shown, hasMask, duration, settled]);

  useEffect(() => {
    if (edge.mode !== "play") return;
    const a = edgeEl.current?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.45 }, { opacity: 0.5 }], { duration: 600, easing: "ease-out", fill: "forwards" });
    const b = sweepEl.current?.animate(
      [
        { transform: "translateX(-100%)", opacity: 1 },
        { transform: "translateX(320%)", opacity: 1 },
      ],
      { duration: 900, delay: 150, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" },
    );
    return () => {
      a?.cancel();
      b?.cancel();
    };
  }, [edge.mode]);

  const width = Math.round((size * 3) / 4);
  const transition = phase === "idle" ? "none" : `transform ${duration}ms var(--ease-gold)`;
  const pct = Math.round(progress * 100);
  const ascended = p != null && progress >= 1;
  const label = p == null ? "Bodyweight progress: begins with your first weigh-in." : `Bodyweight progress: ${pct} percent of the way from start to goal weight.`;
  const captionNode = caption ?? (p == null ? "Begins with your first weigh-in." : null);

  return (
    <figure className={cn("relative m-0 flex shrink-0 flex-col items-center", className)} style={{ width }}>
      <div ref={root} className="relative overflow-hidden" style={{ width, height: size }} role="img" aria-label={label}>
        {/* Layer A — the engraving, unlit */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={MASK}
          alt=""
          width={width}
          height={size}
          decoding="async"
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full object-contain object-bottom opacity-[.18]"
        />

        {/* Layer B — gold leaf rising from the plinth: wrapper moves up, child counter-moves */}
        {hasMask && (
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ transform: `translateY(${(1 - shown) * 100}%)`, transition }}>
            <div className="absolute inset-0" style={{ transform: `translateY(${(shown - 1) * 100}%)`, transition }}>
              {/* two stacked leaf layers so fine hatch lines read as solid gold */}
              <div className="absolute inset-0" style={{ ...MASK_STYLE, background: "var(--grad-leaf)" }} />
              <div className="absolute inset-0 opacity-70" style={{ ...MASK_STYLE, background: "var(--grad-leaf)" }} />
            </div>
          </div>
        )}

        {/* Molten edge — a 3px #F3DDA8 band at the fill line, masked by the statue */}
        {hasMask && edge.mode !== "off" && (
          <div ref={edgeEl} aria-hidden className="pointer-events-none absolute inset-0" style={{ ...MASK_STYLE, opacity: edge.mode === "static" ? 0.5 : 0 }}>
            <div className="absolute inset-x-0 overflow-hidden" style={{ top: `calc(${(1 - edge.at) * 100}% - 1.5px)`, height: 3 }}>
              <div className="absolute inset-0 bg-[#F3DDA8]" />
              <div
                ref={sweepEl}
                className="absolute inset-y-0 left-0 w-[34%]"
                style={{ background: "linear-gradient(90deg, transparent, rgb(255 255 255 / .95), transparent)", transform: "translateX(-100%)" }}
              />
            </div>
          </div>
        )}
      </div>

      {ascended ? (
        <figcaption className="mt-2 flex flex-col items-center gap-1">
          <Laurel size={30} />
          <span className="t-plaque text-[12px]">Ascended</span>
        </figcaption>
      ) : captionNode ? (
        <figcaption className="mt-2 max-w-[18ch] text-center text-[12px] font-medium leading-snug text-fg-3">{captionNode}</figcaption>
      ) : null}
    </figure>
  );
}
