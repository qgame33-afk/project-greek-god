// Programme timeline maths for the Today hero: countdown, training week and the frieze.
// Everything is computed from profile.start_date / profile.target_date — nothing hardcoded.

import { daysBetween, monthName, parseISODate, weekStart, type ISODate } from "@/lib/dates";

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Whole days from today until the target date (never negative). */
export function daysLeft(today: ISODate, target: ISODate): number {
  return Math.max(0, daysBetween(today, target));
}

/** Total programme length in days (at least 1 so ratios never divide by zero). */
export function programDays(start: ISODate, target: ISODate): number {
  return Math.max(1, daysBetween(start, target));
}

/** Fraction of the programme already behind you, 0–1. */
export function timelineElapsed(start: ISODate, target: ISODate, today: ISODate): number {
  return clamp01(daysBetween(start, today) / programDays(start, target));
}

/**
 * Training week, Monday-aligned so it matches the Colonnade and the weekly overview.
 * Week 1 is the Monday–Sunday week that contains the start date. 0 before the start.
 */
export function trainingWeek(start: ISODate, today: ISODate): number {
  if (today < start) return 0;
  return Math.floor(daysBetween(weekStart(start), weekStart(today)) / 7) + 1;
}

/** Number of Monday-aligned weeks from the start week to the target week, inclusive. */
export function programWeeks(start: ISODate, target: ISODate): number {
  if (target < start) return 1;
  return Math.floor(daysBetween(weekStart(start), weekStart(target)) / 7) + 1;
}

/** "OCT 2026" */
export function monthYearCaps(d: ISODate): string {
  return `${monthName(d, true).toUpperCase()} ${d.slice(0, 4)}`;
}

/** "AUG 1, 2027" */
export function fullDateCaps(d: ISODate): string {
  return `${monthName(d, true).toUpperCase()} ${parseISODate(d).getDate()}, ${d.slice(0, 4)}`;
}

export interface Timeline {
  daysLeft: number;
  totalDays: number;
  elapsed: number;
  week: number;
  weeks: number;
  /** "DAYS TO AUG 1, 2027" (singular on the last day, a different line once the date passes) */
  countdownLabel: string;
  startLabel: string;
  endLabel: string;
  /** "11% of timeline" */
  caption: string;
  started: boolean;
  finished: boolean;
}

export function timeline(start: ISODate, target: ISODate, today: ISODate): Timeline {
  const left = daysLeft(today, target);
  const finished = today >= target;
  const started = today >= start;
  const elapsed = timelineElapsed(start, target, today);
  return {
    daysLeft: left,
    totalDays: programDays(start, target),
    elapsed,
    week: trainingWeek(start, today),
    weeks: programWeeks(start, target),
    countdownLabel: finished ? `TARGET DATE · ${fullDateCaps(target)}` : `${left === 1 ? "DAY" : "DAYS"} TO ${fullDateCaps(target)}`,
    startLabel: monthYearCaps(start),
    endLabel: monthYearCaps(target),
    caption: `${Math.round(elapsed * 100)}% of timeline`,
    started,
    finished,
  };
}
