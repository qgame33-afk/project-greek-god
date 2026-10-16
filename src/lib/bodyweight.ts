import { addDays, daysBetween, type ISODate } from "./dates";
import { round } from "./units";

export interface WeighIn {
  local_date: ISODate;
  weight_lb: number;
}

/** Sorted ascending by date. */
export function sortWeighIns<T extends WeighIn>(w: T[]): T[] {
  return [...w].sort((a, b) => a.local_date.localeCompare(b.local_date));
}

/** Mean of weigh-ins in the 7 days ending on `end` (inclusive). Null when none. */
export function avgWindow(w: WeighIn[], end: ISODate, days = 7): number | null {
  const start = addDays(end, -(days - 1));
  const xs = w.filter((x) => x.local_date >= start && x.local_date <= end).map((x) => Number(x.weight_lb));
  if (!xs.length) return null;
  return round(xs.reduce((a, b) => a + b, 0) / xs.length, 2);
}

/** Rolling 7-day average series, one point per weigh-in date. */
export function rollingAverage(w: WeighIn[], days = 7): { local_date: ISODate; avg: number }[] {
  const s = sortWeighIns(w);
  return s.map((x) => ({ local_date: x.local_date, avg: avgWindow(s, x.local_date, days)! }));
}

export interface WeightStats {
  current: number | null; // most recent weigh-in
  currentDate: ISODate | null;
  avg7: number | null; // 7-day average ending today (or at the last weigh-in if older)
  weeklyChange: number | null; // avg7 vs the 7-day average one week earlier
  monthlyChange: number | null; // avg7 vs the 7-day average ~30 days earlier
  fromStart: number | null; // current trend weight − start weight
  toGoal: number | null; // goal − current trend weight
  ratePerWeek: number | null; // average gain per week since the first weigh-in
  progressPct: number; // 0–100, start → goal, based on trend weight
  count: number;
}

/**
 * Bodyweight statistics. "Trend weight" = 7-day average when available, else the last
 * weigh-in — daily water swings make single readings misleading.
 */
export function weightStats(w: WeighIn[], startLb: number, goalLb: number, ref: ISODate): WeightStats {
  const s = sortWeighIns(w);
  const last = s.at(-1) ?? null;
  const anchor = last && daysBetween(last.local_date, ref) > 7 ? last.local_date : ref;
  const avg7 = avgWindow(s, anchor);
  const prevWeek = avgWindow(s, addDays(anchor, -7));
  const prevMonth = avgWindow(s, addDays(anchor, -30));
  const trend = avg7 ?? (last ? Number(last.weight_lb) : null);
  const first = s[0] ?? null;
  let ratePerWeek: number | null = null;
  if (first && last && trend != null) {
    const days = daysBetween(first.local_date, last.local_date);
    if (days >= 7) ratePerWeek = round(((trend - Number(first.weight_lb)) / days) * 7, 2);
  }
  return {
    current: last ? Number(last.weight_lb) : null,
    currentDate: last?.local_date ?? null,
    avg7,
    weeklyChange: avg7 != null && prevWeek != null ? round(avg7 - prevWeek, 2) : null,
    monthlyChange: avg7 != null && prevMonth != null ? round(avg7 - prevMonth, 2) : null,
    fromStart: trend != null ? round(trend - startLb, 2) : null,
    toGoal: trend != null ? round(goalLb - trend, 2) : null,
    ratePerWeek,
    progressPct: progressPct(trend ?? startLb, startLb, goalLb),
    count: s.length,
  };
}

/** Percent of the way from start to goal, clamped 0–100. */
export function progressPct(current: number, start: number, goal: number) {
  if (goal === start) return 100;
  const p = ((current - start) / (goal - start)) * 100;
  return Math.max(0, Math.min(100, round(p, 1)));
}

/** Required average gain per week to reach the goal by the target date. */
export function requiredWeeklyGain(currentLb: number, goalLb: number, from: ISODate, target: ISODate) {
  const weeks = daysBetween(from, target) / 7;
  if (weeks <= 0) return null;
  return round((goalLb - currentLb) / weeks, 2);
}

/** Planned (illustrative) trajectory: straight line from start → goal between the two dates. */
export function plannedWeight(date: ISODate, start: ISODate, target: ISODate, startLb: number, goalLb: number) {
  const total = daysBetween(start, target);
  if (total <= 0) return goalLb;
  const t = Math.max(0, Math.min(1, daysBetween(start, date) / total));
  return round(startLb + (goalLb - startLb) * t, 2);
}

export type CalorieSuggestion =
  | { kind: "insufficient"; daysOfData: number; weighIns: number }
  | { kind: "on_track"; ratePerWeek: number; targetRate: number }
  | { kind: "increase"; ratePerWeek: number; targetRate: number; delta: number }
  | { kind: "reassess"; ratePerWeek: number; targetRate: number; delta: number }
  | { kind: "cooldown"; lastChange: ISODate; nextCheck: ISODate };

/**
 * Two-week trend check. Compares the average of the last 7 days to the 7 days before.
 * Needs ≥14 days spanned and ≥8 weigh-ins. Never applies anything — the UI asks first.
 * After a goal change, waits 14 days so the same data can't trigger a second change.
 */
export function calorieSuggestion(
  w: WeighIn[],
  ref: ISODate,
  targetRatePerWeek: number,
  lastCalorieChange: ISODate | null,
): CalorieSuggestion {
  if (lastCalorieChange && daysBetween(lastCalorieChange, ref) < 14) {
    return { kind: "cooldown", lastChange: lastCalorieChange, nextCheck: addDays(lastCalorieChange, 14) };
  }
  const since = lastCalorieChange && lastCalorieChange > addDays(ref, -27) ? lastCalorieChange : addDays(ref, -27);
  const recent = sortWeighIns(w).filter((x) => x.local_date >= since && x.local_date <= ref);
  const span = recent.length ? daysBetween(recent[0].local_date, recent.at(-1)!.local_date) : 0;
  if (span < 13 || recent.length < 8) return { kind: "insufficient", daysOfData: span + (recent.length ? 1 : 0), weighIns: recent.length };
  const a = avgWindow(recent, ref);
  const b = avgWindow(recent, addDays(ref, -7));
  if (a == null || b == null) return { kind: "insufficient", daysOfData: span + 1, weighIns: recent.length };
  const rate = round(a - b, 2);
  const target = Math.max(0.1, targetRatePerWeek);
  // A slow-gain phase: anything below half the target pace means intake is likely short.
  if (rate < target * 0.5) {
    // ~3500 kcal ≈ 1 lb is a rough rule; cap the change at a modest 100–250 kcal step.
    const delta = Math.min(250, Math.max(100, Math.round((((target - rate) * 3500) / 7) / 50) * 50));
    return { kind: "increase", ratePerWeek: rate, targetRate: target, delta };
  }
  if (rate > Math.max(target * 2, target + 0.5)) {
    const delta = -Math.min(250, Math.max(100, Math.round((((rate - target) * 3500) / 7) / 50) * 50));
    return { kind: "reassess", ratePerWeek: rate, targetRate: target, delta };
  }
  return { kind: "on_track", ratePerWeek: rate, targetRate: target };
}

export interface RoadmapMonth {
  month: ISODate; // first day of month
  title: string;
  detail: string;
}

export const DEFAULT_ROADMAP: { offset: number; title: string; detail: string }[] = [
  { offset: 0, title: "The start", detail: "Start at 163 lb. Baseline weigh-ins, photos and measurements." },
  { offset: 1, title: "Build the habits", detail: "Establish consistent training and nutrition." },
  { offset: 2, title: "First progress review", detail: "Compare trend weight, lifts and photos to October." },
  { offset: 3, title: "Strength and size", detail: "Strength and hypertrophy progression." },
  { offset: 4, title: "Fuel check", detail: "Reassess calorie intake and recovery." },
  { offset: 5, title: "Midpoint", detail: "Midpoint physique evaluation." },
  { offset: 6, title: "Keep climbing", detail: "Continue progressive muscle gain." },
  { offset: 7, title: "Composition check", detail: "Evaluate current body composition." },
  { offset: 8, title: "Decide the path", detail: "Determine whether to continue gaining or maintain." },
  { offset: 9, title: "Refine", detail: "Optional maintenance or modest fat-loss phase, only if appropriate." },
  { offset: 10, title: "Final review", detail: "Final transformation review." },
];
