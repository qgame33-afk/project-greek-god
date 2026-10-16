"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { must, sb } from "@/lib/data/core";
import type { HabitLog } from "@/lib/data/recovery";
import type { ISODate } from "@/lib/dates";

/**
 * Removes one day's log for a manual habit (value or check), optimistically across every
 * cached habit-log range. Used by Today's Clear and by Undo when a tap created the row, so
 * an undone entry leaves nothing behind instead of an empty placeholder row.
 */
export function useClearHabitLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { habit_key: string; local_date: ISODate }) =>
      must(await sb().from("habit_logs").delete().eq("habit_key", v.habit_key).eq("local_date", v.local_date)),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["habit-logs"] });
      const snapshots = qc.getQueriesData<HabitLog[]>({ queryKey: ["habit-logs"] });
      for (const [k, rows] of snapshots) {
        if (rows)
          qc.setQueryData<HabitLog[]>(
            k,
            rows.filter((r) => !(r.habit_key === v.habit_key && r.local_date === v.local_date)),
          );
      }
      return { snapshots };
    },
    onError: (e: Error, _v, ctx) => {
      ctx?.snapshots.forEach(([k, rows]) => qc.setQueryData(k, rows));
      toast.error("Couldn't clear", { description: e.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["habit-logs"] }),
  });
}
