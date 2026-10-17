"use client";

// Per-device flags for Now, kept in localStorage (docs/DESIGN-V2.md §3.1): Dawn put off until later,
// the day sealed, the Unveiling played, yesterday's gild, a Chronicle opened. None of them is data:
// clearing storage only means a moment plays again. Reads never throw (private mode, blocked storage).

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
  /** Dawn put off for the day: the minute "Later" was tapped. */
  dawnLater: (date: string) => `pgg.dawn.later.${date}`,
  /** "Seal the day" tapped (writes nothing to the database, §0.3). */
  sealed: (date: string) => `pgg.sealed.${date}`,
  /** The date the Unveiling last played. */
  unveil: "pgg.unveil",
  /** The gild fraction the statue last showed (the Unveiling rises from it). */
  gildLast: "pgg.gild.last",
};
