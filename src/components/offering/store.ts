"use client";

// The Offering opening API (docs/DESIGN-V2.md §3.9.4). Seeded by Foundation; owned by the Sheets
// stream after the F-B hand-off. `openOffering()` works from any component (no provider needed);
// the shell mounts <OfferingHost /> once, which reads `useOffering()`.
//
//   openOffering({ mode: "log" })                                   the + button
//   openOffering({ mode: "log", slot: "dinner", panel: "search" })  /nutrition?add=1&meal=dinner
//   openOffering({ mode: "ask", context: { kind: "fuel", label: "Today · 121 of 185 g" } })   ✦

import { useSyncExternalStore } from "react";
import type { ISODate } from "@/lib/dates";

export interface OracleContext {
  kind: "now" | "train" | "fuel" | "ascent" | "gym" | "recipe";
  label: string;
  facts?: string[];
}

export type OfferingOpen =
  | { mode: "log"; slot?: "breakfast" | "lunch" | "dinner" | "snacks"; panel?: "search" | "recent" | "saved" | "manual"; date?: ISODate }
  | { mode: "ask"; context?: OracleContext; prompt?: string; conversationId?: string };

let current: OfferingOpen | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Opens the Offering sheet in Log or Ask mode. Usable from any component. */
export function openOffering(o: OfferingOpen): void {
  current = o;
  emit();
}

export function closeOffering(): void {
  if (current == null) return;
  current = null;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useOffering(): { open: OfferingOpen | null; close(): void } {
  const open = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  return { open, close: closeOffering };
}
