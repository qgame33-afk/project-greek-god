"use client";

// Recovery feature hooks. Reads go through the shared data hooks; the few writes the shared
// layer doesn't cover (restoring an undone row exactly, deleting a check-in, optimistic
// habit-list edits) live here so the shared files stay untouched.

import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { addDays, dateRange, type ISODate } from "@/lib/dates";
import { must, sb, useUser } from "@/lib/data/core";
import type { WaterLog } from "@/lib/data/nutrition";
import { useProfile } from "@/lib/data/profile";
import {
  useRecovery,
  type HabitDef,
  type RecoveryLog,
} from "@/lib/data/recovery";
import {
  planFor,
  useDayPlans,
  useSessions,
  useTemplates,
  useVolleyball,
} from "@/lib/data/training";
import { computeGuidance, planLite, type CheckinLite } from "./guidance";
import { weeklyReview } from "./weekly";

/* --------------------------------------------------------------- readiness */

/**
 * Today's (or any date's) readiness guidance from the user's own logs: the check-in,
 * the last few nights, volleyball in the last 7 days, recent training and the plan.
 * Reusable by the Today and Training screens.
 */
export function useReadiness(date: ISODate) {
  const { profile, loading: pLoading, error: pError } = useProfile();
  const rec = useRecovery(addDays(date, -13), date);
  const vb = useVolleyball(addDays(date, -6), date);
  const sessions = useSessions(addDays(date, -27), date);
  const plans = useDayPlans(date, date);
  const { byKey, loading: tLoading } = useTemplates();

  const loading =
    pLoading ||
    rec.isLoading ||
    vb.isLoading ||
    sessions.isLoading ||
    plans.isLoading ||
    tLoading;
  const error =
    pError ?? rec.error ?? vb.error ?? sessions.error ?? plans.error ?? null;

  const result = useMemo(() => {
    if (!profile) return null;
    const plan = planFor(date, profile, plans.data ?? [], byKey);
    const checkins = (rec.data ?? []) as CheckinLite[];
    const volleyballDates = [
      ...(vb.data ?? []).map((v) => v.local_date),
      ...checkins.filter((c) => c.volleyball).map((c) => c.local_date),
    ];
    const guidance = computeGuidance({
      date,
      sleepGoalH: Number(profile.sleep_goal_h),
      checkins,
      volleyballDates,
      sessions: sessions.data ?? [],
      plan: planLite(
        plan.key,
        plan.template?.name ?? null,
        plan.template?.exercises.map((e) => e.slug) ?? [],
      ),
    });
    return { guidance, plan };
  }, [profile, plans.data, byKey, rec.data, vb.data, sessions.data, date]);

  const refetch = () => {
    rec.refetch();
    vb.refetch();
    sessions.refetch();
    plans.refetch();
  };

  return {
    guidance: result?.guidance ?? null,
    plan: result?.plan ?? null,
    loading,
    error,
    refetch,
  };
}

/* ----------------------------------------------------------- weekly review */

export function useWeeklyReview(weekStart: ISODate, today: ISODate) {
  const { profile, loading: pLoading } = useProfile();
  const from = addDays(weekStart, -7);
  const to = addDays(weekStart, 6);
  const rec = useRecovery(from, to);
  const sessions = useSessions(from, to);
  const vb = useVolleyball(from, to);
  const plans = useDayPlans(weekStart, to);
  const { byKey, loading: tLoading } = useTemplates();

  const loading =
    pLoading ||
    rec.isLoading ||
    sessions.isLoading ||
    vb.isLoading ||
    plans.isLoading ||
    tLoading;
  const error = rec.error ?? sessions.error ?? vb.error ?? plans.error ?? null;

  const review = useMemo(() => {
    if (!profile) return null;
    const plannedDates = dateRange(weekStart, to).filter(
      (d) => planFor(d, profile, plans.data ?? [], byKey).key !== "rest",
    );
    return weeklyReview({
      weekStart,
      today,
      sleepGoalH: Number(profile.sleep_goal_h),
      checkins: (rec.data ?? []) as CheckinLite[],
      sessions: sessions.data ?? [],
      volleyball: vb.data ?? [],
      plannedDates,
      startDate: profile.start_date,
    });
  }, [
    profile,
    weekStart,
    to,
    today,
    plans.data,
    byKey,
    rec.data,
    sessions.data,
    vb.data,
  ]);

  const refetch = () => {
    rec.refetch();
    sessions.refetch();
    vb.refetch();
    plans.refetch();
  };

  return { review, loading, error, refetch };
}

/* ---------------------------------------------------------------- recovery */

function patchRecoveryCaches(
  qc: QueryClient,
  date: ISODate,
  fn: (rows: RecoveryLog[]) => RecoveryLog[],
) {
  const snapshots = qc.getQueriesData<RecoveryLog[]>({
    queryKey: ["recovery"],
  });
  for (const [k, rows] of snapshots) {
    if (!rows) continue;
    const [, from, to] = k as [string, string, string];
    if (date < from || date > to) continue;
    qc.setQueryData<RecoveryLog[]>(k, fn(rows));
  }
  return snapshots;
}

/**
 * Show a saved check-in everywhere immediately (guidance, mission list) and return a
 * rollback for when the write fails.
 */
export function useOptimisticRecovery() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return (date: ISODate, values: Partial<RecoveryLog>) => {
    void qc.cancelQueries({ queryKey: ["recovery"] });
    const now = new Date().toISOString();
    const snapshots = patchRecoveryCaches(qc, date, (rows) => {
      const i = rows.findIndex((r) => r.local_date === date);
      if (i >= 0)
        return rows.map((r, j) => (j === i ? { ...r, ...values } : r));
      const row = {
        id: `optimistic-${date}`,
        user_id: userId ?? "",
        local_date: date,
        created_at: now,
        updated_at: now,
        notes: null,
        ...EMPTY_ROW,
        ...values,
      } as RecoveryLog;
      return [...rows, row].sort((a, b) =>
        a.local_date.localeCompare(b.local_date),
      );
    });
    return () => snapshots.forEach(([k, rows]) => qc.setQueryData(k, rows));
  };
}

const EMPTY_ROW = {
  sleep_hours: null,
  sleep_quality: null,
  energy: null,
  soreness: null,
  fatigue: null,
  stress: null,
  pain_notes: null,
  volleyball: false,
};

/** Delete a day's check-in (optimistic). The caller offers Undo by re-saving the row. */
export function useDeleteRecovery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: RecoveryLog) => {
      must(
        await sb()
          .from("recovery_logs")
          .delete()
          .eq("local_date", row.local_date),
      );
    },
    onMutate: async (row) => {
      await qc.cancelQueries({ queryKey: ["recovery"] });
      const snapshots = patchRecoveryCaches(qc, row.local_date, (rows) =>
        rows.filter((r) => r.local_date !== row.local_date),
      );
      return { snapshots };
    },
    onError: (e: Error, _row, ctx) => {
      ctx?.snapshots.forEach(([k, rows]) => qc.setQueryData(k, rows));
      toast.error("Couldn't delete the check-in", { description: e.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["recovery"] }),
  });
}

/* ------------------------------------------------------------------- water */

/** Put an undone water tap back exactly as it was (same id and time). */
export function useRestoreWater() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return useMutation({
    mutationFn: async (log: WaterLog) =>
      must(
        await sb()
          .from("water_logs")
          .insert({
            id: log.id,
            local_date: log.local_date,
            amount_ml: log.amount_ml,
            logged_at: log.logged_at,
          })
          .select("*")
          .single(),
      ),
    onMutate: async (log) => {
      const key = ["water", log.local_date, userId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WaterLog[]>(key);
      if (prev)
        qc.setQueryData<WaterLog[]>(
          key,
          [...prev.filter((l) => l.id !== log.id), log].sort((a, b) =>
            a.logged_at.localeCompare(b.logged_at),
          ),
        );
      return { key, prev };
    },
    onError: (e: Error, _log, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error("Couldn't restore that entry", { description: e.message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["water"] });
      qc.invalidateQueries({ queryKey: ["water-days"] });
    },
  });
}

/* ------------------------------------------------------------ habit list */

/** Apply an optimistic change to the cached habit list; returns a rollback. */
export function useHabitDefsCache() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return (fn: (defs: HabitDef[]) => HabitDef[]) => {
    const key = ["habit-defs", userId];
    void qc.cancelQueries({ queryKey: key });
    const prev = qc.getQueryData<HabitDef[]>(key);
    if (prev)
      qc.setQueryData<HabitDef[]>(
        key,
        [...fn(prev)].sort((a, b) => a.sort - b.sort),
      );
    return () => {
      if (prev) qc.setQueryData(key, prev);
    };
  };
}
