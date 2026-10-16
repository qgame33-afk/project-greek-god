"use client";

// One shared 1 Hz clock. Only components that display time subscribe, so a running
// workout never re-renders the whole page every second. Pauses while the app is hidden.

import { useSyncExternalStore } from "react";

let now = typeof window === "undefined" ? 0 : Date.now();
const subs = new Set<() => void>();
let id: number | undefined;

function tick() {
  const n = Date.now();
  const changed = Math.floor(n / 1000) !== Math.floor(now / 1000);
  now = n;
  if (changed) subs.forEach((f) => f());
}
function start() {
  if (id === undefined && !document.hidden) id = window.setInterval(tick, 250);
}
function stop() {
  if (id !== undefined) window.clearInterval(id);
  id = undefined;
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else {
      tick();
      if (subs.size) start();
    }
  });
}

function subscribe(cb: () => void) {
  subs.add(cb);
  start();
  return () => {
    subs.delete(cb);
    if (!subs.size) stop();
  };
}

/** Current time in whole seconds (ms precision is never needed for display). */
export function useNowSec() {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(now / 1000),
    () => 0,
  );
}
