"use client";

import { useEffect, useState } from "react";

export type WakeLockState = "on" | "off" | "unsupported";

interface Sentinel {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (t: "release", f: () => void) => void;
}

type WakeLockApi = { request: (t: "screen") => Promise<Sentinel> };
const wakeLockApi = (): WakeLockApi | undefined => (typeof navigator === "undefined" ? undefined : (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock);

/**
 * Keeps the screen awake while `active` (Screen Wake Lock API: Safari 16.4+, Chrome). The
 * browser drops the lock whenever the page is hidden, so it is asked for again when the page
 * comes back. Reports "unsupported" where the API doesn't exist, so the UI never claims it.
 */
export function useWakeLock(active: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>("off");
  const supported = !!wakeLockApi();
  useEffect(() => {
    const api = wakeLockApi();
    if (!active || !api) return;
    let sentinel: Sentinel | null = null;
    let cancelled = false;
    const request = async () => {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const s = await api.request("screen");
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel = s;
        setState("on");
        s.addEventListener("release", () => {
          if (!cancelled) setState("off");
        });
      } catch {
        // not allowed right now (low battery, no user gesture yet, iframe): try again on the next visit
        if (!cancelled) setState("off");
      }
    };
    void request();
    const onVisible = () => void request();
    document.addEventListener("visibilitychange", onVisible);
    // some browsers only grant it after a tap
    window.addEventListener("pointerdown", onVisible, { passive: true });
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", onVisible);
      if (sentinel && !sentinel.released) void sentinel.release();
    };
  }, [active]);
  if (!supported) return "unsupported";
  return active ? state : "off";
}
