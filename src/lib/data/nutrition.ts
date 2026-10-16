"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ISODate } from "@/lib/dates";
import { sumMacros } from "@/lib/nutrition";
import { fetchAll, must, newId, sb, useUser, type Insert, type Row, type Update } from "./core";

export type FoodEntry = Row<"food_entries">;
export type SavedFood = Row<"saved_foods">;
export type SavedMeal = Row<"saved_meals">;
export type WaterLog = Row<"water_logs">;

/* ------------------------------------------------------------------ food */

export function useFoodEntries(date: ISODate) {
  const { userId } = useUser();
  const q = useQuery({
    queryKey: ["food", date, userId],
    enabled: !!userId,
    queryFn: async () => must(await sb().from("food_entries").select("*").eq("local_date", date).order("eaten_at", { ascending: true })),
  });
  const entries = q.data ?? [];
  return { entries, totals: sumMacros(entries), loading: q.isLoading, error: q.error, refetch: q.refetch };
}

/** Per-day totals for a date range (from the daily_nutrition view). */
export function useDailyNutrition(from: ISODate, to: ISODate) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["food-days", from, to, userId],
    enabled: !!userId,
    queryFn: async () =>
      fetchAll((a, b) => sb().from("daily_nutrition").select("*").gte("local_date", from).lte("local_date", to).order("local_date").range(a, b)),
  });
}

/** Most-recent distinct foods for quick re-logging. */
export function useRecentFoods(limit = 30) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["food-recent", userId],
    enabled: !!userId,
    queryFn: async () => {
      const rows = must(await sb().from("food_entries").select("*").order("eaten_at", { ascending: false }).limit(200));
      const seen = new Set<string>();
      const out: FoodEntry[] = [];
      for (const r of rows) {
        const k = `${r.name.toLowerCase()}|${r.unit}|${r.base_amount}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(r);
        if (out.length >= limit) break;
      }
      return out;
    },
  });
}

function invalidateFood(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["food"] });
  qc.invalidateQueries({ queryKey: ["food-days"] });
  qc.invalidateQueries({ queryKey: ["food-recent"] });
}

type NewFood = Omit<Insert<"food_entries">, "user_id" | "id"> & { id?: string };

/** Add one or more entries (a meal group) optimistically. Returns the inserted rows. */
export function useAddFood() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return useMutation({
    mutationFn: async (items: NewFood[]) => {
      const rows = items.map((i) => ({ ...i, id: i.id ?? newId() }));
      return must(await sb().from("food_entries").insert(rows).select("*"));
    },
    onMutate: async (items) => {
      const date = items[0]?.local_date;
      if (!date) return;
      const key = ["food", date, userId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<FoodEntry[]>(key);
      const now = new Date().toISOString();
      const optimistic = items.map(
        (i) =>
          ({
            id: i.id ?? newId(),
            user_id: userId!,
            created_at: now,
            updated_at: now,
            eaten_at: i.eaten_at ?? now,
            brand: null,
            grams: null,
            source_name: null,
            source_url: null,
            meal_group_id: null,
            saved_food_id: null,
            photo_path: null,
            source: "manual",
            confidence: "logged",
            amount: 1,
            unit: "serving",
            base_amount: 1,
            base_calories: 0,
            base_protein_g: 0,
            base_carbs_g: 0,
            base_fat_g: 0,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
            ...i,
          }) as FoodEntry,
      );
      qc.setQueryData<FoodEntry[]>(key, [...(prev ?? []), ...optimistic]);
      return { key, prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't add that", { description: e.message });
    },
    onSettled: () => invalidateFood(qc),
  });
}

export function useUpdateFood() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; date: ISODate; values: Update<"food_entries"> }) =>
      must(await sb().from("food_entries").update(values).eq("id", id).select("*").single()),
    onMutate: async ({ id, date, values }) => {
      const key = ["food", date, userId];
      await qc.cancelQueries({ queryKey: ["food"] });
      const prev = qc.getQueryData<FoodEntry[]>(key);
      const row = prev?.find((r) => r.id === id);
      const moved = values.local_date && values.local_date !== date ? values.local_date : null;
      const toKey = moved ? ["food", moved, userId] : null;
      const prevTo = toKey ? qc.getQueryData<FoodEntry[]>(toKey) : undefined;
      if (prev) {
        if (moved) qc.setQueryData<FoodEntry[]>(key, prev.filter((r) => r.id !== id));
        else qc.setQueryData<FoodEntry[]>(key, prev.map((r) => (r.id === id ? ({ ...r, ...values } as FoodEntry) : r)));
      }
      if (toKey && row && prevTo) qc.setQueryData<FoodEntry[]>(toKey, [...prevTo, { ...row, ...values } as FoodEntry]);
      return { key, prev, toKey, prevTo };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      if (ctx?.toKey && ctx.prevTo) qc.setQueryData(ctx.toKey, ctx.prevTo);
      toast.error("Couldn't save the change", { description: e.message });
    },
    onSettled: () => invalidateFood(qc),
  });
}

/** Delete entries (by ids) with an Undo toast that restores them exactly. */
export function useDeleteFood() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const add = useAddFood();
  return useMutation({
    mutationFn: async ({ ids }: { ids: string[]; date: ISODate; rows: FoodEntry[]; label?: string }) => {
      must(await sb().from("food_entries").delete().in("id", ids));
    },
    onMutate: async ({ ids, date }) => {
      const key = ["food", date, userId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<FoodEntry[]>(key);
      if (prev) qc.setQueryData<FoodEntry[]>(key, prev.filter((r) => !ids.includes(r.id)));
      return { key, prev };
    },
    onSuccess: (_d, { rows, label }) => {
      toast(label ?? (rows.length > 1 ? `Removed ${rows.length} items` : `Removed ${rows[0]?.name ?? "entry"}`), {
        duration: 6000,
        action: {
          label: "Undo",
          onClick: () =>
            add.mutate(
              rows.map(({ user_id: _u, created_at: _c, updated_at: _up, ...r }) => r),
            ),
        },
      });
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't delete", { description: e.message });
    },
    onSettled: () => invalidateFood(qc),
  });
}

/* ----------------------------------------------------- saved foods/meals */

export function useSavedFoods() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["saved-foods", userId],
    enabled: !!userId,
    queryFn: async () =>
      must(await sb().from("saved_foods").select("*").order("is_favorite", { ascending: false }).order("last_used_at", { ascending: false, nullsFirst: false }).limit(500)),
  });
}

export function useSavedMeals() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["saved-meals", userId],
    enabled: !!userId,
    queryFn: async () => must(await sb().from("saved_meals").select("*").order("is_favorite", { ascending: false }).order("last_used_at", { ascending: false, nullsFirst: false }).limit(200)),
  });
}

export function useSavedFoodMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["saved-foods"] });
  const onError = (e: Error) => toast.error("Couldn't save", { description: e.message });
  const create = useMutation({
    mutationFn: async (v: Omit<Insert<"saved_foods">, "user_id">) => must(await sb().from("saved_foods").insert(v).select("*").single()),
    onSuccess: done,
    onError,
  });
  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Update<"saved_foods"> }) => must(await sb().from("saved_foods").update(values).eq("id", id).select("id").single()),
    onSuccess: done,
    onError,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => must(await sb().from("saved_foods").delete().eq("id", id)),
    onSuccess: done,
    onError,
  });
  /** Bump use count / last used after logging from a saved food. */
  const touch = (food: SavedFood) =>
    sb().from("saved_foods").update({ use_count: food.use_count + 1, last_used_at: new Date().toISOString() }).eq("id", food.id).then(done);
  return { create, update, remove, touch };
}

export function useSavedMealMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["saved-meals"] });
  const onError = (e: Error) => toast.error("Couldn't save", { description: e.message });
  const create = useMutation({
    mutationFn: async (v: Omit<Insert<"saved_meals">, "user_id">) => must(await sb().from("saved_meals").insert(v).select("*").single()),
    onSuccess: done,
    onError,
  });
  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Update<"saved_meals"> }) => must(await sb().from("saved_meals").update(values).eq("id", id).select("id").single()),
    onSuccess: done,
    onError,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => must(await sb().from("saved_meals").delete().eq("id", id)),
    onSuccess: done,
    onError,
  });
  return { create, update, remove };
}

/* ----------------------------------------------------------------- water */

export function useWater(date: ISODate) {
  const { userId } = useUser();
  const q = useQuery({
    queryKey: ["water", date, userId],
    enabled: !!userId,
    queryFn: async () => must(await sb().from("water_logs").select("*").eq("local_date", date).order("logged_at")),
  });
  const logs = q.data ?? [];
  return { logs, totalMl: logs.reduce((a, l) => a + l.amount_ml, 0), loading: q.isLoading };
}

export function useDailyWater(from: ISODate, to: ISODate) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["water-days", from, to, userId],
    enabled: !!userId,
    queryFn: async () => fetchAll((a, b) => sb().from("daily_water").select("*").gte("local_date", from).lte("local_date", to).order("local_date").range(a, b)),
  });
}

/** Each tap inserts its own row, so rapid taps can never overwrite each other. */
export function useWaterMutations(date: ISODate) {
  const qc = useQueryClient();
  const { userId } = useUser();
  const key = ["water", date, userId];
  const settle = () => {
    qc.invalidateQueries({ queryKey: ["water"] });
    qc.invalidateQueries({ queryKey: ["water-days"] });
  };
  const add = useMutation({
    mutationFn: async ({ id, ml }: { id: string; ml: number }) => must(await sb().from("water_logs").insert({ id, local_date: date, amount_ml: ml }).select("*").single()),
    onMutate: async ({ id, ml }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WaterLog[]>(key) ?? [];
      qc.setQueryData<WaterLog[]>(key, [...prev, { id, user_id: userId!, local_date: date, amount_ml: ml, logged_at: new Date().toISOString() }]);
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.prev);
      toast.error("Couldn't log water", { description: e.message });
    },
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => must(await sb().from("water_logs").delete().eq("id", id)),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WaterLog[]>(key) ?? [];
      qc.setQueryData<WaterLog[]>(key, prev.filter((l) => l.id !== id));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.prev);
      toast.error("Couldn't undo", { description: e.message });
    },
    onSettled: settle,
  });
  /** Logs a tap and returns its row id (for an exact Undo). */
  const addMl = (ml: number) => {
    const id = newId();
    add.mutate({ id, ml });
    return id;
  };
  return { addMl, remove, adding: add.isPending };
}
