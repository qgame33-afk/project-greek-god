import { addDays, daysBetween, type ISODate } from "./dates";
import { EARLY_WATER_DAYS, RATE_WINDOW_DAYS, rateAt } from "./progress/pace";
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
  monthlyChange: number | null; // avg7 vs the 7-day average ~30 days earlier (a change, never a rate)
  fromStart: number | null; // current trend weight − start weight
  toGoal: number | null; // goal − current trend weight
  progressPct: number; // 0–100, start → goal, based on trend weight
  count: number;
}

/**
 * Bodyweight statistics. "Trend weight" = 7-day average when available, else the last
 * weigh-in — daily water swings make single readings misleading. There is no weekly rate
 * here: the only lb-a-week number is pace.rateAt (DESIGN-V2 §4.1.1).
 */
export function weightStats(w: WeighIn[], startLb: number, goalLb: number, ref: ISODate): WeightStats {
  const s = sortWeighIns(w);
  const last = s.at(-1) ?? null;
  const anchor = last && daysBetween(last.local_date, ref) > 7 ? last.local_date : ref;
  const avg7 = avgWindow(s, anchor);
  const prevMonth = avgWindow(s, addDays(anchor, -30));
  const trend = avg7 ?? (last ? Number(last.weight_lb) : null);
  return {
    current: last ? Number(last.weight_lb) : null,
    currentDate: last?.local_date ?? null,
    avg7,
    monthlyChange: avg7 != null && prevMonth != null ? round(avg7 - prevMonth, 2) : null,
    fromStart: trend != null ? round(trend - startLb, 2) : null,
    toGoal: trend != null ? round(goalLb - trend, 2) : null,
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

/**
 * The calorie rule's verdict. `since` is set when the rule judged only the weigh-ins after a
 * calorie change ("since your calorie change on 3 Oct"); without it the window is the usual
 * 28 days ending today. `from`/`to`/`weighIns` say exactly which weigh-ins were judged.
 */
export type CalorieSuggestion =
  | { kind: "insufficient"; daysOfData: number; weighIns: number; since?: ISODate | null }
  | { kind: "on_track"; ratePerWeek: number; targetRate: number; earlyWater?: boolean; since?: ISODate | null; from?: ISODate; weighIns?: number }
  | { kind: "increase"; ratePerWeek: number; targetRate: number; delta: number; earlyWater?: boolean; since?: ISODate | null; from?: ISODate; weighIns?: number }
  | { kind: "reassess"; ratePerWeek: number; targetRate: number; delta: number; earlyWater?: boolean; since?: ISODate | null; from?: ISODate; weighIns?: number }
  | { kind: "cooldown"; lastChange: ISODate; nextCheck: ISODate };

/** The calorie rule asks for more evidence than the pace line: ≥ 8 weigh-ins spanning ≥ 13 days. */
export const CALORIE_RULE_MIN_WEIGHINS = 8;
export const CALORIE_RULE_MIN_SPAN = 13;
export const CALORIE_COOLDOWN_DAYS = 14;

type CallExtra = { earlyWater?: boolean; since: ISODate | null; from: ISODate; weighIns: number };

function calorieCall(rate: number, targetRatePerWeek: number, x: CallExtra): CalorieSuggestion {
  const target = Math.max(0.1, targetRatePerWeek);
  const extra = { since: x.since, from: x.from, weighIns: x.weighIns, ...(x.earlyWater ? { earlyWater: true } : {}) };
  // A slow-gain phase: anything below half the target pace means intake is likely short.
  if (rate < target * 0.5) {
    // ~3500 kcal ≈ 1 lb is a rough rule; cap the change at a modest 100–250 kcal step.
    const delta = Math.min(250, Math.max(100, Math.round((((target - rate) * 3500) / 7) / 50) * 50));
    return { kind: "increase", ratePerWeek: rate, targetRate: target, delta, ...extra };
  }
  if (rate > Math.max(target * 2, target + 0.5)) {
    const delta = -Math.min(250, Math.max(100, Math.round((((rate - target) * 3500) / 7) / 50) * 50));
    return { kind: "reassess", ratePerWeek: rate, targetRate: target, delta, ...extra };
  }
  return { kind: "on_track", ratePerWeek: rate, targetRate: target, ...extra };
}

/**
 * The calorie rule (SPEC §12). Never applies anything — the UI asks first.
 *
 * - After a calorie change it waits 14 days (cooldown), so the same data can't trigger a
 *   second change.
 * - Then it judges ONLY the weigh-ins dated after that change: the same least-squares rate
 *   function as every screen (pace.rateAt), over (change, today] when the change falls
 *   inside the 28-day window, else over the usual 28 days. So a call never mixes weeks
 *   eaten at the old target into the verdict on the new one. `since` carries the change
 *   date for the copy ("since your calorie change on 3 Oct").
 * - It needs ≥ 8 weigh-ins spanning ≥ 13 days inside that window.
 * - `earlyWater` is set when the judged window overlaps the programme's first 14 days.
 *
 * The rate the rule reports is therefore the rate SINCE THE CHANGE; every other screen keeps
 * showing the one 28-day rate (DESIGN-V2 §4.1.1, lead decision on the calorie rule).
 */
export function calorieSuggestion(
  w: WeighIn[],
  ref: ISODate,
  targetRatePerWeek: number,
  lastCalorieChange: ISODate | null,
  programStart?: ISODate | null,
): CalorieSuggestion {
  if (lastCalorieChange && daysBetween(lastCalorieChange, ref) < CALORIE_COOLDOWN_DAYS) {
    return { kind: "cooldown", lastChange: lastCalorieChange, nextCheck: addDays(lastCalorieChange, CALORIE_COOLDOWN_DAYS) };
  }
  const windowStart = addDays(ref, -(RATE_WINDOW_DAYS - 1));
  // The change only narrows the window when it falls inside it; an older change means the
  // whole 28-day window is already post-change data.
  const since = lastCalorieChange && lastCalorieChange >= windowStart ? lastCalorieChange : null;
  // Weigh-ins on the change day itself were taken before the new target took effect.
  const judged = since ? w.filter((x) => x.local_date > since) : w;
  const rate = rateAt(judged, ref);
  const from = since ? addDays(since, 1) : windowStart;
  const days = rate.spanDays + (rate.n ? 1 : 0);
  if (rate.status !== "ok" || rate.lbPerWeek == null || rate.n < CALORIE_RULE_MIN_WEIGHINS || rate.spanDays < CALORIE_RULE_MIN_SPAN) {
    return { kind: "insufficient", daysOfData: days, weighIns: rate.n, since };
  }
  const earlyWater = !!programStart && from <= addDays(programStart, EARLY_WATER_DAYS - 1) && ref >= programStart;
  return calorieCall(rate.lbPerWeek, targetRatePerWeek, { earlyWater, since, from, weighIns: rate.n });
}

/**
 * The rate the calorie rule aims for: what it takes to get from today's trend to the goal
 * weight by the target date, else the programme's planned rate. One definition, shared by
 * Ascent and the coach.
 */
export function calorieTargetRate(trendLb: number | null, startLb: number, goalLb: number, startDate: ISODate, targetDate: ISODate, today: ISODate): number {
  const req = trendLb != null ? requiredWeeklyGain(trendLb, goalLb, today, targetDate) : null;
  if (req != null) return req;
  return round((goalLb - startLb) / Math.max(1, daysBetween(startDate, targetDate) / 7), 2);
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
  { offset: 4, title: "Food check", detail: "Reassess caloric intake and recovery." },
  { offset: 5, title: "Midpoint", detail: "Midpoint physique evaluation." },
  { offset: 6, title: "Keep climbing", detail: "Continue progressive muscle gain." },
  { offset: 7, title: "Composition check", detail: "Evaluate current body composition." },
  { offset: 8, title: "Decide the path", detail: "Determine whether to continue gaining or maintain." },
  { offset: 9, title: "Refine", detail: "Optional maintenance or modest fat-loss phase if appropriate." },
  { offset: 10, title: "Final review", detail: "Final transformation review." },
];
