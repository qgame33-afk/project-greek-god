"use client";

// Per-device flags for Today, kept in localStorage: the check-in put off, "Done for today" tapped,
// a monthly recap opened. None of them is data: clearing storage only means a row shows again.
// Reads never throw (private mode, blocked storage).

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const mem = new Map<string, string | null>();

export function readLocal(key: string): string | null {
  if (mem.has(key)) return mem.get(key) ?? null;
  let v: string | null = null;
  try {
    v = typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    v = null;
  }
  mem.set(key, v);
  return v;
}

export function writeLocal(key: string, value: string | null) {
  mem.set(key, value);
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the in-memory value still holds for this visit */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (!e.key) return;
    mem.delete(e.key);
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** A localStorage value that re-renders when it changes (this tab or another). */
export function useLocal(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readLocal(key),
    () => null,
  );
}

export const keys = {
  /** The check-in put off for the day: the minute it was put off. */
  dawnLater: (date: string) => `pgg.dawn.later.${date}`,
  /** "Done for today" (or "Close Thursday" after midnight) tapped; writes nothing to the database. */
  sealed: (date: string) => `pgg.sealed.${date}`,
};
