// One definition per adherence word (DESIGN-V2 §4.6). The labels are always "Plan followed
// X of Y" and "X of Y sessions" — never a percentage of some other base. Pure.

import { weekDates, type ISODate } from "@/lib/dates";
import type { Min } from "@/lib/prefs";

/** A planned meal counts as due this long after its planned time. */
export const MEAL_DUE_AFTER_MIN = 120;

/**
 * Planned meals with a linked food entry ÷ planned meals that were due (date < today, or
 * today and at + 120 ≤ now). A meal already eaten counts as due too, so an early Eaten
 * shows at once and done never exceeds due. Future days are ignored.
 */
export function planFollowed(planned: { id: string; local_date: ISODate; at: Min }[], loggedIds: Set<string>, today: ISODate, now: Min): { done: number; due: number } {
  let done = 0;
  let due = 0;
  for (const m of planned) {
    if (m.local_date > today) continue;
    const eaten = loggedIds.has(m.id);
    const isDue = m.local_date < today || m.at + MEAL_DUE_AFTER_MIN <= now;
    if (!isDue && !eaten) continue;
    due++;
    if (eaten) done++;
  }
  return { done, due };
}

/**
 * Sealed sessions ÷ planned training days this week (Mon–Sun of `today`).
 * - `train`: a planned training day; `done` = a session was sealed that day.
 * - `volleyball`: a planned training day swapped for volleyball; `done` = it was played.
 *   One swap per week counts as sealed; more than one count only as planned.
 * - `rest`: not planned; a session sealed on a rest day (`done`) still counts, up to the plan.
 * Only days up to today can be done.
 */
export function sessionsSealed(days: { date: ISODate; kind: "train" | "rest" | "volleyball"; done: boolean }[], today: ISODate): { done: number; planned: number } {
  const week = new Set(weekDates(today));
  const byDate = new Map<ISODate, { kind: "train" | "rest" | "volleyball"; done: boolean }>();
  for (const d of days) if (week.has(d.date)) byDate.set(d.date, d);
  let planned = 0;
  let sealed = 0;
  let swaps = 0;
  for (const [date, d] of byDate) {
    if (d.kind !== "rest") planned++;
    if (!d.done || date > today) continue;
    if (d.kind === "volleyball") swaps++;
    else sealed++;
  }
  return { done: Math.min(planned, sealed + Math.min(1, swaps)), planned };
}

/** "Plan followed 24 of 28", "4 of 6 sessions". Null-safe: nothing due yet reads "—". */
export function planFollowedLabel(r: { done: number; due: number }): string {
  return r.due === 0 ? "Plan followed —" : `Plan followed ${r.done} of ${r.due}`;
}
export function sessionsLabel(r: { done: number; planned: number }): string {
  return r.planned === 0 ? "No sessions planned" : `${r.done} of ${r.planned} sessions`;
}
