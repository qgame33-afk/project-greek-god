"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useRecipePool } from "@/components/meals/shared/useRecipePool";
import { useTypicalDurations } from "@/components/training/hooks";
import { useToday } from "@/lib/data/core";
import { useMissionDays } from "@/lib/data/daily";
import { useWeights } from "@/lib/data/body";
import { useMealPrefs, usePlan } from "@/lib/data/meals";
import { useFoodEntries, useWater } from "@/lib/data/nutrition";
import { useProfile } from "@/lib/data/profile";
import { useRecovery } from "@/lib/data/recovery";
import { planFor, usePREvents, useDayPlans, useSessions, useTemplates, type Session } from "@/lib/data/training";
import { useStartWorkout } from "@/lib/data/workout";
import { addDays, weekDates, type ISODate } from "@/lib/dates";
import { recipeMacros } from "@/lib/meals/recipe";
import type { Recipe, Slot } from "@/lib/meals/types";
import { sessionsSealed } from "@/lib/adherence";
import { plannedTime } from "@/lib/now/meal-times";
import { effectiveTrainAt, parseAppPrefs, toMinutes } from "@/lib/prefs";
import { pace as paceOf } from "@/lib/progress/pace";
import { useReadiness } from "@/lib/recovery/hooks";
import { nextSession } from "@/lib/today/plan";
import { latestRecords } from "@/lib/today/records";
import { estimateDurationMin } from "@/lib/training/programs";
import { getExercise } from "@/lib/training/library";
import { plannedSetCount, type Mode } from "@/lib/training/progression";
import type { WeightUnit } from "@/lib/units";

export interface NowMeal {
  id: string;
  slot: Slot;
  position: number;
  local_date: ISODate;
  name: string;
  servings: number;
  recipe: Recipe | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  at: number;
  role: "breakfast" | "lunch" | "dinner" | "snack" | "pre" | "post";
  eaten: boolean;
}

/**
 * Everything Today shows (docs/DESIGN-V3-SIMPLE.md §4.1), from the shared data hooks. The 7-day
 * average and the pace call come from lib/progress/pace and are never recomputed here. The Add
 * sheet reads the same model (meals, template, durationMin, setCount, active).
 */
export function useNowData() {
  const today = useToday();
  const week = useMemo(() => weekDates(today), [today]);
  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const { byKey, loading: templatesLoading } = useTemplates();
  const plans = useDayPlans(week[0], addDays(today, 8));
  const sessions = useSessions(week[0], today);
  const { weights, loading: weightsLoading, error: weightsError } = useWeights();
  const food = useFoodEntries(today);
  const water = useWater(today);
  const recovery = useRecovery(addDays(today, -13), today);
  const prs = usePREvents(addDays(today, -365), today);
  // this week for the strip, and yesterday too: after midnight Up next closes the day that just ended
  const mission = useMissionDays(addDays(today, -1) < week[0] ? addDays(today, -1) : week[0], today);
  const workout = useStartWorkout();
  const plan = usePlan(today);
  const mealPrefs = useMealPrefs();
  const pool = useRecipePool();
  const typical = useTypicalDurations();
  const readiness = useReadiness(today);
  const qc = useQueryClient();

  const todayPlan = useMemo(() => (profile ? planFor(today, profile, plans.data ?? [], byKey) : null), [profile, today, plans.data, byKey]);

  const model = useMemo(() => {
    if (!profile || !todayPlan) return null;
    const unit: WeightUnit = (profile.weight_unit as WeightUnit | null) ?? "kg";
    const mode = (profile.training_mode ?? "standard") as Mode;
    const plansRows = plans.data ?? [];
    const resolve = (d: ISODate) => planFor(d, profile, plansRows, byKey);
    const template = todayPlan.template;

    // sessions
    const all: Session[] = sessions.data ?? [];
    const doneToday = all.filter((s) => s.local_date === today && s.status === "done").sort((a, b) => (b.ended_at ?? "").localeCompare(a.ended_at ?? ""))[0] ?? null;
    const active = workout.active;

    // the check-in
    const recRows = recovery.data ?? [];
    const todayRec = recRows.find((r) => r.local_date === today) ?? null;

    // the one trend, rate, projection and verdict
    const pace = paceOf({ weighIns: weights, today, profile, unit });
    const validCount = weights.filter((w) => w.local_date <= today && Number(w.weight_lb) > 0).length;
    const weighToday = weights.find((w) => w.local_date === today) ?? null;

    // the session
    const durationMin = template ? (typical[template.key] ?? estimateDurationMin(template)) : null;
    const setCount = template ? template.exercises.reduce((n, e) => n + plannedSetCount(e, getExercise(e.slug), mode), 0) : 0;
    const appPrefs = parseAppPrefs(profile.prefs);
    const trainAtStr = effectiveTrainAt(appPrefs, profile.reminders);
    const trainAt = trainAtStr ? toMinutes(trainAtStr) : null;

    // planned meals of today, placed at his times
    const eatenIds = new Set(food.entries.map((e) => e.planned_meal_id).filter((x): x is string => !!x));
    const train = template ? { at: Number.isNaN(trainAt) ? null : trainAt, durationMin } : null;
    const meals: NowMeal[] = plan.meals
      .filter((m) => m.local_date === today)
      .map((m) => {
        const recipe = pool.lookup(m.recipe_key) ?? null;
        const macros = recipe ? recipeMacros(recipe, m.servings) : null;
        const t = plannedTime({ slot: m.slot, position: m.position }, { schedule: appPrefs.day, snacksPerDay: mealPrefs.prefs.snacksPerDay, train });
        return {
          id: m.id,
          slot: m.slot,
          position: m.position,
          local_date: m.local_date,
          name: recipe?.name ?? "Planned meal",
          servings: m.servings,
          recipe,
          kcal: macros?.kcal ?? 0,
          protein: macros?.protein ?? 0,
          carbs: macros?.carbs ?? 0,
          fat: macros?.fat ?? 0,
          at: t.at,
          role: t.role,
          eaten: eatenIds.has(m.id),
        };
      })
      .sort((a, b) => a.at - b.at || a.position - b.position);

    // this week's workouts done of planned
    const days = week.map((d) => {
      const p = resolve(d);
      // days before the programme started were never planned
      const before = !!profile.start_date && d < profile.start_date;
      const kind: "train" | "rest" = before ? "rest" : p.template ? "train" : "rest";
      const done = all.some((s) => s.local_date === d && s.status === "done");
      return { date: d, kind, done };
    });
    const sealed = sessionsSealed(days, today);

    const nextRaw = nextSession(today, (d) => resolve(d).template);
    const nextKey = nextRaw ? resolve(nextRaw.date).template?.key : undefined;
    const next = nextRaw ? { ...nextRaw, minutes: (nextKey && typical[nextKey]) || nextRaw.minutes } : null;
    const prRows = prs.data ?? [];
    const records = latestRecords(prRows, 1);
    const sessionRecords = doneToday ? latestRecords(prRows.filter((p) => p.session_id === doneToday.id), 20).length : 0;

    return {
      today,
      week,
      profile,
      unit,
      mode,
      appPrefs,
      todayPlan,
      template,
      durationMin,
      setCount,
      trainAt: train?.at ?? null,
      active,
      doneToday,
      todayRec,
      recRows,
      pace,
      weighInCount: validCount,
      weighToday,
      weights,
      // a block that failed to load (and has nothing saved to show) says so, never "none yet"
      weightsFailed: !!weightsError && weights.length === 0,
      sessionsFailed: !!sessions.error && sessions.data === undefined,
      recoveryFailed: !!recovery.error && recovery.data === undefined,
      mealsFailed: !!plan.error && !plan.hasData,
      meals,
      mealsLoading: plan.loading || pool.loading,
      hasPlan: !!plan.plan,
      food: food.totals,
      foodFailed: !!food.error && food.entries.length === 0,
      /** Food entries logged today (0 → "—" and the next step, not "0 g"). */
      foodLogged: food.entries.length,
      foodEntries: food.entries,
      resolve,
      waterMl: water.totalMl,
      waterLogs: water.logs,
      sealed,
      next,
      record: records[0] ?? null,
      sessionRecords,
      mission: mission.days.find((d) => d.date === today) ?? null,
      yesterday: mission.days.find((d) => d.date === addDays(today, -1)) ?? null,
      missionDays: mission.days,
    };
  }, [
    profile,
    todayPlan,
    plans.data,
    byKey,
    sessions.data,
    sessions.error,
    recovery.error,
    plan.error,
    plan.hasData,
    today,
    workout.active,
    recovery.data,
    weights,
    weightsError,
    typical,
    food.entries,
    food.totals,
    food.error,
    plan.meals,
    plan.loading,
    plan.plan,
    pool,
    mealPrefs.prefs.snacksPerDay,
    week,
    prs.data,
    water.totalMl,
    water.logs,
    mission.days,
  ]);

  const coreLoading = profileLoading || templatesLoading || plans.isLoading || sessions.isLoading || weightsLoading || food.loading;

  return {
    model,
    loading: coreLoading,
    profileError,
    missionLoading: mission.loading,
    readiness,
    workout,
    errors: { sessions: sessions.error, weights: weightsError, food: food.error, meals: plan.error },
    refetch: {
      weights: () => qc.invalidateQueries({ queryKey: ["weights"] }),
      food: () => void food.refetch(),
      sessions: () => void sessions.refetch(),
      meals: () => void plan.refetch(),
      recovery: () => void recovery.refetch(),
      all: () => qc.refetchQueries({ predicate: (q) => q.state.status === "error" || q.queryKey[0] === "profile" }),
    },
  };
}

export type NowData = ReturnType<typeof useNowData>;
export type NowModel = NonNullable<NowData["model"]>;
