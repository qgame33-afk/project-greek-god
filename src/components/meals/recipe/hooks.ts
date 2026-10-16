"use client";

// Recipe-screen data: the planned meal behind `?meal=<id>`, the thumbs state, the servings
// write-back and the AI availability check. Reads and writes go through the meal planner's data
// hooks (src/lib/data/meals) wherever one exists; the one direct read here (a planned meal's
// date, to find its week) is under RLS like every other.

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { must, sb, useToday, useUser } from "@/lib/data/core";
import { useAddFeedback, useDeleteFeedback, useMealFeedback, usePlan, useUpdatePlannedMeal, weekStart, type WeekPlan } from "@/lib/data/meals";
import { recipeFeatures } from "@/lib/meals/recipe";
import type { Recipe } from "@/lib/meals/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The week of a planned meal already in the cache (opened from the week view). */
function cachedWeekOf(qc: QueryClient, id: string): string | null {
  for (const [, week] of qc.getQueriesData<WeekPlan>({ queryKey: ["meal-plan"] })) {
    const m = week?.meals.find((x) => x.id === id);
    if (m) return weekStart(m.local_date);
  }
  return null;
}

/**
 * The planned meal behind `?meal=<id>`, live from its week's plan cache (so servings and swaps
 * show at once). `missing` once we know it's gone (removed, or not this account's).
 */
export function usePlannedMealById(id: string | null | undefined) {
  const qc = useQueryClient();
  const { userId } = useUser();
  const valid = !!id && UUID.test(id);
  const cachedWeek = useMemo(() => (valid ? cachedWeekOf(qc, id!) : null), [qc, id, valid]);
  const q = useQuery({
    queryKey: ["meal-planned-one", id, userId],
    enabled: !!userId && valid && !cachedWeek,
    queryFn: async (): Promise<{ id: string; local_date: string } | null> =>
      must(await sb().from("planned_meals").select("id, local_date").eq("id", id!).maybeSingle()) as { id: string; local_date: string } | null,
  });
  const ws = cachedWeek ?? (q.data ? weekStart(q.data.local_date) : null);
  const plan = usePlan(ws);
  const meal = valid ? (plan.meals.find((m) => m.id === id) ?? null) : null;
  const missing = !!id && (!valid || (q.isSuccess && !q.data) || (plan.hasData && !meal));
  const loading = !!id && !missing && !meal && (q.isLoading || plan.loading || (!ws && !q.isError));
  return { meal, plan: plan.plan, weekStart: ws, loading, missing, error: q.error ?? plan.error };
}

/**
 * Servings changes on the recipe screen are written back to the planned meal after a short
 * pause (a run of taps is one write), and on leaving the screen.
 */
export function useServingsWriteBack(mealId: string | null | undefined, weekStartDate: string | null) {
  const update = useUpdatePlannedMeal();
  const pending = useRef<{ id: string; servings: number; ws: string | null } | null>(null);
  const timer = useRef<number | null>(null);
  const mutate = update.mutate;
  const flush = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) mutate({ id: p.id, patch: { servings: p.servings }, weekStart: p.ws ?? undefined });
  }, [mutate]);
  useEffect(() => flush, [flush]);
  const schedule = useCallback(
    (servings: number) => {
      if (!mealId) return;
      pending.current = { id: mealId, servings, ws: weekStartDate };
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 500);
    },
    [mealId, weekStartDate, flush],
  );
  return { schedule, flush, isPending: () => pending.current != null };
}

/** The current thumbs for a recipe (the newest thumbs row), with toggle + Undo. */
export function useThumbs(recipe: Recipe | undefined) {
  const fb = useMealFeedback(365);
  const add = useAddFeedback();
  const del = useDeleteFeedback();
  const key = recipe?.key ?? "";
  const current = useMemo(() => fb.data?.find((f) => f.recipe_key === key && (f.event === "thumbs_up" || f.event === "thumbs_down")) ?? null, [fb.data, key]);
  const state: "up" | "down" | null = current ? (current.event === "thumbs_up" ? "up" : "down") : null;

  const set = (want: "up" | "down") => {
    if (!recipe) return;
    const prev = current;
    if (state === want && prev) {
      // tapping the lit thumb takes it back
      del.mutate(prev.id);
      return;
    }
    if (prev) del.mutate(prev.id);
    const id = crypto.randomUUID();
    add.mutate(
      { id, recipe_key: recipe.key, event: want === "up" ? "thumbs_up" : "thumbs_down", features: recipeFeatures(recipe) },
      {
        onSuccess: () => {
          toast(want === "up" ? "Noted. More meals like this." : "Got it. It won't be planned for 90 days.", {
            duration: 6000,
            action: {
              label: "Undo",
              onClick: () => {
                del.mutate(id);
                if (prev) add.mutate({ recipe_key: prev.recipe_key, event: prev.event, features: prev.features });
              },
            },
          });
        },
      },
    );
  };
  return { state, set, loading: fb.isLoading };
}

/** Record a weak "viewed" learning signal at most once a day per recipe on this device. */
export function useViewedSignal(recipe: Recipe | undefined) {
  const add = useAddFeedback();
  const mutate = add.mutate;
  const key = recipe?.key;
  const day = useToday();
  useEffect(() => {
    if (!recipe || !key) return;
    const storeKey = `pgg.meals.viewed.${key}`;
    try {
      if (localStorage.getItem(storeKey) === day) return;
      localStorage.setItem(storeKey, day);
    } catch {
      return; // can't remember it: better to skip than to record every open
    }
    mutate({ recipe_key: key, event: "viewed", features: recipeFeatures(recipe) });
    // once per recipe key and day
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, day]);
}

/** Whether the server can make an AI easier version (GET /api/meals/ai/simplify). Never claims more than it says. */
export function useMealsAIStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["meals-ai-status"],
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<{ configured: boolean; mock: boolean }> => {
      const r = await fetch("/api/meals/ai/simplify", { cache: "no-store" });
      if (!r.ok) return { configured: false, mock: false };
      const j = (await r.json()) as { configured?: boolean; mock?: boolean };
      return { configured: !!j.configured, mock: !!j.mock };
    },
  });
}
