"use client";

import { useEffect, useMemo, useState } from "react";
import { useRecipePool } from "@/components/meals/shared/useRecipePool";
import { useTypicalDurations } from "@/components/training/hooks";
import { useLoggedPlannedMeals, useMealPrefs, usePlan, type PlanMeal } from "@/lib/data/meals";
import { useFoodEntries, useWater, type FoodEntry } from "@/lib/data/nutrition";
import { useProfile } from "@/lib/data/profile";
import { planFor, useDayPlans, useSessions, useTemplates } from "@/lib/data/training";
import { weekStart, type ISODate } from "@/lib/dates";
import { buildTimeline, type Timeline, type TimelinePlanned } from "@/lib/fuel/timeline";
import { recipeMacros } from "@/lib/meals/recipe";
import type { Recipe } from "@/lib/meals/types";
import { effectiveTrainAt, parseAppPrefs, toMinutes, type Min } from "@/lib/prefs";
import { minuteOn } from "@/lib/today/now";
import { estimateDurationMin } from "@/lib/training/program";

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
 * Everything Fuel → Today shows for one day: the food log, water, the day's planned meals (with
 * their recipes and macros), today's session at his training time, and the merged timeline
 * (lib/fuel/timeline). Nothing here invents a number: missing pieces stay null.
 */
export function useFuelDay(date: ISODate, today: ISODate) {
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
    session,
    now,
    appPrefs,
  };
}

export type FuelDay = ReturnType<typeof useFuelDay>;
