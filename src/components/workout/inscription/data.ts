"use client";

import { useMemo } from "react";
import { useRecipePool } from "@/components/meals/shared/useRecipePool";
import { useProfile } from "@/lib/data/profile";
import { useFoodEntries } from "@/lib/data/nutrition";
import { useLoggedPlannedMeals, useMealPrefs, usePlan } from "@/lib/data/meals";
import { useRecovery } from "@/lib/data/recovery";
import { planFor, useDayPlans, useSessions, useTemplates, useVolleyball } from "@/lib/data/training";
import { weekDates, weekStart, type ISODate } from "@/lib/dates";
import { recipeMacros } from "@/lib/meals/recipe";
import { plannedTime } from "@/lib/now/meal-times";
import { parseAppPrefs, toMinutes } from "@/lib/prefs";
import { volleyballEntries } from "@/lib/recovery/volleyball";
import { weekDays, type ColonnadeDay } from "@/lib/training/schedule";
import { pickRefuel, type Refuel } from "@/lib/workout/refuel";

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

export type { Refuel } from "@/lib/workout/refuel";

/**
 * The Inscription's refuel card (§3.3): the first uneaten planned meal at or after the session's
 * end (less 30 min — the Day Engine's own refuel rule), and how much of today's protein gap it
 * closes. Arithmetic on the plan and the food log only (CALC). Null while loading or when the
 * session isn't today's. `keepId` is the planned meal just marked eaten on the card: while the
 * food log holds it, the card confirms that meal ("eaten") instead of moving on to the next one —
 * and if it is undone, the meal is simply the candidate again.
 */
export function useRefuel(date: ISODate | undefined, endedAt: string | null | undefined, today: ISODate, keepId: string | null = null): Refuel | null {
  const { profile } = useProfile();
  const isToday = !!date && date === today;
  const ws = isToday ? weekStart(date) : null;
  const plan = usePlan(ws);
  const logged = useLoggedPlannedMeals(ws);
  const food = useFoodEntries(isToday ? date! : today);
  const mealPrefs = useMealPrefs();
  const pool = useRecipePool();
  if (!isToday || !profile || plan.loading || !food.hasData) return null;
  const prefs = parseAppPrefs(profile.prefs);
  const trainAt = prefs.day.trainAt ? toMinutes(prefs.day.trainAt) : null;
  const ctx = { schedule: prefs.day, snacksPerDay: mealPrefs.prefs?.snacksPerDay ?? 2, train: { at: Number.isNaN(trainAt) ? null : trainAt } };
  const end = endedAt ? new Date(endedAt) : new Date();
  return pickRefuel({
    date: date!,
    goal: Number(profile.protein_goal) || 0,
    proteinEaten: food.totals.protein,
    meals: plan.meals,
    isLogged: (id) => !!logged.logged[id]?.length,
    resolve: (m) => {
      const recipe = pool.lookup(m.recipe_key);
      if (!recipe) return null;
      const mac = recipeMacros(recipe, m.servings);
      const at = plannedTime({ slot: m.slot, position: m.position }, ctx).at;
      return { planned: m, recipe, at, protein: Math.round(mac.protein), kcal: Math.round(mac.kcal), carbs: Math.round(mac.carbs), fat: Math.round(mac.fat) };
    },
    endMin: end.getHours() * 60 + end.getMinutes(),
    keepId,
  });
}
