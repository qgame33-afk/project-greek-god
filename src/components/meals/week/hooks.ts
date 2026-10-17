"use client";

// Week-planner wiring: everything the engine needs for one plan week, gathered from the data
// hooks (src/lib/data/meals.ts), plus two small feature hooks the shared ones don't cover:
// adding meals to an existing week (repeat, fill a day, add a snack) and removing them quietly
// (the Undo of those adds).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { must, newId, sb, useUser } from "@/lib/data/core";
import {
  mealKeys,
  optimisticPlanMeal,
  sortPlanMeals,
  useFavourites,
  useLoggedPlannedMeals,
  useMealFeedback,
  useMealPrefs,
  useMealWeek,
  usePlan,
  usePlannedMealsRange,
  validateNewMeals,
  type NewPlannedMeal,
  type WeekPlan,
} from "@/lib/data/meals";
import { useProfile } from "@/lib/data/profile";
import { addDays, type ISODate } from "@/lib/dates";
import type { Goals } from "@/lib/meals/engine";
import type { MealPrefs } from "@/lib/meals/types";
import type { Json } from "@/lib/supabase/database.types";
import { useRecipePool } from "../shared/useRecipePool";
import { plannerContext } from "./model";

export interface DayGoals extends Goals {
  carbs: number;
  fat: number;
}

/**
 * One plan week (offset 0 = this week, 1 = next) and everything around it: prefs, the recipe
 * pool, learned feedback, favourites, the 14 days before it (cooldowns), what's already in the
 * food log, and the profile's goals. `ready` is true only when every input the engine relies on
 * has loaded — so a plan is never made without the user's allergies and dislikes.
 */
export function usePlannerData(offset: number) {
  const week = useMealWeek(offset);
  const ws = week.weekStart;
  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const prefsQ = useMealPrefs();
  const recipes = useRecipePool();
  const feedbackQ = useMealFeedback();
  const favs = useFavourites();
  const historyQ = usePlannedMealsRange(addDays(ws, -14), addDays(ws, -1));
  const plan = usePlan(ws);
  const logged = useLoggedPlannedMeals(ws);

  const goals: DayGoals | null = useMemo(
    () =>
      profile
        ? { kcal: Number(profile.calorie_goal) || 0, protein: Number(profile.protein_goal) || 0, carbs: Number(profile.carb_goal) || 0, fat: Number(profile.fat_goal) || 0 }
        : null,
    [profile],
  );
  const hasGoals = !!goals && goals.kcal > 0 && goals.protein > 0;

  const feedback = feedbackQ.data;
  const history = historyQ.data;
  const loggedIds = useMemo(() => Object.keys(logged.logged), [logged.logged]);

  const ready = !!profile && prefsQ.hasData && recipes.hasData && !!feedback && favs.hasData && !!history && plan.hasData && logged.hasData;
  const error = profileError ?? prefsQ.error ?? recipes.error ?? feedbackQ.error ?? favs.error ?? historyQ.error ?? plan.error ?? null;

  /**
   * The engine context right now (null until ready and goals are set). `meals` overrides the
   * week's meals; `prefs` overrides the stored prefs (a dislike added a moment ago).
   */
  const makeContext = useCallback(
    (opts: { seed?: string; meals?: WeekPlan["meals"]; prefs?: MealPrefs; wholeWeek?: boolean; keepIds?: readonly string[] } = {}) =>
      ready
        ? plannerContext({
            weekStart: ws,
            goals,
            prefs: opts.prefs ?? prefsQ.prefs,
            pool: recipes.pool,
            feedback: feedback ?? [],
            favourites: favs.favourites,
            history: history ?? [],
            meals: opts.meals ?? plan.meals,
            loggedIds: opts.keepIds ? [...loggedIds, ...opts.keepIds] : loggedIds,
            seed: opts.seed,
            // mid-week the current week is planned from today on; make-ahead meals never land on today
            today: week.today,
            wholeWeek: opts.wholeWeek,
          })
        : null,
    [ready, ws, goals, prefsQ.prefs, recipes.pool, feedback, favs.favourites, history, plan.meals, loggedIds, week.today],
  );

  return {
    week,
    goals,
    hasGoals,
    profileLoading,
    prefs: prefsQ.prefs,
    prefsSaved: prefsQ.saved,
    lookup: recipes.lookup,
    feedback: feedback ?? [],
    favourites: favs,
    plan: plan.plan,
    meals: plan.meals,
    planLoading: plan.loading,
    planLoaded: plan.hasData,
    refetchPlan: plan.refetch,
    logged: logged.logged,
    loggedIds,
    ready,
    error,
    makeContext,
  };
}

function invalidatePlans(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["meal-plan"] });
  qc.invalidateQueries({ queryKey: ["meal-planned-range"] });
}

/**
 * Add meals to a week that already has a plan (repeat a meal, fill an empty day, add a snack).
 * Optimistic; ids are made here so the caller can Undo with useRemovePlannedMeals. Shares the
 * planned-meals queue with every other plan edit, so it never races a week save.
 */
export function useAddPlannedMeals() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return useMutation({
    scope: { id: "planned-meals" },
    mutationFn: async ({ planId, weekStart, meals }: { planId: string; weekStart: ISODate; meals: (NewPlannedMeal & { id: string })[] }) => {
      const rows = validateNewMeals(meals, weekStart).map((m) => ({
        id: m.id!,
        plan_id: planId,
        local_date: m.local_date,
        slot: m.slot,
        position: m.position ?? 0,
        recipe_key: m.recipe_key,
        servings: m.servings,
        locked: m.locked ?? false,
        reason: (m.reason ?? null) as Json | null,
        history: (m.history ?? []) as unknown as NonNullable<Json>,
      }));
      must(await sb().from("planned_meals").upsert(rows, { onConflict: "id", ignoreDuplicates: true }));
      return rows.map((r) => r.id);
    },
    onMutate: async ({ planId, weekStart, meals }) => {
      const key = mealKeys.plan(weekStart, userId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WeekPlan>(key);
      if (prev) {
        const now = new Date().toISOString();
        const ids = new Set(meals.map((m) => m.id));
        qc.setQueryData<WeekPlan>(key, { ...prev, meals: sortPlanMeals([...prev.meals.filter((m) => !ids.has(m.id)), ...meals.map((m) => optimisticPlanMeal(m, planId, m.id, now))]) });
      }
      return { key, prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't add that meal", { description: e.message });
    },
    onSettled: () => invalidatePlans(qc),
  });
}

/** Remove planned meals without a toast of their own (used as the Undo of an add). */
export function useRemovePlannedMeals() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return useMutation({
    scope: { id: "planned-meals" },
    mutationFn: async ({ ids }: { ids: string[]; weekStart: ISODate }) => {
      if (ids.length) must(await sb().from("planned_meals").delete().in("id", ids));
    },
    onMutate: async ({ ids, weekStart }) => {
      const key = mealKeys.plan(weekStart, userId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WeekPlan>(key);
      if (prev) qc.setQueryData<WeekPlan>(key, { ...prev, meals: prev.meals.filter((m) => !ids.includes(m.id)) });
      return { key, prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't undo", { description: e.message });
    },
    onSettled: () => invalidatePlans(qc),
  });
}

export { newId };
