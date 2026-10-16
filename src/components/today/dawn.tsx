"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatInt } from "@/lib/units";
import { cardDelay, DAWN_KEY, shouldPlayDawn } from "@/lib/today/dawn";

/* ----------------------------------------------------------------- Dawn */

const DawnContext = createContext<{ play: boolean }>({ play: false });

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Decides once, when Today's content first mounts, whether this is the first Today visit of
 * the browser session. Later visits (and reduced motion) render everything settled.
 */
export function DawnProvider({ children }: { children: ReactNode }) {
  const [play] = useState(() => shouldPlayDawn(sessionStore(), prefersReducedMotion()));
  useEffect(() => {
    try {
      sessionStore()?.setItem(DAWN_KEY, String(Date.now()));
    } catch {
      /* storage blocked — Dawn simply won't repeat-suppress */
    }
  }, []);
  return <DawnContext.Provider value={{ play }}>{children}</DawnContext.Provider>;
}

export function useDawn() {
  return useContext(DawnContext);
}

/** Card wrapper: under Dawn it rises in on the shared stagger; otherwise renders as-is. */
export function Reveal({ index, children, className, style }: { index: number; children: ReactNode; className?: string; style?: CSSProperties }) {
  const { play } = useDawn();
  return (
    <div className={className} style={play ? { ...style, animation: `rise 560ms var(--ease-out) ${cardDelay(index)}ms both` } : style}>
      {children}
    </div>
  );
}

/**
 * Data marks (rings, meters) on a card under Dawn: held at zero until the card is in view,
 * then filled on the choreography's stagger (`base` ms after Today mounted, minus time already
 * passed). Once revealed every delay drops to 0, so later changes — a water tap, a new weigh-in —
 * animate immediately. Without Dawn: shown at once, no delays.
 */
export function useReveal<T extends Element>(base: number) {
  const { play } = useDawn();
  const ref = useRef<T>(null);
  const mountedAt = useRef(0);
  const [seen, setSeen] = useState(!play);
  const [lead, setLead] = useState(0);
  const [settled, setSettled] = useState(!play);

  useEffect(() => {
    mountedAt.current = performance.now();
  }, []);

  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      const t = window.setTimeout(() => setSeen(true), 0);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setLead(Math.max(0, Math.round(base - (performance.now() - mountedAt.current))));
        setSeen(true);
        io.disconnect();
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, base]);

  useEffect(() => {
    if (!seen || settled) return;
    const t = window.setTimeout(() => setSettled(true), lead + 1400);
    return () => window.clearTimeout(t);
  }, [seen, settled, lead]);

  // Plain numbers (not a function over this object) so callers never touch the ref in render.
  return { ref, seen, delay: settled ? 0 : lead, stagger: settled ? 0 : 80 };
}

/* --------------------------------------------------------------- clocks */

function subscribeMinute(cb: () => void) {
  const id = window.setInterval(cb, 60_000);
  document.addEventListener("visibilitychange", cb);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", cb);
  };
}
const hourNow = () => new Date().getHours();

/** Local hour, refreshed every minute and when the app returns to the foreground. */
export function useHour(): number {
  return useSyncExternalStore(subscribeMinute, hourNow, () => 9);
}

/** A media query that stays live (resize, rotation). Today renders client-only, so the first
 *  render already has the real value — no 168 → 240 jump for the bust on desktop. */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/* ------------------------------------------------------------ countdown */

/**
 * A number that counts from `from` to `to` once (rAF, writes textContent — no re-renders),
 * then shows later changes instantly. Screen readers get only the final value.
 */
export function CountTo({
  from,
  to,
  play,
  delay = 0,
  duration = 1400,
  className,
  format = formatInt,
}: {
  from: number;
  to: number;
  play: boolean;
  delay?: number;
  duration?: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!play || played.current) {
      el.textContent = format(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now() + delay;
    el.textContent = format(from);
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / duration));
      const eased = 1 - Math.pow(1 - k, 4);
      el.textContent = format(Math.round(from + (to - from) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
      else played.current = true;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = format(to);
    };
  }, [from, to, play, delay, duration, format]);
  return (
    <>
      <span ref={ref} className={cn("tabular-nums", className)} aria-hidden>
        {format(play ? from : to)}
      </span>
      <span className="sr-only">{format(to)}</span>
    </>
  );
}
