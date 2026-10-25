"use client";

import { useEffect, useState } from "react";

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", cb: () => void): void;
}

/**
 * Keeps the screen awake while Gym Mode is open (Screen Wake Lock), re-requested whenever the
 * page comes back into view (the browser drops the lock when it is hidden). Returns whether the
 * lock is held, for the one-time "Screen stays on" toast. Silently false where unsupported.
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
