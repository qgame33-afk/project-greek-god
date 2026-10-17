"use client";

// What the current page tells the shell's header row (docs/DESIGN-V2.md §2.1): its eyebrow and the
// context the ✦ Oracle opens with. Pages declare it with <TabHeader />; the shell reads it.

import { useSyncExternalStore } from "react";
import type { OracleContext } from "@/components/offering/store";

export interface HeaderInfo {
  /** The pathname that registered it (stale entries from a page being left are ignored). */
  path: string;
  eyebrow?: string;
  oracle?: OracleContext;
}

let header: HeaderInfo | null = null;
const listeners = new Set<() => void>();

export function setHeader(next: HeaderInfo | null) {
  header = next;
  listeners.forEach((l) => l());
}

/** Clears the header only if `path` still owns it (a new page may already have registered). */
export function clearHeader(path: string) {
  if (header?.path === path) setHeader(null);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useHeader(pathname: string): HeaderInfo | null {
  const h = useSyncExternalStore(
    subscribe,
    () => header,
    () => null,
  );
  return h && h.path === pathname ? h : null;
}
