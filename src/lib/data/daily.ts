"use client";

import { useMemo } from "react";
import { dateRange, type ISODate } from "@/lib/dates";
import { dayScore, evaluate, streak, type DayFacts, type Goals, type HabitDefLite, type HabitStatus } from "@/lib/habits";
import { habitsOn } from "@/lib/recovery/habit-history";
import { useWeights } from "./body";
import { useDailyNutrition, useDailyWater } from "./nutrition";
import { useProfile } from "./profile";
import { useHabitDefs, useHabitLogs, useRecovery } from "./recovery";
import { planFor, useDayPlans, useSessions, useTemplates } from "./training";

export interface MissionDay {
  date: ISODate;
  statuses: HabitStatus[];
  done: number;
  total: number;
  ratio: number;
  workoutDone: boolean;
  isTrainingDay: boolean;
}

/**
 * Evaluates every daily mission for each date in [from, to] from the real trackers.
 * One hook powers the Today checklist, the habits list, the monthly calendar and streaks.
 */
export function useMissionDays(from: ISODate, to: ISODate) {
  const { profile, loading: pLoading } = useProfile();
  const defs = useHabitDefs();
  const { byKey } = useTemplates();
  const plans = useDayPlans(from, to);
  const sessions = useSessions(from, to);
  const food = useDailyNutrition(from, to);
  const water = useDailyWater(from, to);
  const { weights, loading: wLoading } = useWeights();
  const recovery = useRecovery(from, to);
  const logs = useHabitLogs(from, to);

  const loading = pLoading || defs.isLoading || sessions.isLoading || food.isLoading || water.isLoading || wLoading || recovery.isLoading || logs.isLoading;

  const days = useMemo<MissionDay[]>(() => {
    if (!profile) return [];
    const goals: Goals = {
      calorie_goal: profile.calorie_goal,
      protein_goal: profile.protein_goal,
      water_goal_ml: profile.water_goal_ml,
      sleep_goal_h: Number(profile.sleep_goal_h),
      steps_goal: profile.steps_goal,
    };
    const defList: (HabitDefLite & { created_at: string })[] = (defs.data ?? []).map((d) => ({ key: d.key, label: d.label, kind: d.kind as HabitDefLite["kind"], target: d.target == null ? null : Number(d.target), unit: d.unit, active: d.active, sort: d.sort, created_at: d.created_at }));
    const doneByDate = new Set((sessions.data ?? []).filter((s) => s.status === "done").map((s) => s.local_date));
    const foodBy = new Map((food.data ?? []).map((r) => [r.local_date!, r]));
    const waterBy = new Map((water.data ?? []).map((r) => [r.local_date!, r.total_ml ?? 0]));
    const weighed = new Set(weights.map((w) => w.local_date));
    const recBy = new Map((recovery.data ?? []).map((r) => [r.local_date, r]));
    const logBy = new Map<string, Record<string, { done: boolean; value: number | null }>>();
    for (const l of logs.data ?? []) {
      const m = logBy.get(l.local_date) ?? {};
      m[l.habit_key] = { done: l.done, value: l.value == null ? null : Number(l.value) };
      logBy.set(l.local_date, m);
    }
    return dateRange(from, to).map((date) => {
      const plan = planFor(date, profile, plans.data ?? [], byKey);
      const f = foodBy.get(date);
      const rec = recBy.get(date);
      const facts: DayFacts = {
        date,
        isTrainingDay: plan.key !== "rest",
        plannedName: plan.template?.name ?? null,
        workoutDone: doneByDate.has(date),
        calories: Number(f?.calories ?? 0),
        protein: Number(f?.protein_g ?? 0),
        waterMl: waterBy.get(date) ?? 0,
        weighedIn: weighed.has(date),
        sleepHours: rec?.sleep_hours == null ? null : Number(rec.sleep_hours),
        recoveryLogged: !!rec,
        logs: logBy.get(date) ?? {},
      };
      // a custom habit only counts from the day it was created — adding one never rewrites history
      const statuses = evaluate(habitsOn(defList, date), facts, goals);
      const s = dayScore(statuses);
      return { date, statuses, ...s, workoutDone: facts.workoutDone, isTrainingDay: facts.isTrainingDay };
    });
  }, [profile, defs.data, sessions.data, food.data, water.data, weights, recovery.data, logs.data, plans.data, byKey, from, to]);

  return { days, loading };
}

/** Streak over a window ending today (looks back up to `lookback` days). */
export function useStreak(today: ISODate, from: ISODate) {
  const { days, loading } = useMissionDays(from, today);
  const value = useMemo(() => streak(Object.fromEntries(days.map((d) => [d.date, d.ratio])), today), [days, today]);
  return { streak: value, loading };
}
