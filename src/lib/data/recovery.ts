"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ISODate } from "@/lib/dates";
import { fetchAll, must, sb, useUser, type Insert, type Row } from "./core";

export type RecoveryLog = Row<"recovery_logs">;
export type HabitDef = Row<"habit_definitions">;
export type HabitLog = Row<"habit_logs">;

export function useRecovery(from: ISODate, to: ISODate) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["recovery", from, to, userId],
    enabled: !!userId,
    queryFn: async () => fetchAll((a, b) => sb().from("recovery_logs").select("*").gte("local_date", from).lte("local_date", to).order("local_date").range(a, b)),
  });
}

export function useRecoveryDay(date: ISODate) {
  const q = useRecovery(date, date);
  return { log: q.data?.[0] ?? null, loading: q.isLoading };
}

export function useSaveRecovery() {
  const qc = useQueryClient();
  return useMutation({
    networkMode: "always",
    /** Upsert the whole day's check-in; blank fields are saved as null (never a fake default). */
    mutationFn: async (v: Omit<Insert<"recovery_logs">, "user_id">) =>
      must(await sb().from("recovery_logs").upsert(v, { onConflict: "user_id,local_date" }).select("*").single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recovery"] }),
    onError: (e: Error) => toast.error("Couldn't save the check-in", { description: e.message }),
  });
}

/* ----------------------------------------------------------------- habits */

export const DEFAULT_HABITS: Omit<Insert<"habit_definitions">, "user_id">[] = [
  { key: "workout", label: "Training or recovery done", kind: "auto", sort: 0 },
  { key: "protein", label: "Protein goal", kind: "auto", sort: 1 },
  { key: "calories", label: "Calorie goal", kind: "auto", sort: 2 },
  { key: "water", label: "Hydration goal", kind: "auto", sort: 3 },
  { key: "weighin", label: "Log bodyweight", kind: "auto", sort: 4 },
  { key: "sleep", label: "Sleep goal", kind: "auto", sort: 5 },
  { key: "steps", label: "Steps", kind: "value", unit: "steps", sort: 6 },
  { key: "mobility", label: "Mobility", kind: "check", sort: 7 },
];

export function useHabitDefs() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["habit-defs", userId],
    enabled: !!userId,
    queryFn: async () => {
      let rows = must(await sb().from("habit_definitions").select("*").order("sort"));
      if (!rows.length) {
        await sb().from("habit_definitions").upsert(DEFAULT_HABITS, { onConflict: "user_id,key", ignoreDuplicates: true });
        rows = must(await sb().from("habit_definitions").select("*").order("sort"));
      }
      return rows;
    },
  });
}

export function useHabitDefMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["habit-defs"] });
  const onError = (e: Error) => toast.error("Couldn't save", { description: e.message });
  const upsert = useMutation({
    mutationFn: async (v: Omit<Insert<"habit_definitions">, "user_id">) => must(await sb().from("habit_definitions").upsert(v, { onConflict: "user_id,key" }).select("*").single()),
    onSuccess: done,
    onError,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => must(await sb().from("habit_definitions").delete().eq("id", id)),
    onSuccess: done,
    onError,
  });
  return { upsert, remove };
}

export function useHabitLogs(from: ISODate, to: ISODate) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["habit-logs", from, to, userId],
    enabled: !!userId,
    queryFn: async () => fetchAll((a, b) => sb().from("habit_logs").select("*").gte("local_date", from).lte("local_date", to).range(a, b)),
  });
}

export function useSetHabitLog() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return useMutation({
    mutationFn: async (v: { habit_key: string; local_date: ISODate; done?: boolean; value?: number | null }) =>
      must(await sb().from("habit_logs").upsert({ done: false, ...v }, { onConflict: "user_id,habit_key,local_date" }).select("*").single()),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["habit-logs"] });
      const snapshots = qc.getQueriesData<HabitLog[]>({ queryKey: ["habit-logs"] });
      for (const [k, rows] of snapshots) {
        if (!rows) continue;
        const [, from, to] = k as [string, string, string];
        if (v.local_date < from || v.local_date > to) continue;
        const exists = rows.some((r) => r.habit_key === v.habit_key && r.local_date === v.local_date);
        qc.setQueryData<HabitLog[]>(
          k,
          exists
            ? rows.map((r) => (r.habit_key === v.habit_key && r.local_date === v.local_date ? { ...r, ...v } : r))
            : [...rows, { id: "optimistic", user_id: userId!, updated_at: "", done: false, value: null, ...v } as HabitLog],
        );
      }
      return { snapshots };
    },
    onError: (e: Error, _v, ctx) => {
      ctx?.snapshots.forEach(([k, rows]) => qc.setQueryData(k, rows));
      toast.error("Couldn't save", { description: e.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["habit-logs"] }),
  });
}
