"use client";

// Meal planner data hooks (docs/MEALS.md §3): TanStack Query + the browser Supabase client
// under RLS. Mutations are optimistic with rollback + a toast on error, removals offer Undo,
// and a repeat of the same operation while it is still running is ignored (double taps).
// Planning never writes to food_entries: only useLogPlannedMeal does, once per confirm sheet.
// Pure rules live in ./meals-model (unit-tested) and are re-exported from here.

import { useMutation, useQuery, useQueryClient, type MutateOptions, type QueryClient, type UseMutationResult } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { addDays, relativeDay, weekStart, type ISODate } from "@/lib/dates";
import type { MealPrefs, Recipe } from "@/lib/meals/types";
import { parseAppPrefs } from "@/lib/prefs";
import type { Json } from "@/lib/supabase/database.types";
import { fetchAll, must, newId, sb, useToday, useUser } from "./core";
import {
  applyMealPatch,
  customGroceryKey,
  feedbackFromRow,
  feedbackToRow,
  isExplicitFeedback,
  loggedByPlannedMeal,
  mergeGroceryItems,
  optimisticPlanMeal,
  plannedMealFoodEntry,
  plannedMealFromRow,
  plannedMealPatchToRow,
  planReplacement,
  prefsFromRow,
  prefsPatchToRow,
  recipeFromRow,
  recipeToRow,
  sortGroceryItems,
  sortPlanMeals,
  toNewPlannedMeal,
  userRecipeId,
  cleanGroceryInput,
  validateNewMeals,
  weekDays,
  type GroceryItem,
  type GroceryItemInput,
  type LogPlannedMealInput,
  type MealFeedback,
  type MealPlanRow,
  type MealPrefsRow,
  type NewFeedback,
  type NewPlannedMeal,
  type PlanMeal,
  type PlannedFoodEntry,
  type PlannedMealPatch,
  type PlannedMealRow,
  type WeekPlan,
} from "./meals-model";
import { invalidateFood, optimisticFoodEntry, type FoodEntry } from "./nutrition";
import { useProfile } from "./profile";

export * from "./meals-model";

/* ------------------------------------------------------------- plumbing */

/** Query keys, for anyone who needs to read or invalidate meal planner caches. */
export const mealKeys = {
  prefs: (userId: string | null) => ["meal-prefs", userId] as const,
  plan: (ws: ISODate, userId: string | null) => ["meal-plan", ws, userId] as const,
  plannedRange: (from: ISODate, to: ISODate, userId: string | null) => ["meal-planned-range", from, to, userId] as const,
  feedback: (userId: string | null, sinceDays: number) => ["meal-feedback", userId, sinceDays] as const,
  favourites: (userId: string | null) => ["meal-favourites", userId] as const,
  recipes: (userId: string | null) => ["meal-recipes", userId] as const,
  grocery: (planId: string, userId: string | null) => ["meal-grocery", planId, userId] as const,
  // under "food" so every food-log change (add, edit, delete anywhere in the app) refreshes them
  loggedMeal: (plannedMealId: string, userId: string | null) => ["food", "planned", plannedMealId, userId] as const,
  loggedWeek: (ws: ISODate, userId: string | null) => ["food", "planned-week", ws, userId] as const,
};

const inflight = new Map<string, Promise<unknown>>();

/**
 * mutate / mutateAsync that (1) fill in client ids before onMutate runs, so the optimistic row
 * and the saved row match, and (2) ignore a repeat of the same operation while it's running:
 * mutate() drops it, mutateAsync() returns the running promise.
 */
function guarded<TData, TVars, TCtx>(
  m: UseMutationResult<TData, Error, TVars, TCtx>,
  keyOf: (v: TVars) => string | null,
  prepare: (v: TVars) => TVars = (v) => v,
) {
  const mutateAsync = (raw: TVars, opts?: MutateOptions<TData, Error, TVars, TCtx>): Promise<TData> => {
    const v = prepare(raw);
    const k = keyOf(v);
    if (k == null) return m.mutateAsync(v, opts);
    const running = inflight.get(k);
    if (running) return running as Promise<TData>;
    const p = m.mutateAsync(v, opts).finally(() => inflight.delete(k));
    inflight.set(k, p);
    return p;
  };
  const mutate = (v: TVars, opts?: MutateOptions<TData, Error, TVars, TCtx>) => {
    mutateAsync(v, opts).catch(() => {}); // onError already rolled back and told the user
  };
  return { ...m, mutate, mutateAsync };
}

/**
 * Refetch only once the last queued change of this kind has settled (no flicker mid-burst).
 * `others` = how many of them may still be running: 1 from their own onSettled (itself), 0 elsewhere.
 */
function settleWhenIdle(qc: QueryClient, mutationKey: readonly string[], invalidate: () => void, others = 1) {
  if (qc.isMutating({ mutationKey: [...mutationKey] }) <= others) invalidate();
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ----------------------------------------------------------------- weeks */

/** The plan week `offset` weeks from this one (0 = this week, 1 = next), in the user's timezone. */
export function useMealWeek(offset = 0) {
  const today = useToday();
  return useMemo(() => {
    const ws = addDays(weekStart(today), offset * 7);
    return { today, weekStart: ws, days: weekDays(ws), isCurrentWeek: offset === 0 };
  }, [today, offset]);
}

/* ------------------------------------------------------------------ prefs */

/** The user's meal preferences (DEFAULT_PREFS until they save any). */
export function useMealPrefs() {
  const { userId } = useUser();
  const q = useQuery({
    queryKey: mealKeys.prefs(userId),
    enabled: !!userId,
    queryFn: async () => must(await sb().from("meal_prefs").select("*").maybeSingle()),
  });
  const prefs = useMemo(() => prefsFromRow(q.data), [q.data]);
  return { prefs, saved: !!q.data, loading: q.isLoading, error: q.error, hasData: q.data !== undefined };
}

/** Save some preference fields (the rest stay as they are). Changes apply in order. */
export function useSaveMealPrefs() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return useMutation({
    mutationKey: ["meal-prefs-save"],
    scope: { id: "meal-prefs" },
    mutationFn: async (patch: Partial<MealPrefs>) => {
      const cols = prefsPatchToRow(patch);
      return must(await sb().from("meal_prefs").upsert({ ...cols, user_id: userId! }, { onConflict: "user_id" }).select("*").single());
    },
    onMutate: async (patch) => {
      const key = mealKeys.prefs(userId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<MealPrefsRow | null>(key);
      try {
        const now = new Date().toISOString();
        const base = prev ?? ({ ...prefsPatchToRow(prefsFromRow(null)), user_id: userId!, created_at: now, updated_at: now } as MealPrefsRow);
        qc.setQueryData<MealPrefsRow>(key, { ...base, ...prefsPatchToRow(patch) } as MealPrefsRow);
      } catch {
        /* invalid patch: mutationFn throws the same error and onError says so */
      }
      return { key, prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't save your preferences", { description: e.message });
    },
    onSettled: () => settleWhenIdle(qc, ["meal-prefs-save"], () => qc.invalidateQueries({ queryKey: ["meal-prefs"] })),
  });
}

/* ------------------------------------------------------------------ plans */

const NO_MEALS: PlanMeal[] = [];

/** One week's plan (null until generated) and its meals, sorted by day → slot → position. */
export function usePlan(ws: ISODate | null | undefined) {
  const { userId } = useUser();
  const monday = ws ? weekStart(ws) : "";
  const q = useQuery({
    queryKey: mealKeys.plan(monday, userId),
    enabled: !!userId && !!monday,
    queryFn: async (): Promise<WeekPlan> => {
      // one round trip: the plan with its meals embedded (planned_meals.plan_id → meal_plans)
      const res = must(await sb().from("meal_plans").select("*, planned_meals(*)").eq("week_start", monday).maybeSingle()) as
        | (MealPlanRow & { planned_meals: PlannedMealRow[] | null })
        | null;
      if (!res) return { plan: null, meals: [] };
      const { planned_meals, ...plan } = res;
      return { plan, meals: sortPlanMeals((planned_meals ?? []).map(plannedMealFromRow)) };
    },
  });
  return {
    plan: q.data?.plan ?? null,
    meals: q.data?.meals ?? NO_MEALS,
    loading: q.isLoading,
    error: q.error,
    hasData: q.data !== undefined,
    refetch: q.refetch,
  };
}

/** Planned meals across plans in a date range (e.g. the last 14 days, for the engine's cooldowns). */
export function usePlannedMealsRange(from: ISODate, to: ISODate) {
  const { userId } = useUser();
  return useQuery({
    queryKey: mealKeys.plannedRange(from, to, userId),
    enabled: !!userId,
    queryFn: async () =>
      sortPlanMeals(
        (await fetchAll((a, b) => sb().from("planned_meals").select("*").gte("local_date", from).lte("local_date", to).order("local_date").order("id").range(a, b))).map(
          plannedMealFromRow,
        ),
      ),
  });
}

function invalidatePlans(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["meal-plan"] });
  qc.invalidateQueries({ queryKey: ["meal-planned-range"] });
}

/** Where a planned meal sits in the cache: its week (from any cached plan holding it). */
function weekOfMeal(qc: QueryClient, id: string): ISODate | null {
  for (const [, week] of qc.getQueriesData<WeekPlan>({ queryKey: ["meal-plan"] })) {
    const m = week?.meals.find((x) => x.id === id);
    if (m) return weekStart(m.local_date);
  }
  return null;
}

/** Logged planned-meal ids for a week, from the cache (what replace_meal_plan will keep). */
function cachedLoggedIds(qc: QueryClient, ws: ISODate, userId: string | null): Set<string> {
  return new Set(Object.keys(qc.getQueryData<Record<string, ISODate[]>>(mealKeys.loggedWeek(ws, userId)) ?? {}));
}

export interface SavePlanInput {
  weekStart: ISODate;
  /** The week's picks (from generateWeek). Locked / already-logged meals in the DB are kept. */
  meals: NewPlannedMeal[];
  /** Prefs snapshot stored on the plan; omit to keep the stored one. */
  settings?: MealPrefs | Record<string, unknown>;
  keepLocked?: boolean; // default true
  keepLogged?: boolean; // default true
  /** Toast with Undo when existing meals were replaced. Default "New week planned"; false for none. */
  undoLabel?: string | false;
}

async function replaceWeek(v: Pick<SavePlanInput, "weekStart" | "meals" | "settings" | "keepLocked" | "keepLogged">): Promise<string> {
  const meals = validateNewMeals(v.meals, weekStart(v.weekStart));
  return must(
    await sb().rpc("replace_meal_plan", {
      p_week_start: weekStart(v.weekStart),
      p_meals: meals as unknown as Json,
      p_settings: v.settings as Json | undefined,
      p_keep_locked: v.keepLocked ?? true,
      p_keep_logged: v.keepLogged ?? true,
    }),
  );
}

/**
 * Create a week, or replace it keeping locked meals (and meals already in the food log).
 * Resolves to the plan id. Replacing shows "New week planned · Undo", which puts the previous
 * meals back.
 */
export function useSavePlan() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const m = useMutation({
    // same queue as meal edits: an edit made the moment a new week appears waits for it to be stored
    scope: { id: "planned-meals" },
    mutationFn: async (v: SavePlanInput) => ({ planId: await replaceWeek(v) }),
    onMutate: async (v) => {
      const ws = weekStart(v.weekStart);
      const key = mealKeys.plan(ws, userId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WeekPlan>(key);
      const now = new Date().toISOString();
      let removed: PlanMeal[] = [];
      try {
        const incoming = validateNewMeals(v.meals, ws);
        const r = planReplacement(prev?.meals ?? [], incoming, { keepLocked: v.keepLocked, keepLogged: v.keepLogged, loggedIds: cachedLoggedIds(qc, ws, userId) });
        removed = r.removed;
        const planId = prev?.plan?.id ?? ""; // "" until the database assigns one
        const plan: MealPlanRow = prev?.plan
          ? { ...prev.plan, settings: (v.settings as Json) ?? prev.plan.settings, updated_at: now }
          : { id: planId, user_id: userId!, week_start: ws, settings: (v.settings ?? {}) as NonNullable<Json>, grocery_budget_cad: null, grocery_generated_at: null, created_at: now, updated_at: now };
        qc.setQueryData<WeekPlan>(key, { plan: plan as MealPlanRow, meals: sortPlanMeals([...r.kept, ...r.added.map((x) => optimisticPlanMeal(x, planId, newId(), now))]) });
      } catch {
        /* invalid input: mutationFn throws the same error */
      }
      return { key, prev, removed };
    },
    onSuccess: ({ planId }, v, ctx) => {
      // a brand-new week: put the real plan id in the cache now (meals already have theirs)
      const cur = ctx ? qc.getQueryData<WeekPlan>(ctx.key) : undefined;
      if (ctx && cur?.plan && cur.plan.id !== planId) {
        qc.setQueryData<WeekPlan>(ctx.key, { plan: { ...cur.plan, id: planId }, meals: cur.meals.map((x) => ({ ...x, plan_id: planId })) });
      }
      if (v.undoLabel === false || !ctx?.removed.length) return;
      const previous = ctx.removed.map(toNewPlannedMeal);
      const settings = ctx.prev?.plan?.settings as Record<string, unknown> | undefined;
      toast(v.undoLabel ?? "New week planned", {
        duration: 6000,
        action: {
          label: "Undo",
          onClick: () => {
            replaceWeek({ weekStart: v.weekStart, meals: previous, settings })
              .catch((e) => toast.error("Couldn't undo", { description: errText(e) }))
              .finally(() => invalidatePlans(qc));
          },
        },
      });
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't save the week", { description: e.message });
    },
    onSettled: () => settleWhenIdle(qc, ["planned-meal-update"], () => invalidatePlans(qc), 0),
  });
  return guarded(
    m,
    (v) => `plan:${userId}:${weekStart(v.weekStart)}`,
    // ids made here are the ids stored, so a meal can be edited the moment it appears
    (v) => ({ ...v, meals: v.meals.map((x) => (x.id ? x : { ...x, id: newId() })) }),
  );
}

export interface UpdatePlannedMealInput {
  id: string;
  patch: PlannedMealPatch;
  /** The meal's plan week; found from the cache when omitted. */
  weekStart?: ISODate;
}

/**
 * Change one planned meal: recipe (regenerate / undo / simplify), servings, lock, Undo history,
 * or move it (local_date / slot / position, within its week). Changes apply in order, so a
 * quick run of servings taps ends on the last one.
 */
export function useUpdatePlannedMeal() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return useMutation({
    mutationKey: ["planned-meal-update"],
    scope: { id: "planned-meals" },
    mutationFn: async ({ id, patch }: UpdatePlannedMealInput) =>
      plannedMealFromRow(must(await sb().from("planned_meals").update(plannedMealPatchToRow(patch)).eq("id", id).select("*").single())!),
    onMutate: async ({ id, patch, weekStart: ws }) => {
      const week = ws ? weekStart(ws) : weekOfMeal(qc, id);
      if (!week) return null;
      const key = mealKeys.plan(week, userId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WeekPlan>(key);
      if (prev) qc.setQueryData<WeekPlan>(key, applyMealPatch(prev, id, patch));
      return { key, prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't change that meal", { description: e.message });
    },
    onSettled: () => settleWhenIdle(qc, ["planned-meal-update"], () => invalidatePlans(qc)),
  });
}

/** Remove a planned meal, with Undo (which also restores its food-log link). */
export function useDeletePlannedMeal() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const m = useMutation({
    scope: { id: "planned-meals" },
    mutationFn: async ({ meal }: { meal: PlanMeal; label?: string }) => {
      const links = must(await sb().from("food_entries").select("id").eq("planned_meal_id", meal.id));
      must(await sb().from("planned_meals").delete().eq("id", meal.id));
      return { linked: links.map((l) => l.id) };
    },
    onMutate: async ({ meal }) => {
      const key = mealKeys.plan(weekStart(meal.local_date), userId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WeekPlan>(key);
      if (prev) qc.setQueryData<WeekPlan>(key, { ...prev, meals: prev.meals.filter((x) => x.id !== meal.id) });
      return { key, prev };
    },
    onSuccess: ({ linked }, { meal, label }) => {
      toast(label ?? "Meal removed", {
        duration: 6000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              must(
                await sb()
                  .from("planned_meals")
                  .insert({
                    id: meal.id,
                    plan_id: meal.plan_id,
                    local_date: meal.local_date,
                    slot: meal.slot,
                    position: meal.position,
                    recipe_key: meal.recipe_key,
                    servings: meal.servings,
                    locked: meal.locked,
                    reason: meal.reason as unknown as Json,
                    history: meal.history as unknown as NonNullable<Json>,
                  }),
              );
              if (linked.length) must(await sb().from("food_entries").update({ planned_meal_id: meal.id }).in("id", linked));
            } catch (e) {
              toast.error("Couldn't undo", { description: errText(e) });
            } finally {
              invalidatePlans(qc);
              invalidateFood(qc);
            }
          },
        },
      });
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't remove that meal", { description: e.message });
    },
    onSettled: () => {
      invalidatePlans(qc);
      invalidateFood(qc);
    },
  });
  return guarded(m, (v) => `planned-delete:${v.meal.id}`);
}

/** Plan-level fields: grocery budget and the prefs snapshot. */
export function useUpdatePlan() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return useMutation({
    mutationFn: async ({ planId, values }: { planId: string; weekStart: ISODate; values: { grocery_budget_cad?: number | null; settings?: Record<string, unknown> } }) => {
      const b = values.grocery_budget_cad;
      if (b != null && (!Number.isFinite(b) || b < 0 || b > 5000)) throw new Error("Budget must be between $0 and $5,000.");
      return must(await sb().from("meal_plans").update(values as { grocery_budget_cad?: number | null; settings?: NonNullable<Json> }).eq("id", planId).select("*").single());
    },
    onMutate: async ({ weekStart: ws, values }) => {
      const key = mealKeys.plan(weekStart(ws), userId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WeekPlan>(key);
      if (prev?.plan) qc.setQueryData<WeekPlan>(key, { ...prev, plan: { ...prev.plan, ...(values as Partial<MealPlanRow>) } });
      return { key, prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't save that", { description: e.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["meal-plan"] }),
  });
}

/* --------------------------------------------------------------- feedback */

/** Stored learning signals (newest first) from the last `sinceDays` days. */
export function useMealFeedback(sinceDays = 365) {
  const { userId } = useUser();
  return useQuery({
    queryKey: mealKeys.feedback(userId, sinceDays),
    enabled: !!userId,
    queryFn: async () => {
      const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
      const rows = await fetchAll((a, b) => sb().from("meal_feedback").select("*").gte("created_at", since).order("created_at", { ascending: false }).order("id").range(a, b));
      return rows.map(feedbackFromRow).filter((f): f is MealFeedback => !!f);
    },
  });
}

/**
 * Record a learning signal. Pass `features` = recipeFeatures(recipe) at the time. Idempotent on
 * `id` (fill one in to Undo it later with useDeleteFeedback). Implicit signals fail quietly;
 * explicit ones (thumbs, favourites, reasons) say so.
 */
export function useAddFeedback() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (f: NewFeedback) => {
      const row = feedbackToRow(f, f.id ?? newId());
      must(await sb().from("meal_feedback").upsert(row, { onConflict: "id", ignoreDuplicates: true }));
      return row.id;
    },
    onMutate: async (f) => {
      await qc.cancelQueries({ queryKey: ["meal-feedback"] });
      const snaps = qc.getQueriesData<MealFeedback[]>({ queryKey: ["meal-feedback"] });
      try {
        const row = feedbackToRow(f, f.id!);
        const item: MealFeedback = { id: row.id, recipe_key: row.recipe_key, event: f.event, reason: f.reason ?? null, ingredient: row.ingredient ?? null, features: row.features ?? [], created_at: new Date().toISOString() };
        for (const [k, list] of snaps) if (list) qc.setQueryData<MealFeedback[]>(k, [item, ...list.filter((x) => x.id !== item.id)]);
      } catch {
        /* mutationFn throws the same error */
      }
      return { snaps };
    },
    onError: (e: Error, f, ctx) => {
      for (const [k, list] of ctx?.snaps ?? []) qc.setQueryData(k, list);
      if (isExplicitFeedback(f)) toast.error("Couldn't save that", { description: e.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["meal-feedback"] }),
  });
  return guarded(
    m,
    (f) => `feedback:${f.id}`,
    (f) => ({ ...f, id: f.id ?? newId() }),
  );
}

/** Remove a learning signal (Undo of a thumbs / reason). */
export function useDeleteFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => must(await sb().from("meal_feedback").delete().eq("id", id)),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["meal-feedback"] });
      const snaps = qc.getQueriesData<MealFeedback[]>({ queryKey: ["meal-feedback"] });
      for (const [k, list] of snaps) if (list) qc.setQueryData<MealFeedback[]>(k, list.filter((x) => x.id !== id));
      return { snaps };
    },
    onError: (e: Error, _id, ctx) => {
      for (const [k, list] of ctx?.snaps ?? []) qc.setQueryData(k, list);
      toast.error("Couldn't undo", { description: e.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["meal-feedback"] }),
  });
}

/* ------------------------------------------------------------- favourites */

export interface Favourite {
  recipe_key: string;
  repeat_ok: boolean;
  created_at: string;
}

const NO_FAVS: Favourite[] = [];

export function useFavourites() {
  const { userId } = useUser();
  const q = useQuery({
    queryKey: mealKeys.favourites(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Favourite[]> => must(await sb().from("favourite_recipes").select("recipe_key, repeat_ok, created_at").order("created_at", { ascending: false })),
  });
  const favourites = q.data ?? NO_FAVS;
  const keys = useMemo(() => new Set(favourites.map((f) => f.recipe_key)), [favourites]);
  return { favourites, keys, isFavourite: (k: string) => keys.has(k), loading: q.isLoading, error: q.error, hasData: q.data !== undefined };
}

export interface ToggleFavouriteInput {
  recipeKey: string;
  on: boolean;
  /** Favourites may repeat in a week (≥ 3 days apart) unless this is false. */
  repeatOk?: boolean;
  /** recipeFeatures(recipe): when given, a saved / unsaved learning signal is recorded too. */
  features?: string[];
}

/** Favourite / unfavourite (or change repeat_ok). Removing shows Undo. */
export function useToggleFavourite() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const key = mealKeys.favourites(userId);
  const m = useMutation({
    mutationFn: async (v: ToggleFavouriteInput & { wasOn: boolean; prevRepeat: boolean }) => {
      if (v.on) must(await sb().from("favourite_recipes").upsert({ recipe_key: v.recipeKey, repeat_ok: v.repeatOk ?? v.prevRepeat }, { onConflict: "user_id,recipe_key" }));
      else must(await sb().from("favourite_recipes").delete().eq("recipe_key", v.recipeKey));
      let feedbackId: string | null = null;
      if (v.features && v.on !== v.wasOn) {
        const row = feedbackToRow({ recipe_key: v.recipeKey, event: v.on ? "saved" : "unsaved", features: v.features }, newId());
        // the favourite itself is saved; a missing learning note is not worth an error
        if (!(await sb().from("meal_feedback").insert(row)).error) feedbackId = row.id;
      }
      return { feedbackId };
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Favourite[]>(key);
      if (prev) {
        const rest = prev.filter((f) => f.recipe_key !== v.recipeKey);
        qc.setQueryData<Favourite[]>(key, v.on ? [{ recipe_key: v.recipeKey, repeat_ok: v.repeatOk ?? v.prevRepeat, created_at: new Date().toISOString() }, ...rest] : rest);
      }
      return { prev };
    },
    onSuccess: ({ feedbackId }, v) => {
      if (v.on || !v.wasOn) return;
      toast("Removed from favourites", {
        duration: 6000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              must(await sb().from("favourite_recipes").upsert({ recipe_key: v.recipeKey, repeat_ok: v.prevRepeat }, { onConflict: "user_id,recipe_key" }));
              if (feedbackId) await sb().from("meal_feedback").delete().eq("id", feedbackId);
            } catch (e) {
              toast.error("Couldn't undo", { description: errText(e) });
            } finally {
              qc.invalidateQueries({ queryKey: ["meal-favourites"] });
              qc.invalidateQueries({ queryKey: ["meal-feedback"] });
            }
          },
        },
      });
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error("Couldn't update favourites", { description: e.message });
    },
    onSettled: (d) => {
      qc.invalidateQueries({ queryKey: ["meal-favourites"] });
      if (d?.feedbackId) qc.invalidateQueries({ queryKey: ["meal-feedback"] });
    },
  });
  const g = guarded(m, (v) => `favourite:${v.recipeKey}`);
  /** Current state from the cache, captured when the tap happens (for feedback + Undo). */
  const withState = (v: ToggleFavouriteInput) => {
    const cur = qc.getQueryData<Favourite[]>(key)?.find((f) => f.recipe_key === v.recipeKey);
    return { ...v, wasOn: !!cur, prevRepeat: cur?.repeat_ok ?? true };
  };
  return {
    ...g,
    mutate: (v: ToggleFavouriteInput) => g.mutate(withState(v)),
    mutateAsync: (v: ToggleFavouriteInput) => g.mutateAsync(withState(v)),
  };
}

/* ----------------------------------------------------------- user recipes */

const NO_RECIPES: Recipe[] = [];

/** The user's own recipes (AI, simplified, custom), newest first, keyed "usr:<id>". */
export function useUserRecipes() {
  const { userId } = useUser();
  const q = useQuery({
    queryKey: mealKeys.recipes(userId),
    enabled: !!userId,
    queryFn: async () =>
      (await fetchAll((a, b) => sb().from("recipes").select("*").order("created_at", { ascending: false }).order("id").range(a, b)))
        .map(recipeFromRow)
        .filter((r): r is Recipe => !!r),
  });
  const recipes = q.data ?? NO_RECIPES;
  const byKey = useMemo(() => new Map(recipes.map((r) => [r.key, r])), [recipes]);
  return { recipes, byKey, loading: q.isLoading, error: q.error, hasData: q.data !== undefined };
}

/**
 * Save a normalised + validated user recipe. Resolves to it with its final key "usr:<id>" (a
 * recipe whose key is already "usr:<id>" is updated in place).
 */
export function useSaveUserRecipe() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const key = mealKeys.recipes(userId);
  const m = useMutation({
    mutationFn: async ({ recipe, id }: { recipe: Recipe; id?: string }) => {
      const row = recipeToRow(recipe, id!);
      const saved = recipeFromRow(must(await sb().from("recipes").upsert(row, { onConflict: "id" }).select("*").single())!);
      if (!saved) throw new Error("The recipe couldn't be read back.");
      return saved;
    },
    onMutate: async ({ recipe, id }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Recipe[]>(key);
      try {
        const row = recipeToRow(recipe, id!);
        const optimistic = row.data as unknown as Recipe;
        if (prev) qc.setQueryData<Recipe[]>(key, [optimistic, ...prev.filter((r) => r.key !== optimistic.key)]);
      } catch {
        /* mutationFn throws the same error */
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error("Couldn't save the recipe", { description: e.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["meal-recipes"] }),
  });
  return guarded(
    m,
    (v) => `recipe:${v.id}`,
    (v) => ({ ...v, id: v.id ?? userRecipeId(v.recipe.key) ?? newId() }),
  );
}

/* ---------------------------------------------------------------- grocery */

const NO_ITEMS: GroceryItem[] = [];

/** A plan's grocery list in store-aisle order (removed items included; the UI hides them). */
export function useGroceryItems(planId: string | null | undefined) {
  const { userId } = useUser();
  const q = useQuery({
    queryKey: mealKeys.grocery(planId ?? "", userId),
    enabled: !!userId && !!planId,
    queryFn: async () => sortGroceryItems(must(await sb().from("grocery_items").select("*").eq("plan_id", planId!))),
  });
  return { items: q.data ?? NO_ITEMS, loading: q.isLoading, error: q.error, hasData: q.data !== undefined, refetch: q.refetch };
}

/**
 * Write a freshly generated list (buildGroceryList output) for a plan: keeps each line's
 * checked / have / removed, keeps custom lines, drops lines no longer needed. Resolves to the
 * item count.
 */
export function useSyncGroceryList() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const m = useMutation({
    scope: { id: "grocery-items" }, // line edits made right after a sync wait for it
    mutationFn: async ({ planId, items }: { planId: string; items: GroceryItemInput[] }) =>
      must(await sb().rpc("sync_grocery_items", { p_plan_id: planId, p_items: cleanGroceryInput(items) as unknown as Json })),
    onMutate: async ({ planId, items }) => {
      const key = mealKeys.grocery(planId, userId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<GroceryItem[]>(key);
      if (prev) qc.setQueryData<GroceryItem[]>(key, mergeGroceryItems(prev, items, { planId, userId: userId!, now: new Date().toISOString(), newId }));
      return { key, prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't update the grocery list", { description: e.message });
    },
    onSettled: () => {
      settleWhenIdle(qc, ["grocery-update"], () => qc.invalidateQueries({ queryKey: ["meal-grocery"] }), 0);
      qc.invalidateQueries({ queryKey: ["meal-plan"] }); // grocery_generated_at
    },
  });
  return guarded(m, (v) => `grocery-sync:${v.planId}`);
}

export type GroceryItemPatch = Partial<Pick<GroceryItem, "checked" | "have" | "removed" | "name" | "qty" | "unit" | "label" | "category" | "position" | "est_cost_cad">>;

export interface UpdateGroceryItemInput {
  planId: string;
  /** The line's stable key (ingredient key or "custom:<id>"); ids of just-generated lines are only final after a refetch. */
  key: string;
  values: GroceryItemPatch;
  /** Removing shows "Removed … · Undo" unless false. */
  undo?: boolean;
}

/**
 * Check off / "I have this" / remove (with Undo) / edit a grocery line, addressed by
 * (planId, key). Changes apply in order.
 */
export function useUpdateGroceryItem() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const write = async (planId: string, key: string, values: GroceryItemPatch) =>
    must(await sb().from("grocery_items").update(values).eq("plan_id", planId).eq("key", key).select("*").single())!;
  const patchCache = (planId: string, key: string, values: GroceryItemPatch) => {
    const k = mealKeys.grocery(planId, userId);
    const prev = qc.getQueryData<GroceryItem[]>(k);
    if (prev) qc.setQueryData<GroceryItem[]>(k, sortGroceryItems(prev.map((i) => (i.key === key ? { ...i, ...values } : i))));
    return prev;
  };
  return useMutation({
    mutationKey: ["grocery-update"],
    scope: { id: "grocery-items" },
    mutationFn: async ({ planId, key, values }: UpdateGroceryItemInput) => write(planId, key, values),
    onMutate: async ({ planId, key, values }) => {
      const k = mealKeys.grocery(planId, userId);
      await qc.cancelQueries({ queryKey: k });
      const prev = patchCache(planId, key, values);
      return { k, prev, before: prev?.find((i) => i.key === key) };
    },
    onSuccess: (row: GroceryItem, v, ctx) => {
      if (v.values.removed !== true || v.undo === false || ctx?.before?.removed) return;
      toast(`Removed ${row.name}`, {
        duration: 6000,
        action: {
          label: "Undo",
          onClick: async () => {
            patchCache(v.planId, v.key, { removed: false });
            try {
              await write(v.planId, v.key, { removed: false });
            } catch (e) {
              toast.error("Couldn't undo", { description: errText(e) });
            }
            qc.invalidateQueries({ queryKey: ["meal-grocery"] });
          },
        },
      });
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.k, ctx.prev);
      toast.error("Couldn't update the list", { description: e.message });
    },
    onSettled: () => settleWhenIdle(qc, ["grocery-update"], () => qc.invalidateQueries({ queryKey: ["meal-grocery"] })),
  });
}

export interface CustomGroceryInput {
  planId: string;
  name: string;
  category?: GroceryItem["category"];
  qty?: number | null;
  unit?: string | null;
  label?: string | null;
  /** Client id (the key becomes "custom:<id>"); generated when omitted. */
  id?: string;
}

/** Add your own line to a plan's list. Resolves to the stored row. */
export function useAddCustomGroceryItem() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const m = useMutation({
    scope: { id: "grocery-items" },
    mutationFn: async (v: CustomGroceryInput) => {
      const name = v.name.trim();
      if (!name || name.length > 120) throw new Error("Give the item a name (up to 120 characters).");
      const prev = qc.getQueryData<GroceryItem[]>(mealKeys.grocery(v.planId, userId)) ?? [];
      const row = {
        id: v.id!,
        plan_id: v.planId,
        key: customGroceryKey(v.id!),
        name,
        category: v.category ?? "other",
        qty: v.qty ?? null,
        unit: v.unit ?? null,
        label: v.label ?? null,
        custom: true,
        position: prev.reduce((a, i) => Math.max(a, i.position), 0) + 1,
      };
      return must(await sb().from("grocery_items").upsert(row, { onConflict: "id", ignoreDuplicates: true }).select("*").maybeSingle()) ?? must(await sb().from("grocery_items").select("*").eq("id", row.id).single());
    },
    onMutate: async (v) => {
      const key = mealKeys.grocery(v.planId, userId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<GroceryItem[]>(key);
      const name = v.name.trim();
      if (prev && name) {
        const now = new Date().toISOString();
        const row: GroceryItem = {
          id: v.id!,
          user_id: userId!,
          plan_id: v.planId,
          key: customGroceryKey(v.id!),
          name,
          category: v.category ?? "other",
          qty: v.qty ?? null,
          unit: v.unit ?? null,
          label: v.label ?? null,
          checked: false,
          have: false,
          removed: false,
          custom: true,
          est_cost_cad: null,
          position: prev.reduce((a, i) => Math.max(a, i.position), 0) + 1,
          created_at: now,
          updated_at: now,
        };
        qc.setQueryData<GroceryItem[]>(key, sortGroceryItems([...prev.filter((i) => i.id !== row.id), row]));
      }
      return { key, prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't add that", { description: e.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["meal-grocery"] }),
  });
  return guarded(
    m,
    (v) => `grocery-add:${v.id}`,
    (v) => ({ ...v, id: v.id ?? newId() }),
  );
}

/** Delete a grocery line outright (for custom lines; generated lines are better `removed`), with Undo. */
export function useDeleteGroceryItem() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const m = useMutation({
    scope: { id: "grocery-items" },
    mutationFn: async ({ item }: { item: GroceryItem }) => must(await sb().from("grocery_items").delete().eq("plan_id", item.plan_id).eq("key", item.key)),
    onMutate: async ({ item }) => {
      const key = mealKeys.grocery(item.plan_id, userId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<GroceryItem[]>(key);
      if (prev) qc.setQueryData<GroceryItem[]>(key, prev.filter((i) => i.key !== item.key));
      return { key, prev };
    },
    onSuccess: (_d, { item }) => {
      toast(`Removed ${item.name}`, {
        duration: 6000,
        action: {
          label: "Undo",
          onClick: async () => {
            const { user_id: _u, created_at: _c, updated_at: _up, ...row } = item;
            const { error } = await sb().from("grocery_items").upsert(row, { onConflict: "plan_id,key", ignoreDuplicates: true });
            if (error) toast.error("Couldn't undo", { description: error.message });
            qc.invalidateQueries({ queryKey: ["meal-grocery"] });
          },
        },
      });
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't remove that", { description: e.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["meal-grocery"] }),
  });
  return guarded(m, (v) => `grocery-delete:${v.item.plan_id}:${v.item.key}`);
}

/* --------------------------------------------------------------- food log */

export interface LogPlannedMealResult {
  entry: FoodEntry;
  /** false when this id was already logged (a repeat confirm): nothing new was written. */
  created: boolean;
  feedbackId: string | null;
}

/**
 * "Add to today's food log": writes ONE food_entries row (name = recipe, amount = servings,
 * base_* per serving, source "meal_plan", confidence "estimate", linked to the planned meal).
 * Idempotent on input.id — keep one id per confirm sheet; repeats never add a second row.
 * Updates the day's food cache optimistically like useAddFood (Today / Nutrition totals move
 * at once), records a "logged" learning signal when `features` are given, and shows
 * "Logged … · Undo" unless `{ toast: false }`.
 */
export function useLogPlannedMeal(opts: { toast?: boolean } = {}) {
  const qc = useQueryClient();
  const { userId } = useUser();
  const todayDate = useToday();
  const showToast = opts.toast ?? true;
  // another day's meal is stamped at his own time for it (profiles.prefs.day)
  const { profile } = useProfile();
  const schedule = useMemo(() => parseAppPrefs(profile?.prefs).day, [profile?.prefs]);
  const m = useMutation({
    mutationFn: async (input: LogPlannedMealInput): Promise<LogPlannedMealResult> => {
      const row = plannedMealFoodEntry(input, { todayDate, schedule });
      const inserted = must(await sb().from("food_entries").upsert(row, { onConflict: "id", ignoreDuplicates: true }).select("*"));
      if (!inserted.length) {
        const existing = must(await sb().from("food_entries").select("*").eq("id", row.id).maybeSingle());
        if (!existing) throw new Error("Couldn't add that to your food log. Try again.");
        return { entry: existing, created: false, feedbackId: null };
      }
      let feedbackId: string | null = null;
      if (input.features && input.recipe.key) {
        const fb = feedbackToRow({ recipe_key: input.recipe.key, event: "logged", features: input.features }, newId());
        // the entry is logged; a missing learning note is not worth an error
        if (!(await sb().from("meal_feedback").insert(fb)).error) feedbackId = fb.id;
      }
      return { entry: inserted[0], created: true, feedbackId };
    },
    onMutate: async (input) => {
      let row: PlannedFoodEntry;
      try {
        row = plannedMealFoodEntry(input, { todayDate, schedule });
      } catch {
        return null; // mutationFn throws the same error
      }
      const now = new Date().toISOString();
      const dayKey = ["food", input.date, userId];
      const mealKey = input.plannedMealId ? mealKeys.loggedMeal(input.plannedMealId, userId) : null;
      const week = input.plannedMealId ? weekOfMeal(qc, input.plannedMealId) : null;
      const weekKey = week ? mealKeys.loggedWeek(week, userId) : null;
      await qc.cancelQueries({ queryKey: ["food"] });
      const prevDay = qc.getQueryData<FoodEntry[]>(dayKey);
      const prevMeal = mealKey ? qc.getQueryData<FoodEntry[]>(mealKey) : undefined;
      const prevWeek = weekKey ? qc.getQueryData<Record<string, ISODate[]>>(weekKey) : undefined;
      const optimistic = optimisticFoodEntry(row, userId!, now);
      if (prevDay) qc.setQueryData<FoodEntry[]>(dayKey, [...prevDay.filter((r) => r.id !== row.id), optimistic]);
      if (mealKey) qc.setQueryData<FoodEntry[]>(mealKey, [...(prevMeal ?? []).filter((r) => r.id !== row.id), optimistic]);
      if (weekKey && input.plannedMealId) {
        const dates = new Set(prevWeek?.[input.plannedMealId] ?? []);
        dates.add(input.date);
        qc.setQueryData<Record<string, ISODate[]>>(weekKey, { ...(prevWeek ?? {}), [input.plannedMealId]: [...dates].sort() });
      }
      return { dayKey, prevDay, mealKey, prevMeal, weekKey, prevWeek };
    },
    onSuccess: (res, input) => {
      if (!showToast) return;
      if (!res.created) {
        toast("Already in your food log");
        return;
      }
      toast(`Logged ${res.entry.name}`, {
        description: `${relativeDay(input.date, todayDate)} · ${Math.round(Number(res.entry.calories)).toLocaleString("en-US")} kcal from the recipe`,
        duration: 6000,
        action: { label: "Undo", onClick: () => undoLog(qc, userId, res) },
      });
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prevDay) qc.setQueryData(ctx.dayKey, ctx.prevDay);
      if (ctx?.mealKey) qc.setQueryData(ctx.mealKey, ctx.prevMeal);
      if (ctx?.weekKey) qc.setQueryData(ctx.weekKey, ctx.prevWeek);
      toast.error("Couldn't add that", { description: e.message });
    },
    onSettled: (res) => {
      invalidateFood(qc);
      if (res?.feedbackId) qc.invalidateQueries({ queryKey: ["meal-feedback"] });
    },
  });
  return guarded(m, (input) => `log:${input.id}`);
}

/** Undo a planner log: delete the entry (and its "logged" signal), updating caches at once. */
async function undoLog(qc: QueryClient, userId: string | null, res: LogPlannedMealResult) {
  const dayKey = ["food", res.entry.local_date, userId];
  const prev = qc.getQueryData<FoodEntry[]>(dayKey);
  if (prev) qc.setQueryData<FoodEntry[]>(dayKey, prev.filter((r) => r.id !== res.entry.id));
  try {
    must(await sb().from("food_entries").delete().eq("id", res.entry.id));
    if (res.feedbackId) await sb().from("meal_feedback").delete().eq("id", res.feedbackId);
  } catch (e) {
    if (prev) qc.setQueryData(dayKey, prev);
    toast.error("Couldn't undo", { description: errText(e) });
  } finally {
    invalidateFood(qc);
    qc.invalidateQueries({ queryKey: ["meal-feedback"] });
  }
}

type LoggedRow = Pick<FoodEntry, "id" | "local_date" | "name" | "amount" | "calories" | "eaten_at">;
const NO_LOGGED: LoggedRow[] = [];

/** Food-log entries made from one planned meal ("Logged today" on the recipe screen). */
export function useLoggedForPlannedMeal(plannedMealId: string | null | undefined) {
  const { userId } = useUser();
  const todayDate = useToday();
  const q = useQuery({
    queryKey: mealKeys.loggedMeal(plannedMealId ?? "", userId),
    enabled: !!userId && !!plannedMealId,
    queryFn: async (): Promise<LoggedRow[]> =>
      must(await sb().from("food_entries").select("id, local_date, name, amount, calories, eaten_at").eq("planned_meal_id", plannedMealId!).order("eaten_at")),
  });
  const entries = q.data ?? NO_LOGGED;
  return {
    entries,
    logged: entries.length > 0,
    loggedToday: entries.some((e) => e.local_date === todayDate),
    loggedOn: [...new Set(entries.map((e) => e.local_date))].sort(),
    loading: q.isLoading,
  };
}

const NO_LINKS: Record<string, ISODate[]> = {};

/** For a week view: planned meal id → dates it was added to the food log. */
export function useLoggedPlannedMeals(ws: ISODate | null | undefined) {
  const { userId } = useUser();
  const monday = ws ? weekStart(ws) : "";
  const q = useQuery({
    queryKey: mealKeys.loggedWeek(monday, userId),
    enabled: !!userId && !!monday,
    queryFn: async () =>
      loggedByPlannedMeal(
        must(
          await sb()
            .from("food_entries")
            .select("planned_meal_id, local_date, planned_meals!inner(local_date)")
            .gte("planned_meals.local_date", monday)
            .lte("planned_meals.local_date", addDays(monday, 6)),
        ),
      ),
  });
  return { logged: q.data ?? NO_LINKS, loading: q.isLoading, hasData: q.data !== undefined };
}

const NO_PORTIONS: Record<string, { amount: number; unit: string; local_date: ISODate }[]> = {};

/**
 * For a week view: planned meal id → the portions logged from it (amount + unit, per entry), so a
 * coin can show "eaten, portion changed" when a linked entry's servings differ from the plan.
 * Same rows as useLoggedPlannedMeals, kept under its own key so that hook's cache shape is untouched.
 */
export function usePlannedPortions(ws: ISODate | null | undefined) {
  const { userId } = useUser();
  const monday = ws ? weekStart(ws) : "";
  const q = useQuery({
    queryKey: ["food", "planned-portions", monday, userId],
    enabled: !!userId && !!monday,
    queryFn: async () => {
      const rows = must(
        await sb()
          .from("food_entries")
          .select("planned_meal_id, local_date, amount, unit, planned_meals!inner(local_date)")
          .gte("planned_meals.local_date", monday)
          .lte("planned_meals.local_date", addDays(monday, 6)),
      );
      const out: Record<string, { amount: number; unit: string; local_date: ISODate }[]> = {};
      for (const r of rows) {
        if (!r.planned_meal_id) continue;
        (out[r.planned_meal_id] ??= []).push({ amount: Number(r.amount), unit: r.unit, local_date: r.local_date });
      }
      return out;
    },
  });
  return { portions: q.data ?? NO_PORTIONS, hasData: q.data !== undefined };
}

