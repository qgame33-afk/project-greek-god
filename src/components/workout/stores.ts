"use client";

// Small per-session stores kept in localStorage so a refresh, a backgrounded PWA or a
// crash never loses the rest timer, skipped exercises or the once-per-exercise PR moment.

import { useSyncExternalStore } from "react";
import type { RestState } from "@/lib/workout/rest";
import type { Journal } from "@/lib/workout/sync";

const listeners = new Set<() => void>();
const cache = new Map<string, unknown>();

function read<T>(key: string, fallback: T): T {
  if (cache.has(key)) return (cache.get(key) as T | null) ?? fallback;
  let v: T = fallback;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) v = (JSON.parse(raw) as T | null) ?? fallback;
    } catch {
      v = fallback;
    }
  }
  cache.set(key, v);
  return v;
}

function write<T>(key: string, v: T | null) {
  cache.set(key, v);
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode / storage full — the in-memory value still works this session */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

if (typeof window !== "undefined") {
  // Another tab (or the dock on another screen) changed a value.
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith("pgg.")) return;
    cache.delete(e.key);
    listeners.forEach((l) => l());
  });
}

const EMPTY: string[] = [];

/* ------------------------------------------------------------------ rest */

export const restKey = (sessionId: string) => `pgg.rest.${sessionId}`;

export function getRest(sessionId: string): RestState | null {
  return read<RestState | null>(restKey(sessionId), null);
}
export function setRest(sessionId: string, s: RestState | null) {
  write(restKey(sessionId), s);
}
export function useRest(sessionId: string | null | undefined): RestState | null {
  return useSyncExternalStore(
    subscribe,
    () => (sessionId ? getRest(sessionId) : null),
    () => null,
  );
}

/* --------------------------------------------------------------- skipped */

const skipKey = (sessionId: string) => `pgg.skip.${sessionId}`;

export function getSkipped(sessionId: string): string[] {
  return read<string[]>(skipKey(sessionId), EMPTY);
}
export function setSkipped(sessionId: string, ids: string[]) {
  write(skipKey(sessionId), ids.length ? ids : null);
}
export function useSkipped(sessionId: string): string[] {
  return useSyncExternalStore(
    subscribe,
    () => getSkipped(sessionId),
    () => EMPTY,
  );
}

/* ------------------------------------------------- once-per-exercise PRs */

const prKey = (sessionId: string) => `pgg.prs.${sessionId}`;

/** Returns true the first time a slug is marked for this session. */
export function markMoment(sessionId: string, slug: string): boolean {
  const cur = read<string[]>(prKey(sessionId), EMPTY);
  if (cur.includes(slug)) return false;
  write(prKey(sessionId), [...cur, slug]);
  return true;
}

/* ------------------------------------------------- device copy (offline) */

// The live session as this device last showed it, plus the journal of changes made on this
// device that the server hasn't been seen to hold yet. Entries leave the journal only once a
// sync confirms them, so a write the outbox gave up on, or a reload with no signal, never
// loses a logged set — and only this device's own changes are ever re-sent.

export interface DeviceCopy<T> {
  data: T;
  journal?: Journal;
  /** Copies saved before the journal existed: true = holds changes the server may lack. */
  dirty?: boolean;
}

const copyKey = (sessionId: string) => `pgg.live.${sessionId}`;

export function getDeviceCopy<T>(sessionId: string): DeviceCopy<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(copyKey(sessionId));
    return raw ? (JSON.parse(raw) as DeviceCopy<T>) : null;
  } catch {
    return null;
  }
}

export function setDeviceCopy<T>(sessionId: string, data: T, journal: Journal) {
  try {
    localStorage.setItem(copyKey(sessionId), JSON.stringify({ data, journal } satisfies DeviceCopy<T>));
  } catch {
    /* storage full / private mode — the outbox still carries the writes */
  }
}

/** Forget everything kept for a session once it is finished or discarded. */
export function clearSessionStores(sessionId: string) {
  write(restKey(sessionId), null);
  write(skipKey(sessionId), null);
  write(prKey(sessionId), null);
  try {
    localStorage.removeItem(copyKey(sessionId));
  } catch {
    /* ignore */
  }
}

/* ---------------------------------------------------------------- online */

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** navigator.onLine as state (true on the server and when unknown). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine !== false,
    () => true,
  );
}
