"use client";

import { useEffect, useMemo, useState } from "react";
import { useRecipePool } from "@/components/meals/shared/useRecipePool";
import { useTypicalDurations } from "@/components/training/hooks";
import { useLoggedPlannedMeals, useMealPrefs, usePlan, type PlanMeal } from "@/lib/data/meals";
import { useDailyNutrition, useFoodEntries, useWater, type FoodEntry } from "@/lib/data/nutrition";
import { useProfile } from "@/lib/data/profile";
import { planFor, useDayPlans, useSessions, useTemplates } from "@/lib/data/training";
import { addDays, weekStart, type ISODate } from "@/lib/dates";
import { buildTimeline, type Timeline, type TimelinePlanned } from "@/lib/fuel/timeline";
import { recipeMacros } from "@/lib/meals/recipe";
import type { Recipe } from "@/lib/meals/types";
import { effectiveTrainAt, parseAppPrefs, toMinutes, type Min } from "@/lib/prefs";
import { minuteOn } from "@/lib/today/now";
import { estimateDurationMin, templateLabels } from "@/lib/training/programs";

export interface FuelPlanned extends TimelinePlanned {
  local_date: ISODate;
  recipeKey: string;
  recipe: Recipe | null;
  name: string;
  locked: boolean;
  /** The stored planned meal (for the menu's swap and remove). */
  row: PlanMeal;
}

export interface FuelGoals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
}

/** Minutes since local midnight, re-read every 30 s and when the page comes back into view. */
export function useMinuteNow(): Min {
  const read = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const tick = () => setNow(read());
    const id = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}

/**
 * Everything Food shows for one day: the food log, water, the day's planned meals (with
 * their recipes and macros), today's session at his training time, and the merged timeline
 * (lib/fuel/timeline). Nothing here invents a number: missing pieces stay null.
 */
export function useFoodDay(date: ISODate, today: ISODate) {
  const { profile, loading: profileLoading, error: profileError, refetch: refetchProfile } = useProfile();
  const food = useFoodEntries(date);
  const water = useWater(date);
  const ws = weekStart(date);
  const plan = usePlan(ws);
  const links = useLoggedPlannedMeals(ws);
  const pool = useRecipePool();
  const mealPrefs = useMealPrefs();
  const { byKey } = useTemplates();
  const dayPlans = useDayPlans(date, date);
  const sessions = useSessions(date, date);
  const typical = useTypicalDurations();
  const now = useMinuteNow();

  const goals: FuelGoals | null = useMemo(
    () =>
      profile
        ? {
            kcal: Number(profile.calorie_goal) || 0,
            protein: Number(profile.protein_goal) || 0,
            carbs: Number(profile.carb_goal) || 0,
            fat: Number(profile.fat_goal) || 0,
            waterMl: Number(profile.water_goal_ml) || 0,
          }
        : null,
    [profile],
  );

  const appPrefs = useMemo(() => parseAppPrefs(profile?.prefs), [profile?.prefs]);

  // the session: one sealed on this day, else today's planned one at his usual time
  const session = useMemo(() => {
    if (!profile) return null;
    const done = (sessions.data ?? []).find((s) => s.local_date === date && s.status === "done");
    if (done) {
      const at = minuteOn(done.started_at, date);
      if (at == null) return null;
      return { name: done.name, at, durationMin: done.duration_sec ? Math.round(done.duration_sec / 60) : null, done: true, key: done.template_key ?? null };
    }
    if (date !== today) return null;
    const p = planFor(date, profile, dayPlans.data ?? [], byKey);
    if (!p.template) return null;
    const trainAt = effectiveTrainAt(appPrefs, profile.reminders);
    const at = trainAt ? toMinutes(trainAt) : Number.NaN;
    const durationMin = typical[p.template.key] ?? estimateDurationMin(p.template);
    return { name: p.template.name, at: Number.isNaN(at) ? null : at, durationMin, done: false, key: p.template.key };
  }, [profile, sessions.data, date, today, dayPlans.data, byKey, appPrefs, typical]);

  const planned: FuelPlanned[] = useMemo(
    () =>
      plan.meals
        .filter((m) => m.local_date === date)
        .map((m) => {
          const recipe = pool.lookup(m.recipe_key) ?? null;
          const macros = recipe ? recipeMacros(recipe, m.servings) : null;
          return {
            id: m.id,
            slot: m.slot,
            position: m.position,
            servings: m.servings,
            local_date: m.local_date,
            recipeKey: m.recipe_key,
            recipe,
            name: recipe?.name ?? "Planned meal",
            locked: m.locked,
            row: m,
            kcal: macros?.kcal ?? 0,
            protein: macros?.protein ?? 0,
            carbs: macros?.carbs ?? 0,
            fat: macros?.fat ?? 0,
          };
        }),
    [plan.meals, date, pool],
  );

  const timeline: Timeline<FoodEntry, FuelPlanned> = useMemo(
    () =>
      buildTimeline<FoodEntry, FuelPlanned>({
        date,
        today,
        now,
        planned,
        entries: food.entries,
        times: {
          schedule: appPrefs.day,
          snacksPerDay: mealPrefs.prefs.snacksPerDay,
          train: session && session.at != null ? { at: session.at, durationMin: session.durationMin } : session ? { at: null } : null,
        },
        minuteOf: (iso) => minuteOn(iso, date) ?? 0,
        loggedOn: links.logged,
        session: session && session.at != null ? { name: session.name, at: session.at, durationMin: session.durationMin, done: session.done } : null,
      }),
    [date, today, now, planned, food.entries, appPrefs.day, mealPrefs.prefs.snacksPerDay, session, links.logged],
  );

  return {
    profile,
    goals,
    profileLoading,
    profileError,
    refetchProfile,
    food,
    water,
    plan,
    hasPlanWeek: plan.meals.length > 0,
    planLoading: plan.loading || pool.loading,
    planned,
    timeline,
    lookup: pool.lookup,
    /** planned meal id → dates it was logged on (this week). */
    links: links.logged,
    session,
    now,
    appPrefs,
  };
}

export type FuelDay = ReturnType<typeof useFoodDay>;

/* ------------------------------------------------------------ the week */

export interface FoodWeekDay {
  date: ISODate;
  /** The day's workout in a word ("Arms", "Chest") or "Rest" — from program data. */
  label: string | null;
  /** Planned meals that day, and how many are in the food log. */
  planned: number;
  eaten: number;
  plannedKcal: number;
  plannedProtein: number;
  /** Logged food that day (the daily totals view); null when unknown. */
  loggedKcal: number | null;
  loggedEntries: number;
  proteinHit: boolean;
}

/**
 * The seven days of one plan week for the strip and the "This week" rows: the workout word from
 * the plan, planned meals and how many were eaten, planned and logged calories, and whether the
 * protein goal was hit. Every number is a count or a sum of rows; nothing is estimated.
 */
export function useFoodWeek(ws: ISODate) {
  const { profile } = useProfile();
  const plan = usePlan(ws);
  const links = useLoggedPlannedMeals(ws);
  const pool = useRecipePool();
  const { byKey } = useTemplates();
  const end = addDays(ws, 6);
  const dayPlans = useDayPlans(ws, end);
  const daily = useDailyNutrition(ws, end);
  const proteinGoal = Number(profile?.protein_goal) || 0;

  const days: FoodWeekDay[] = useMemo(() => {
    const out: FoodWeekDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(ws, i);
      const p = profile ? planFor(date, profile, dayPlans.data ?? [], byKey) : null;
      const label = !p ? null : p.template ? templateLabels(p.template).abbr || null : "Rest";
      const meals = plan.meals.filter((m) => m.local_date === date);
      let kcal = 0;
      let protein = 0;
      for (const m of meals) {
        const r = pool.lookup(m.recipe_key);
        if (!r) continue;
        const mac = recipeMacros(r, m.servings);
        kcal += mac.kcal;
        protein += mac.protein;
      }
      const d = (daily.data ?? []).find((x) => x.local_date === date);
      const loggedProtein = Number(d?.protein_g ?? 0);
      out.push({
        date,
        label,
        planned: meals.length,
        eaten: meals.filter((m) => (links.logged[m.id] ?? []).length > 0).length,
        plannedKcal: kcal,
        plannedProtein: protein,
        loggedKcal: daily.data ? Number(d?.calories ?? 0) : null,
        loggedEntries: Number(d?.entries ?? 0),
        proteinHit: proteinGoal > 0 && loggedProtein >= proteinGoal,
      });
    }
    return out;
  }, [ws, profile, dayPlans.data, byKey, plan.meals, pool, daily.data, links.logged, proteinGoal]);

  return { days, hasPlan: plan.meals.length > 0, loading: plan.loading || pool.loading, planLoaded: plan.hasData, error: plan.error };
}
