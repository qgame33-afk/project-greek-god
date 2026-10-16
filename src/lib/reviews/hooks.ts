"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { must, sb, useUser, type Row } from "@/lib/data/core";
import { useMeasurements, usePhotos, useWeights } from "@/lib/data/body";
import { useDailyNutrition, useDailyWater } from "@/lib/data/nutrition";
import { useProfile } from "@/lib/data/profile";
import { useRecovery } from "@/lib/data/recovery";
import { useDayPlans, usePREvents, useSessions, useSetsInRange, useVolleyball } from "@/lib/data/training";
import type { Json } from "@/lib/supabase/database.types";
import type { ISODate } from "@/lib/dates";
import { monthLabel } from "@/lib/dates";
import type { Priority, ReviewProfile, ReviewRows, ReviewStats } from "./compute";

export type SavedReview = Row<"monthly_reviews">;

/**
 * Every row a review needs for [from, to], from the shared fetchAll-backed hooks.
 * `withSets` adds completed working sets (heavier; the reviews list skips it).
 */
export function useReviewSource(from: ISODate, to: ISODate, { withSets = true }: { withSets?: boolean } = {}) {
  const qc = useQueryClient();
  const { profile, loading: pLoading, error: pError, refetch: refetchProfile } = useProfile();
  const weights = useWeights();
  const measurements = useMeasurements();
  const photos = usePhotos();
  const sessions = useSessions(from, to);
  const sets = useSetsInRange(withSets ? from : "9999-12-31", withSets ? to : "9999-12-31");
  const prs = usePREvents(from, to);
  const nutrition = useDailyNutrition(from, to);
  const water = useDailyWater(from, to);
  const recovery = useRecovery(from, to);
  const plans = useDayPlans(from, to);
  const volleyball = useVolleyball(from, to);

  const queries = [measurements, photos, sessions, sets, prs, nutrition, water, recovery, plans, volleyball];
  const loading = pLoading || weights.loading || queries.some((q) => q.isLoading);
  const error = (pError as Error | null) ?? (weights.error as Error | null) ?? queries.find((q) => q.error)?.error ?? null;
  // Retry everything that can fail here, the profile and weigh-ins included (they gate the page).
  const refetch = () => {
    if (pError) void refetchProfile();
    if (weights.error) void qc.invalidateQueries({ queryKey: ["weights"] });
    queries.forEach((q) => q.refetch());
  };

  const rows = useMemo<ReviewRows | null>(() => {
    if (loading) return null;
    return {
      weights: weights.weights,
      measurements: measurements.data ?? [],
      photos: photos.data ?? [],
      sessions: sessions.data ?? [],
      sets: withSets ? (sets.data ?? []) : [],
      prs: prs.data ?? [],
      nutrition: nutrition.data ?? [],
      water: water.data ?? [],
      recovery: recovery.data ?? [],
      plans: plans.data ?? [],
      volleyball: volleyball.data ?? [],
    };
  }, [loading, weights.weights, measurements.data, photos.data, sessions.data, sets.data, prs.data, nutrition.data, water.data, recovery.data, plans.data, volleyball.data, withSets]);

  const reviewProfile = useMemo<ReviewProfile | null>(
    () =>
      profile
        ? {
            start_date: profile.start_date,
            start_weight_lb: profile.start_weight_lb,
            goal_weight_lb: profile.goal_weight_lb,
            target_date: profile.target_date,
            calorie_goal: profile.calorie_goal,
            protein_goal: profile.protein_goal,
            sleep_goal_h: profile.sleep_goal_h,
            water_goal_ml: profile.water_goal_ml,
            weekly_schedule: profile.weekly_schedule,
            roadmap: profile.roadmap,
          }
        : null,
    [profile],
  );

  return { profile, reviewProfile, rows, loading, error: error as Error | null, refetch };
}

/* ------------------------------------------------------- saved snapshots */

export function useSavedReviews() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["monthly-reviews", userId],
    enabled: !!userId,
    queryFn: async () => must(await sb().from("monthly_reviews").select("*").order("month", { ascending: false })),
  });
}

export interface SaveReviewInput {
  month: ISODate; // YYYY-MM-01
  stats: ReviewStats;
  priorities: Priority[];
  summary: string | null;
}

/**
 * Upserts the month's snapshot (one per month). Optimistic with rollback; the toast's
 * Undo restores the previous snapshot exactly, or removes a first save.
 */
export function useSaveReview() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const key = ["monthly-reviews", userId];

  const write = async (v: { month: ISODate; stats: NonNullable<Json>; priorities: NonNullable<Json>; summary: string | null; generated_at?: string }) =>
    must(await sb().from("monthly_reviews").upsert({ ...v, generated_at: v.generated_at ?? new Date().toISOString() }, { onConflict: "user_id,month" }).select("*").single());

  const restore = useMutation({
    mutationFn: async (prev: SavedReview | null | { month: ISODate; remove: true }) => {
      if (prev && "remove" in prev) {
        must(await sb().from("monthly_reviews").delete().eq("month", prev.month));
        return;
      }
      if (prev) await write({ month: prev.month, stats: prev.stats as NonNullable<Json>, priorities: prev.priorities as NonNullable<Json>, summary: prev.summary, generated_at: prev.generated_at });
    },
    onError: (e: Error) => toast.error("Couldn't undo", { description: e.message }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["monthly-reviews"] }),
  });

  const save = useMutation({
    mutationFn: async (v: SaveReviewInput & { toast?: string }) =>
      write({ month: v.month, stats: v.stats as unknown as NonNullable<Json>, priorities: v.priorities as unknown as NonNullable<Json>, summary: v.summary }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const list = qc.getQueryData<SavedReview[]>(key);
      const prev = list?.find((r) => r.month === v.month) ?? null;
      if (list) {
        const row = {
          id: prev?.id ?? "optimistic",
          user_id: userId!,
          month: v.month,
          stats: v.stats as unknown as Json,
          priorities: v.priorities as unknown as Json,
          summary: v.summary,
          generated_at: new Date().toISOString(),
        } as SavedReview;
        qc.setQueryData<SavedReview[]>(key, [row, ...list.filter((r) => r.month !== v.month)].sort((a, b) => b.month.localeCompare(a.month)));
      }
      return { list, prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.list) qc.setQueryData(key, ctx.list);
      toast.error("Couldn't save the review", { description: `${e.message} Your review is still on screen.` });
    },
    onSuccess: (_row, v, ctx) => {
      toast(v.toast ?? `${monthLabel(v.month)} review saved`, {
        duration: 6000,
        action: { label: "Undo", onClick: () => restore.mutate(ctx?.prev ?? { month: v.month, remove: true }) },
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["monthly-reviews"] }),
  });

  const remove = useMutation({
    mutationFn: async (row: SavedReview) => {
      must(await sb().from("monthly_reviews").delete().eq("id", row.id));
      return row;
    },
    onMutate: async (row) => {
      await qc.cancelQueries({ queryKey: key });
      const list = qc.getQueryData<SavedReview[]>(key);
      if (list) qc.setQueryData<SavedReview[]>(key, list.filter((r) => r.id !== row.id));
      return { list };
    },
    onError: (e: Error, _row, ctx) => {
      if (ctx?.list) qc.setQueryData(key, ctx.list);
      toast.error("Couldn't remove the snapshot", { description: e.message });
    },
    onSuccess: (row) => {
      toast(`${monthLabel(row.month)} snapshot removed`, { duration: 6000, action: { label: "Undo", onClick: () => restore.mutate(row) } });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["monthly-reviews"] }),
  });

  return { save, remove, restoring: restore.isPending };
}

/**
 * Changes only the saved snapshot's summary (keep or remove), never its numbers.
 * Optimistic with rollback; Undo puts the previous summary back.
 */
export function useSaveSummary() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const key = ["monthly-reviews", userId];

  const write = async (id: string, summary: string | null) => must(await sb().from("monthly_reviews").update({ summary }).eq("id", id).select("id,summary").single());

  const restore = useMutation({
    mutationFn: async (v: { id: string; summary: string | null }) => write(v.id, v.summary),
    onError: (e: Error) => toast.error("Couldn't undo", { description: e.message }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["monthly-reviews"] }),
  });

  const mutation = useMutation({
    mutationFn: async (v: { row: SavedReview; summary: string | null; toast: string }) => write(v.row.id, v.summary),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const list = qc.getQueryData<SavedReview[]>(key);
      if (list) qc.setQueryData<SavedReview[]>(key, list.map((r) => (r.id === v.row.id ? { ...r, summary: v.summary } : r)));
      return { list };
    },
    onError: (e: Error, v, ctx) => {
      if (ctx?.list) qc.setQueryData(key, ctx.list);
      toast.error(v.summary ? "Couldn't keep the summary" : "Couldn't remove the summary", { description: `${e.message} Nothing was changed.` });
    },
    onSuccess: (_r, v) => {
      toast(v.toast, { duration: 6000, action: { label: "Undo", onClick: () => restore.mutate({ id: v.row.id, summary: v.row.summary }) } });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["monthly-reviews"] }),
  });
  return mutation;
}

/* --------------------------------------------------------- AI summary */

export type AISummaryError = { code: string; message: string };

export function useAISummary() {
  return useMutation<{ summary: string; model: string }, AISummaryError, { month: string; localDate: ISODate; digest: unknown }>({
    mutationFn: async (body) => {
      let res: Response;
      try {
        res = await fetch("/api/ai/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      } catch {
        throw { code: "offline", message: "You're offline. Reconnect and try again." };
      }
      const json = (await res.json().catch(() => ({}))) as { summary?: string; model?: string; error?: string; code?: string };
      if (!res.ok || !json.summary) throw { code: json.code ?? "upstream", message: json.error ?? "The summary couldn't be written. Try again." };
      return { summary: json.summary, model: json.model ?? "" };
    },
  });
}
