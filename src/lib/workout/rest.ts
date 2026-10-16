// Rest timer math. Pure: every function takes the current time in whole epoch seconds
// (the same unit the shared live clock ticks in), so the digits, the ring and the
// "ended ago" line all agree and nothing drifts across a refresh or backgrounding.

import type { ExerciseCategory } from "@/lib/training/types";

export interface RestState {
  sessionId: string;
  /** Epoch seconds when the rest started (after the last adjustment, elapsed is preserved). */
  startSec: number;
  /** Epoch seconds when the rest ends. Ignored while paused. */
  endSec: number;
  /** Total length in seconds (grows/shrinks with ±15 so the ring stays proportional). */
  total: number;
  /** Seconds left when paused; null while running. */
  pausedRemaining: number | null;
  /** The set that started this rest (unlogging it cancels the rest). */
  fromSetId: string | null;
  /** Exercise that was just trained. */
  exercise: string;
  /** What comes next: { exercise, set: "Set 3", load: "185 × 6" }. */
  next: { setId: string | null; exercise: string; set: string; load: string | null } | null;
  /** True once the GO moment has played (so a refresh never replays it). */
  doneShown: boolean;
}

export const MIN_REST = 0;
export const MAX_REST = 15 * 60;
/** When rest ends while the app is hidden, "Rest ended 0:42 ago" is shown instead of GO. */
export const STALE_END_SEC = 3;

export function startRest(
  nowSec: number,
  totalSec: number,
  meta: Pick<RestState, "sessionId" | "fromSetId" | "exercise" | "next">,
): RestState {
  const total = clampRest(Math.round(totalSec));
  return { ...meta, startSec: nowSec, endSec: nowSec + total, total, pausedRemaining: null, doneShown: false };
}

export function clampRest(sec: number) {
  return Math.min(MAX_REST, Math.max(MIN_REST, Number.isFinite(sec) ? sec : 0));
}

/** Seconds left (never negative). */
export function remainingSec(s: RestState, nowSec: number): number {
  if (s.pausedRemaining != null) return Math.max(0, s.pausedRemaining);
  return Math.max(0, s.endSec - nowSec);
}

/** Seconds already rested, for the ring's negative animation-delay. */
export function elapsedSec(s: RestState, nowSec: number): number {
  return Math.max(0, Math.min(s.total, s.total - remainingSec(s, nowSec)));
}

/** 0 → 1 as the rest drains (1 = done). */
export function restProgress(s: RestState, nowSec: number): number {
  if (s.total <= 0) return 1;
  return Math.min(1, elapsedSec(s, nowSec) / s.total);
}

export function isRunning(s: RestState | null, nowSec: number) {
  return !!s && s.pausedRemaining == null && remainingSec(s, nowSec) > 0;
}

/** True while counting the last ten seconds (digits turn gold). */
export function isFinalStretch(remaining: number) {
  return remaining > 0 && remaining <= 10;
}

/**
 * ±15. Elapsed time is preserved, so the ring keeps its place and only the total changes.
 * Never goes below zero remaining.
 */
export function adjustRest(s: RestState, deltaSec: number, nowSec: number): RestState {
  const rem = remainingSec(s, nowSec);
  const nextRem = Math.max(0, Math.min(MAX_REST, rem + deltaSec));
  const applied = nextRem - rem;
  const total = Math.max(elapsedSec(s, nowSec) + nextRem, 0);
  if (s.pausedRemaining != null) return { ...s, pausedRemaining: nextRem, total, endSec: s.endSec + applied };
  return { ...s, endSec: nowSec + nextRem, total, doneShown: nextRem > 0 ? false : s.doneShown };
}

export function pauseRest(s: RestState, nowSec: number): RestState {
  if (s.pausedRemaining != null) return s;
  return { ...s, pausedRemaining: remainingSec(s, nowSec) };
}

export function resumeRest(s: RestState, nowSec: number): RestState {
  if (s.pausedRemaining == null) return s;
  return { ...s, endSec: nowSec + s.pausedRemaining, pausedRemaining: null };
}

/** How long ago the rest ended (0 while still running or paused). */
export function endedAgoSec(s: RestState, nowSec: number): number {
  if (s.pausedRemaining != null) return 0;
  return Math.max(0, nowSec - s.endSec);
}

/** The rest ended while nobody was looking (app hidden / reloaded). */
export function endedWhileAway(s: RestState, nowSec: number) {
  return !s.doneShown && s.pausedRemaining == null && endedAgoSec(s, nowSec) > STALE_END_SEC;
}

const MARKS: [number, string][] = [
  [60, "1 minute of rest left"],
  [30, "30 seconds left"],
  [10, "10 seconds left"],
  [0, "Rest over. Next set."],
];

/**
 * Screen-reader line when the countdown crosses 60, 30, 10 or 0 seconds.
 * `prev` is the last remaining value announced against (null on first render).
 */
export function announcement(prev: number | null, remaining: number): string | null {
  if (prev == null || remaining >= prev) return null;
  for (const [mark, text] of MARKS) if (prev > mark && remaining <= mark) return text;
  return null;
}

/** m:ss with a real colon; hours roll into minutes (rest never runs that long). */
export function formatClock(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Default rest when a set has no prescribed rest_sec. Programme rules: heavy compounds
 * 2–3 min or more, isolation 60–120 s, explosive work full recovery.
 */
export function defaultRestSec(category: ExerciseCategory | undefined, libraryRest?: number): number {
  if (libraryRest && libraryRest > 0) return libraryRest;
  switch (category) {
    case "compound":
      return 150;
    case "explosive":
      return 120;
    case "carry":
      return 90;
    case "core":
      return 60;
    case "isolation":
      return 75;
    default:
      return 90;
  }
}
