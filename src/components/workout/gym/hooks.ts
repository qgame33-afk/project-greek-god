"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * True while the element is narrower than 24rem (docs/DESIGN-V2.md §1.2.2, §3.2.10): a rem in
 * this check follows the root size, so a 390 px phone at an accessibility text size measures as
 * narrow and Gym Mode switches to its AX layout (bar dial, stacked deck, listed tower).
 */
export function useNarrow(ref: RefObject<HTMLElement | null>, rem = 24) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setNarrow(el.getBoundingClientRect().width < rem * root);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, rem]);
  return narrow;
}

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", cb: () => void): void;
}

/**
 * Keeps the screen awake while Gym Mode is open (Screen Wake Lock), re-requested whenever the
 * page comes back into view (the browser drops the lock when it is hidden). Returns whether the
 * lock is held, for the top bar's "screen stays on" dot. Silently false where unsupported.
 */
export function useWakeLock(enabled: boolean) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const request = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const l = (await (navigator as unknown as { wakeLock: { request(t: "screen"): Promise<WakeLockSentinelLike> } }).wakeLock.request("screen")) as WakeLockSentinelLike;
        if (cancelled) {
          void l.release();
          return;
        }
        lock = l;
        setHeld(true);
        l.addEventListener("release", () => setHeld(false));
      } catch {
        setHeld(false); // denied (low battery, not visible) — the dot just stays off
      }
    };
    void request();
    const onVis = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      if (lock && !lock.released) void lock.release();
      setHeld(false);
    };
  }, [enabled]);
  return held;
}

/** Measures an element's height into a CSS custom property on the document root. */
export function useHeightVar(ref: RefObject<HTMLElement | null>, name: string, active = true) {
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el || !active) {
      root.style.removeProperty(name);
      return;
    }
    const set = () => root.style.setProperty(name, `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty(name);
    };
  }, [ref, name, active]);
}
