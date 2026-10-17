// When each planned meal is meant to be eaten (DESIGN-V2 §4.4). The meal planner makes
// breakfast, lunch, dinner and 1–3 numbered snacks with no times; this places them at the
// user's day schedule (profiles.prefs.day) and, on a training day with a known time, moves
// the snack nearest the pre-workout slot to exactly an hour (preWorkoutMin) before it.
// Pure. Used by the Day Engine (Now), Fuel's timeline and the Offering's slot inference.

import type { Slot } from "@/lib/meals/types";
import { DEFAULT_DAY_SCHEDULE, toMinutes, type DaySchedule, type Min } from "@/lib/prefs";

export type MealRole = "breakfast" | "lunch" | "dinner" | "snack" | "pre" | "post";

/** A snack moves to the pre-workout slot only when its own time is this close to it. */
export const PRE_SNACK_REACH_MIN = 180;
/** Session length assumed when the template's typical duration is unknown. */
export const DEFAULT_SESSION_MIN = 75;

export interface MealTimeContext {
  schedule: DaySchedule;
  /** The meal plan's snacks per day (1–3; the planner's own clamp applies). */
  snacksPerDay: number;
  /** Today's session: null on a rest day; `at` null when no training time is set. */
  train: { at: Min | null; durationMin?: number | null } | null;
}

const minutesOr = (hhmm: string, fallback: string) => {
  const v = toMinutes(hhmm);
  return Number.isNaN(v) ? toMinutes(fallback) : v;
};

/** The planner's clamp (meals engine): 1–3, default 2. */
export function snackCount(snacksPerDay: number): number {
  return Math.min(3, Math.max(1, Math.round(snacksPerDay) || 2));
}

/** Default times of the day's snacks by count: 1 → [s2], 2 → [s2, s3], 3 → [s1, s2, s3]. */
export function snackTimes(schedule: DaySchedule, snacksPerDay: number): Min[] {
  const d = DEFAULT_DAY_SCHEDULE.meals.snacks;
  const s = schedule.meals.snacks;
  const all = [minutesOr(s[0], d[0]), minutesOr(s[1], d[1]), minutesOr(s[2], d[2])];
  const n = snackCount(snacksPerDay);
  return n === 1 ? [all[1]] : n === 2 ? [all[1], all[2]] : all;
}

/** Index of the snack that becomes the pre-workout snack, or -1. Ties go to the earlier snack. */
function preSnackIndex(times: Min[], target: Min): number {
  let best = -1;
  let bestGap = Infinity;
  times.forEach((t, i) => {
    const gap = Math.abs(t - target);
    if (gap <= PRE_SNACK_REACH_MIN && gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  });
  return best;
}

/**
 * The planned time and role of one meal.
 * - Mains use their meal time.
 * - Snack positions map by count (see snackTimes). A position past the count (a snack
 *   moved in from another day) uses the 3-snack time for its position.
 * - Training day with a time: the snack closest to `at − preWorkoutMin` (within 180 min)
 *   moves to exactly that time with role "pre"; the first main meal at or after
 *   `at + duration` (75 min when unknown) gets role "post" without moving.
 */
export function plannedTime(m: { slot: Slot; position: number }, ctx: MealTimeContext): { at: Min; role: MealRole } {
  const { schedule } = ctx;
  const d = DEFAULT_DAY_SCHEDULE.meals;
  const at = ctx.train?.at ?? null;
  const mains = {
    breakfast: minutesOr(schedule.meals.breakfast, d.breakfast),
    lunch: minutesOr(schedule.meals.lunch, d.lunch),
    dinner: minutesOr(schedule.meals.dinner, d.dinner),
  };

  if (m.slot !== "snack") {
    const t = mains[m.slot];
    if (at != null) {
      const end = at + (ctx.train?.durationMin && ctx.train.durationMin > 0 ? ctx.train.durationMin : DEFAULT_SESSION_MIN);
      const post = (["breakfast", "lunch", "dinner"] as const).filter((k) => mains[k] >= end).sort((a, b) => mains[a] - mains[b])[0];
      if (post === m.slot) return { at: t, role: "post" };
    }
    return { at: t, role: m.slot };
  }

  const times = snackTimes(schedule, ctx.snacksPerDay);
  const pos = Math.max(0, Math.floor(m.position));
  const own = times[pos] ?? snackTimes(schedule, 3)[Math.min(2, pos)];
  if (at != null && pos < times.length) {
    const target = at - (Number.isFinite(schedule.preWorkoutMin) ? schedule.preWorkoutMin : DEFAULT_DAY_SCHEDULE.preWorkoutMin);
    if (preSnackIndex(times, target) === pos) return { at: Math.max(0, target), role: "pre" };
  }
  return { at: own, role: "snack" };
}

/** Order for a day's meals by planned time (ties: breakfast, lunch, dinner, then snacks by position). */
export function compareMealTimes(a: { at: Min; slot: Slot; position: number }, b: { at: Min; slot: Slot; position: number }): number {
  const rank: Record<Slot, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
  return a.at - b.at || rank[a.slot] - rank[b.slot] || a.position - b.position;
}
