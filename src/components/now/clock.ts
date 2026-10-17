"use client";

import { useSyncExternalStore } from "react";
import { minutesSinceMidnight } from "@/lib/now/day-engine";

// The Day Engine re-evaluates every minute and whenever the app comes back to the foreground
// (docs/DESIGN-V2.md §3.1.2). One shared subscription; the snapshot is minutes since local midnight.

function subscribe(cb: () => void) {
  const id = window.setInterval(cb, 15_000);
  const onVis = () => {
    if (document.visibilityState === "visible") cb();
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", cb);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("focus", cb);
  };
}

const snapshot = () => minutesSinceMidnight(new Date());

/** Minutes since local midnight (0–1439), refreshed each minute and on focus. */
export function useMinuteOfDay(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 9 * 60);
}

const visible = () => (typeof document === "undefined" ? true : document.visibilityState === "visible");
function subscribeVis(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

/** True while the page is on screen (the Turn animates only when he is looking). */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribeVis, visible, () => true);
}
