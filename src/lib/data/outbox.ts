"use client";

// A tiny write-ahead outbox for gym-floor connectivity. Set edits are applied to the UI
// immediately, persisted to localStorage, and flushed to Supabase in order. If the network
// drops, nothing is lost — writes retry when the connection returns.

import { useSyncExternalStore } from "react";
import { sb } from "./core";

type Op =
  | { kind: "update"; table: "exercise_sets" | "workout_sessions"; id: string; values: Record<string, unknown> }
  | { kind: "insert"; table: "exercise_sets"; values: Record<string, unknown> }
  | { kind: "delete"; table: "exercise_sets"; id: string };

interface Entry {
  key: string;
  op: Op;
  tries: number;
}

const STORAGE = "pgg-outbox-v1";
let queue: Entry[] = load();
let flushing = false;
let lastError: string | null = null;
const listeners = new Set<() => void>();

function load(): Entry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? "[]");
  } catch {
    return [];
  }
}
function persist() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(queue));
  } catch {
    /* storage full / private mode — the in-memory queue still flushes */
  }
  snapshot = { pending: queue.length, error: lastError };
  listeners.forEach((l) => l());
}

let snapshot = { pending: queue.length, error: lastError as string | null };

/** Queue a write. Consecutive updates to the same row are merged. */
export function enqueue(op: Op) {
  if (op.kind === "update") {
    const existing = queue.find((e) => e.op.kind === "update" && e.op.table === op.table && e.op.id === op.id && e !== queue[0]);
    if (existing && existing.op.kind === "update") {
      existing.op.values = { ...existing.op.values, ...op.values };
      persist();
      void flush();
      return;
    }
  }
  if (op.kind === "delete") {
    // a delete supersedes queued updates to the same row
    queue = queue.filter((e, i) => i === 0 || !(e.op.kind === "update" && e.op.id === op.id));
  }
  queue.push({ key: crypto.randomUUID(), op, tries: 0 });
  persist();
  void flush();
}

export async function flush(): Promise<void> {
  if (flushing || typeof navigator === "undefined") return;
  flushing = true;
  try {
    while (queue.length) {
      const e = queue[0];
      const { op } = e;
      let error: { message: string; code?: string } | null = null;
      try {
        if (op.kind === "update") ({ error } = await sb().from(op.table).update(op.values as never).eq("id", op.id));
        else if (op.kind === "insert") ({ error } = await sb().from(op.table).upsert(op.values as never, { onConflict: "id" }));
        else ({ error } = await sb().from(op.table).delete().eq("id", op.id));
      } catch (err) {
        error = { message: err instanceof Error ? err.message : "Network error" };
      }
      if (!error) {
        queue.shift();
        lastError = null;
        persist();
        continue;
      }
      const transient = /fetch|network|timeout|Failed|503|502|504|JWT/i.test(error.message);
      e.tries += 1;
      if (!transient) {
        // a permanent rejection (bad value / row gone): drop it but surface the reason.
        // Network failures are NEVER dropped — they wait for the connection to return.
        queue.shift();
        lastError = error.message;
        persist();
        continue;
      }
      lastError = "Offline — changes will sync when you're back online.";
      persist();
      break;
    }
  } finally {
    flushing = false;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flush());
  window.setInterval(() => queue.length && void flush(), 8000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void flush());
  void flush();
}

export function useOutbox() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => ({ pending: 0, error: null }),
  );
}

/** Writes still queued (for code outside React). */
export const outboxPending = () => queue.length;

/** Resolves once the outbox has drained (or after `timeoutMs`). */
export async function drained(timeoutMs = 8000) {
  const start = Date.now();
  await flush();
  let lastFlush = Date.now();
  while (queue.length && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1000));
    if (Date.now() - lastFlush >= 3000) {
      lastFlush = Date.now();
      await flush();
    }
  }
  return queue.length === 0;
}
