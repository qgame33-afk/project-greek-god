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
import { planFor, scheduleOf, usePREvents, useDayPlans, useSessions, useTemplates, useVolleyball, type Session } from "@/lib/data/training";
import { useRecentHistory, useStartWorkout } from "@/lib/data/workout";
import { addDays, weekDates, weekday, type ISODate } from "@/lib/dates";
import { recipeMacros } from "@/lib/meals/recipe";
import type { Recipe, Slot } from "@/lib/meals/types";
import { sessionsSealed } from "@/lib/adherence";
import { plannedTime } from "@/lib/now/meal-times";
import { effectiveTrainAt, parseAppPrefs, toMinutes } from "@/lib/prefs";
import { gildFraction, pace as paceOf, terraces, trendSeries } from "@/lib/progress/pace";
import { useReadiness } from "@/lib/recovery/hooks";
import { volleyballEntries } from "@/lib/recovery/volleyball";
import { nextSession } from "@/lib/today/plan";
import { latestRecords } from "@/lib/today/records";
import { estimateDurationMin } from "@/lib/training/program";
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
  at: number;
  role: "breakfast" | "lunch" | "dinner" | "snack" | "pre" | "post";
  eaten: boolean;
}

/**
 * Everything Now shows, from the shared data hooks (docs/DESIGN-V2.md §3.1). The trend, rate,
 * projection, verdict and gild come from lib/progress/pace and are never recomputed here.
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
  const vb = useVolleyball(week[0], week[6]);
  const mission = useMissionDays(today, today);
  const workout = useStartWorkout();
  const plan = usePlan(today);
  const mealPrefs = useMealPrefs();
  const pool = useRecipePool();
  const typical = useTypicalDurations();
  const readiness = useReadiness(today);
  const qc = useQueryClient();

  const todayPlan = useMemo(() => (profile ? planFor(today, profile, plans.data ?? [], byKey) : null), [profile, today, plans.data, byKey]);
  const slugs = useMemo(() => todayPlan?.template?.exercises.map((e) => e.slug) ?? [], [todayPlan]);
  const history = useRecentHistory(slugs);

  const model = useMemo(() => {
    if (!profile || !todayPlan) return null;
    const unit: WeightUnit = profile.weight_unit === "kg" ? "kg" : "lb";
    const mode = (profile.training_mode ?? "standard") as Mode;
    const plansRows = plans.data ?? [];
    const resolve = (d: ISODate) => planFor(d, profile, plansRows, byKey);
    const template = todayPlan.template;

    // sessions
    const all: Session[] = sessions.data ?? [];
    const doneToday = all.filter((s) => s.local_date === today && s.status === "done").sort((a, b) => (b.ended_at ?? "").localeCompare(a.ended_at ?? ""))[0] ?? null;
    const active = workout.active;

    // recovery and volleyball
    const recRows = recovery.data ?? [];
    const todayRec = recRows.find((r) => r.local_date === today) ?? null;
    const vbDays = volleyballEntries(vb.data ?? [], recRows);
    const volleyballToday = vbDays.some((v) => v.local_date === today);

    // the one trend, rate, projection and verdict
    const pace = paceOf({ weighIns: weights, today, profile, unit });
    const startLb = profile.start_weight_lb == null ? null : Number(profile.start_weight_lb);
    const goalLb = profile.goal_weight_lb == null ? null : Number(profile.goal_weight_lb);
    const validCount = weights.filter((w) => w.local_date <= today && Number(w.weight_lb) > 0).length;
    const gild = startLb != null && goalLb != null ? gildFraction(pace.trend.lb, startLb, goalLb, validCount) : 0;
    const series = trendSeries(weights, undefined, today);
    const terraceList = startLb != null && pace.band ? terraces(pace, series, startLb, pace.band.min) : [];
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
          at: t.at,
          role: t.role,
          eaten: eatenIds.has(m.id),
        };
      })
      .sort((a, b) => a.at - b.at || a.position - b.position);

    // this week's sessions sealed (one volleyball swap counts)
    const schedule = scheduleOf(profile);
    const days = week.map((d) => {
      const p = resolve(d);
      const scheduled = schedule[String(weekday(d))] ?? "rest";
      const played = vbDays.some((v) => v.local_date === d);
      // days before the programme started were never planned
      const before = !!profile.start_date && d < profile.start_date;
      const kind: "train" | "rest" | "volleyball" = before ? "rest" : p.template ? "train" : played && scheduled !== "rest" ? "volleyball" : "rest";
      const done = kind === "volleyball" ? played : all.some((s) => s.local_date === d && s.status === "done");
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
      volleyballToday,
      pace,
      gild,
      weighInCount: validCount,
      terraces: terraceList,
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
      waterMl: water.totalMl,
      waterLogs: water.logs,
      sealed,
      next,
      record: records[0] ?? null,
      sessionRecords,
      mission: mission.days.find((d) => d.date === today) ?? null,
      history: history.data ?? {},
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
    vb.data,
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
    history.data,
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
