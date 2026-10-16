// Daily mission / habit evaluation. Pure functions over real logged data, so the Today
// checklist, the Recovery & Habits page and the monthly calendar always agree.
// Auto missions can't be ticked by hand — they complete when the underlying tracker does.

import { addDays, type ISODate } from "./dates";
import { caloriesHit, proteinHit } from "./nutrition";
import { formatInt } from "./units";

export interface HabitDefLite {
  key: string;
  label: string;
  kind: "auto" | "value" | "check";
  target: number | null;
  unit: string | null;
  active: boolean;
  sort: number;
}

export interface DayFacts {
  date: ISODate;
  isTrainingDay: boolean;
  plannedName: string | null;
  workoutDone: boolean;
  calories: number;
  protein: number;
  waterMl: number;
  weighedIn: boolean;
  sleepHours: number | null;
  recoveryLogged: boolean;
  /** manual habit logs for this date, keyed by habit key */
  logs: Record<string, { done: boolean; value: number | null }>;
}

export interface Goals {
  calorie_goal: number;
  protein_goal: number;
  water_goal_ml: number;
  sleep_goal_h: number;
  steps_goal: number;
}

export interface HabitStatus {
  key: string;
  label: string;
  kind: "auto" | "value" | "check";
  done: boolean;
  /** 0–1 partial progress for the mini ring */
  progress: number;
  caption: string;
  /** true when a tracker drives it (cannot be toggled by hand) */
  auto: boolean;
  /** where tapping should take the user to complete it */
  href?: string;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

export function evaluate(defs: HabitDefLite[], f: DayFacts, g: Goals): HabitStatus[] {
  return defs
    .filter((d) => d.active)
    .sort((a, b) => a.sort - b.sort)
    .map((d): HabitStatus => {
      const log = f.logs[d.key];
      switch (d.key) {
        case "workout":
          return f.isTrainingDay
            ? {
                key: d.key,
                label: f.plannedName ? `Train · ${f.plannedName}` : "Complete today's training",
                kind: "auto",
                auto: true,
                done: f.workoutDone,
                progress: f.workoutDone ? 1 : 0,
                caption: f.workoutDone ? "Session finished" : "Completes when you finish the session",
                href: "/training",
              }
            : {
                key: d.key,
                label: "Recovery day",
                kind: "auto",
                auto: true,
                done: f.recoveryLogged || f.workoutDone,
                progress: f.recoveryLogged || f.workoutDone ? 1 : 0,
                caption: f.recoveryLogged ? "Check-in logged" : "Log a recovery check-in",
                href: "/recovery?checkin=1",
              };
        case "protein":
          return {
            key: d.key,
            label: "Protein goal",
            kind: "auto",
            auto: true,
            done: proteinHit(f.protein, g.protein_goal),
            progress: clamp01(f.protein / g.protein_goal),
            caption: `${Math.round(f.protein)} of ${g.protein_goal} g`,
            href: "/nutrition",
          };
        case "calories":
          return {
            key: d.key,
            label: "Calorie goal",
            kind: "auto",
            auto: true,
            done: caloriesHit(f.calories, g.calorie_goal),
            progress: clamp01(f.calories / g.calorie_goal),
            caption: `${formatInt(f.calories)} of ${formatInt(g.calorie_goal)} kcal${f.calories > g.calorie_goal * 1.1 ? " · over the ±10% window" : ""}`,
            href: "/nutrition",
          };
        case "water":
          return {
            key: d.key,
            label: "Hydration",
            kind: "auto",
            auto: true,
            done: f.waterMl >= g.water_goal_ml,
            progress: clamp01(f.waterMl / g.water_goal_ml),
            caption: `${(f.waterMl / 1000).toFixed(1)} of ${(g.water_goal_ml / 1000).toFixed(1)} L`,
            href: "/nutrition",
          };
        case "weighin":
          return {
            key: d.key,
            label: "Log bodyweight",
            kind: "auto",
            auto: true,
            done: f.weighedIn,
            progress: f.weighedIn ? 1 : 0,
            caption: f.weighedIn ? "Logged" : "Morning weigh-in",
            href: "/progress?log=weight",
          };
        case "sleep":
          return {
            key: d.key,
            label: "Sleep",
            kind: "auto",
            auto: true,
            done: f.sleepHours != null && f.sleepHours >= g.sleep_goal_h,
            progress: clamp01((f.sleepHours ?? 0) / g.sleep_goal_h),
            caption: f.sleepHours != null ? `${f.sleepHours} of ${g.sleep_goal_h} h` : "Log last night's sleep",
            href: "/recovery?checkin=1",
          };
        case "steps": {
          const v = log?.value ?? null;
          const target = d.target ?? g.steps_goal;
          return {
            key: d.key,
            label: "Steps",
            kind: "value",
            auto: false,
            done: v != null && v >= target,
            progress: clamp01((v ?? 0) / target),
            caption: v != null ? `${formatInt(v)} of ${formatInt(target)}` : `Goal ${formatInt(target)}`,
          };
        }
        default:
          if (d.kind === "value") {
            const v = log?.value ?? null;
            const target = d.target ?? 1;
            return {
              key: d.key,
              label: d.label,
              kind: "value",
              auto: false,
              done: v != null && v >= target,
              progress: clamp01((v ?? 0) / target),
              caption: v != null ? `${v} of ${target}${d.unit ? ` ${d.unit}` : ""}` : `Goal ${target}${d.unit ? ` ${d.unit}` : ""}`,
            };
          }
          return { key: d.key, label: d.label, kind: "check", auto: false, done: !!log?.done, progress: log?.done ? 1 : 0, caption: log?.done ? "Done" : "Tap when done" };
      }
    });
}

/** A day counts toward the consistency streak when at least 60% of its missions are complete. */
export const STREAK_THRESHOLD = 0.6;

export function dayScore(statuses: HabitStatus[]) {
  const total = statuses.length;
  const done = statuses.filter((s) => s.done).length;
  return { done, total, ratio: total ? done / total : 0 };
}

/**
 * Consecutive qualifying days ending today — or yesterday when today is still in progress,
 * so an unfinished morning never "breaks" a streak.
 */
export function streak(ratios: Record<ISODate, number>, today: ISODate) {
  let d = (ratios[today] ?? 0) >= STREAK_THRESHOLD ? today : addDays(today, -1);
  let n = 0;
  while ((ratios[d] ?? 0) >= STREAK_THRESHOLD) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
