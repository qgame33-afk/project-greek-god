"use client";

import { useMemo } from "react";
import { useRecipePool } from "@/components/meals/shared/useRecipePool";
import { useProfile } from "@/lib/data/profile";
import { useFoodEntries } from "@/lib/data/nutrition";
import { useLoggedPlannedMeals, useMealPrefs, usePlan, type PlanMeal } from "@/lib/data/meals";
import { useRecovery } from "@/lib/data/recovery";
import { planFor, useDayPlans, useSessions, useTemplates, useVolleyball } from "@/lib/data/training";
import { weekDates, weekStart, type ISODate } from "@/lib/dates";
import { recipeMacros } from "@/lib/meals/recipe";
import type { Recipe } from "@/lib/meals/types";
import { plannedTime } from "@/lib/now/meal-times";
import { parseAppPrefs, toMinutes } from "@/lib/prefs";
import { volleyballEntries } from "@/lib/recovery/volleyball";
import { weekDays, type ColonnadeDay } from "@/lib/training/schedule";

/**
 * The week of a session as the temple shows it (the same weekDays rule Train uses): planned
 * days from the profile's schedule and day_plans overrides, sealed sessions, volleyball (logged
 * sessions plus check-in switches).
 */
export function useSessionWeek(date: ISODate | undefined, today: ISODate): ColonnadeDay[] | null {
  const { profile } = useProfile();
  const { byKey, loading } = useTemplates();
  const dates = useMemo(() => (date ? weekDates(date) : []), [date]);
  const from = dates[0] ?? today;
  const to = dates[6] ?? today;
  const plans = useDayPlans(from, to);
  const sessions = useSessions(from, to);
  const vb = useVolleyball(from, to);
  const rec = useRecovery(from, to);
  return useMemo(() => {
    if (!date || loading || plans.isLoading || sessions.isLoading) return null;
    const planLikes = dates.map((d) => {
      const p = planFor(d, profile ?? undefined, plans.data ?? [], byKey);
      return { date: d, key: p.key, name: p.template?.name ?? null, overridden: p.overridden, reason: p.reason, movedFrom: p.movedFrom };
    });
    return weekDays({ dates, plans: planLikes, sessions: sessions.data ?? [], volleyball: volleyballEntries(vb.data ?? [], rec.data ?? []), today });
  }, [date, dates, loading, plans.isLoading, plans.data, sessions.isLoading, sessions.data, vb.data, rec.data, profile, byKey, today]);
}

export interface Refuel {
  kind: "meal" | "none" | "met";
  /** Grams of protein still to eat today (never below 0). */
  gap: number;
  goal: number;
  eaten: number;
  meal?: { planned: PlanMeal; recipe: Recipe; at: number; protein: number; kcal: number; carbs: number; fat: number };
}

/**
 * The Inscription's refuel card (§3.3): the first uneaten planned meal at or after the session's
 * end (less 30 min — the Day Engine's own refuel rule), and how much of today's protein gap it
 * closes. Arithmetic on the plan and the food log only (CALC). Null while loading or when the
 * session isn't today's.
 */
export function useRefuel(date: ISODate | undefined, endedAt: string | null | undefined, today: ISODate): Refuel | null {
  const { profile } = useProfile();
  const isToday = !!date && date === today;
  const ws = isToday ? weekStart(date) : null;
  const plan = usePlan(ws);
  const logged = useLoggedPlannedMeals(ws);
  const food = useFoodEntries(isToday ? date! : today);
  const mealPrefs = useMealPrefs();
  const pool = useRecipePool();
  return (() => {
    if (!isToday || !profile || plan.loading || !food.hasData) return null;
    const goal = Number(profile.protein_goal) || 0;
    const eaten = Math.round(food.totals.protein);
    const gap = Math.max(0, goal - eaten);
    if (goal > 0 && gap === 0) return { kind: "met", gap, goal, eaten };
    const prefs = parseAppPrefs(profile.prefs);
    const trainAt = prefs.day.trainAt ? toMinutes(prefs.day.trainAt) : null;
    const end = endedAt ? new Date(endedAt) : new Date();
    const endMin = end.getHours() * 60 + end.getMinutes();
    const ctx = { schedule: prefs.day, snacksPerDay: mealPrefs.prefs?.snacksPerDay ?? 2, train: { at: Number.isNaN(trainAt) ? null : trainAt } };
    const candidates = plan.meals
      .filter((m) => m.local_date === date && !(logged.logged[m.id]?.length))
      .map((m) => ({ m, at: plannedTime({ slot: m.slot, position: m.position }, ctx).at }))
      .filter((x) => x.at >= endMin - 30)
      .sort((a, b) => a.at - b.at);
    for (const c of candidates) {
      const recipe = pool.lookup(c.m.recipe_key);
      if (!recipe) continue;
      const mac = recipeMacros(recipe, c.m.servings);
      return { kind: "meal", gap, goal, eaten, meal: { planned: c.m, recipe, at: c.at, protein: Math.round(mac.protein), kcal: Math.round(mac.kcal), carbs: Math.round(mac.carbs), fat: Math.round(mac.fat) } };
    }
    return { kind: "none", gap, goal, eaten };
  })();
}
