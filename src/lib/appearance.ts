"use client";

// Per-device appearance (docs/DESIGN-V2.md §3.10 Appearance, §1.1.4, §1.8.1). Stored in
// localStorage `pgg.appearance` and applied to <html> as attributes before first paint (the boot
// script in the root layout) and on every change:
//   data-motion="reduce"        Motion = Reduce (or the system setting, read separately)
//   data-transparency="reduce"  Reduce transparency: every glass surface goes opaque
//   data-phase="seal"           the night variant: always, or 21:00–05:00 when it follows the day
// Gym Mode auto lives in profiles.prefs (it changes routing across devices), not here.

import { useSyncExternalStore } from "react";

export type MotionPref = "system" | "reduce";
export type TransparencyPref = "system" | "reduce";
export type NightPref = "auto" | "always";

export interface Appearance {
  motion: MotionPref;
  transparency: TransparencyPref;
  night: NightPref;
}

export const APPEARANCE_KEY = "pgg.appearance";
export const DEFAULT_APPEARANCE: Appearance = { motion: "system", transparency: "system", night: "auto" };

/** Night (the Seal variant) runs from 21:00 to 05:00 local time. */
export const NIGHT_FROM_MIN = 21 * 60;
export const NIGHT_UNTIL_MIN = 5 * 60;

export function parseAppearance(raw: unknown): Appearance {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    motion: o.motion === "reduce" ? "reduce" : "system",
    transparency: o.transparency === "reduce" ? "reduce" : "system",
    night: o.night === "always" ? "always" : "auto",
  };
}

export function isNightMinute(min: number): boolean {
  return min >= NIGHT_FROM_MIN || min < NIGHT_UNTIL_MIN;
}

function minuteOf(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

export function readAppearance(): Appearance {
  try {
    return parseAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "null"));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** Phase pushed by a screen that knows better than the clock (the Day Engine on Now); null = clock. */
let phaseOverride: string | null = null;

/** Writes the appearance attributes on <html>. Cheap; safe to call every minute. */
export function applyAppearance(a: Appearance = readAppearance(), now: Date = new Date()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  setAttr(root, "data-motion", a.motion === "reduce" ? "reduce" : null);
  setAttr(root, "data-transparency", a.transparency === "reduce" ? "reduce" : null);
  const seal = a.night === "always" || (phaseOverride ? phaseOverride === "seal" : isNightMinute(minuteOf(now)));
  setAttr(root, "data-phase", seal ? "seal" : phaseOverride);
}

function setAttr(el: HTMLElement, name: string, value: string | null) {
  if (value == null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** The Now screen passes its Day Engine phase while it is mounted (null when it unmounts). */
export function setDayPhase(phase: string | null) {
  phaseOverride = phase;
  applyAppearance();
}

const listeners = new Set<() => void>();
let snapshot: Appearance | null = null;

export function saveAppearance(patch: Partial<Appearance>): Appearance {
  const next = { ...readAppearance(), ...patch };
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next));
  } catch {
    /* private mode: applies for this visit only */
  }
  snapshot = next;
  applyAppearance(next);
  listeners.forEach((l) => l());
  return next;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== APPEARANCE_KEY) return;
    snapshot = readAppearance();
    applyAppearance(snapshot);
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Appearance {
  if (!snapshot) snapshot = readAppearance();
  return snapshot;
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_APPEARANCE);
}

/* ------------------------------------------------------------ reduced motion */

const MQ = "(prefers-reduced-motion: reduce)";

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia(MQ);
  mq.addEventListener("change", cb);
  const off = subscribe(cb);
  return () => {
    mq.removeEventListener("change", cb);
    off();
  };
}

function motionSnapshot() {
  return window.matchMedia(MQ).matches || getSnapshot().motion === "reduce";
}

/** True when motion should be reduced: the system setting or Settings → Appearance → Motion. */
export function useReducedMotionPref(): boolean {
  return useSyncExternalStore(subscribeMotion, motionSnapshot, () => false);
}

// The boot script that applies these attributes before first paint lives inline in
// src/app/layout.tsx (a server component can't import from this client module); keep the two in step.
