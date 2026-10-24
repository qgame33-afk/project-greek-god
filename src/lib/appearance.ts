"use client";

// Per-device appearance (docs/DESIGN-V3-SIMPLE.md §1.1.2, §1.6; Settings › Profile › Display).
// Stored in localStorage `pgg.appearance` and applied to <html> as attributes before first paint
// (the boot script in the root layout) and on every change:
//   data-motion="reduce"   Motion = Reduce (or the system setting, read separately)
//   data-night="on"        night dimming: Off, 9 PM–5 AM ("auto", the default) or Always. It
//                          changes only --text and --gold (globals.css).
// There is no glass any more, so the stored Reduce transparency value is kept but ignored.
// Gym Mode auto lives in profiles.prefs (it changes routing across devices), not here.

import { useSyncExternalStore } from "react";

export type MotionPref = "system" | "reduce";
export type TransparencyPref = "system" | "reduce";
/** Night dimming: "off", "auto" (9 PM–5 AM) or "always". */
export type NightPref = "off" | "auto" | "always";

export interface Appearance {
  motion: MotionPref;
  /** @deprecated Retired with the glass (DESIGN-V3 §1.1.2): stored, never applied. */
  transparency: TransparencyPref;
  night: NightPref;
}

export const APPEARANCE_KEY = "pgg.appearance";
export const DEFAULT_APPEARANCE: Appearance = { motion: "system", transparency: "system", night: "auto" };

/** Night dimming ("auto") runs from 21:00 to 05:00 local time. */
export const NIGHT_FROM_MIN = 21 * 60;
export const NIGHT_UNTIL_MIN = 5 * 60;

export function parseAppearance(raw: unknown): Appearance {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    motion: o.motion === "reduce" ? "reduce" : "system",
    transparency: o.transparency === "reduce" ? "reduce" : "system",
    night: o.night === "always" ? "always" : o.night === "off" ? "off" : "auto",
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

/** Whether night dimming is on for this setting at this time. */
export function nightOn(night: NightPref, now: Date = new Date()): boolean {
  if (night === "always") return true;
  if (night === "off") return false;
  return isNightMinute(minuteOf(now));
}

/** Writes the appearance attributes on <html>. Cheap; safe to call every minute. */
export function applyAppearance(a: Appearance = readAppearance(), now: Date = new Date()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  setAttr(root, "data-motion", a.motion === "reduce" ? "reduce" : null);
  setAttr(root, "data-night", nightOn(a.night, now) ? "on" : null);
  // retired variants (Seal, Reduce transparency): never set any more
  setAttr(root, "data-transparency", null);
  setAttr(root, "data-phase", null);
}

function setAttr(el: HTMLElement, name: string, value: string | null) {
  if (value == null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/**
 * @deprecated The old Now screen passed its Day Engine phase here for the Seal variant. Night
 * dimming follows only the setting and the clock now (DESIGN-V3 §1.1.2), so this does nothing.
 */
export function setDayPhase(_phase: string | null) {
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

/** True when motion should be reduced: the system setting or Settings › Profile › Display › Motion. */
export function useReducedMotionPref(): boolean {
  return useSyncExternalStore(subscribeMotion, motionSnapshot, () => false);
}

// The boot script that applies these attributes before first paint lives inline in
// src/app/layout.tsx (a server component can't import from this client module); keep the two in step.
