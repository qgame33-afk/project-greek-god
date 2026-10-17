"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mergePrefs, type PrefsPatch } from "@/lib/prefs";
import type { Json } from "@/lib/supabase/database.types";
import { friendlyError, must, sb, useUser, type Row, type Update } from "./core";

export type Profile = Row<"profiles">;

export function useProfile() {
  const { userId } = useUser();
  const q = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await sb().from("profiles").select("*").eq("id", userId!).maybeSingle();
      if (res.error) throw new Error(friendlyError(res.error.message));
      if (res.data) return res.data;
      // trigger normally creates it; recover if it's missing
      return must(await sb().from("profiles").insert({ id: userId! }).select("*").single());
    },
  });
  return { profile: q.data, loading: q.isLoading || !userId, error: q.error, refetch: q.refetch };
}

const TRACKED: (keyof Profile)[] = ["calorie_goal", "protein_goal", "carb_goal", "fat_goal", "goal_weight_lb", "water_goal_ml", "sleep_goal_h", "steps_goal"];

/**
 * Save profile fields optimistically. Goal changes are written to goal_changes so the app
 * can show when and why a target moved (and so calorie suggestions don't re-fire).
 */
export function useSaveProfile() {
  const qc = useQueryClient();
  const { userId } = useUser();
  return useMutation({
    // `quiet`: the caller shows its own inline error, so skip the generic toast (rollback still runs).
    mutationFn: async ({ values, reason, source = "user" }: { values: Update<"profiles">; reason?: string; source?: "user" | "suggestion" | "onboarding"; quiet?: boolean }) => {
      // Read the stored values first (the cache already holds the optimistic ones).
      const tracked = TRACKED.filter((k) => k in values);
      const before = tracked.length
        ? (await sb().from("profiles").select(tracked.join(",")).eq("id", userId!).single()).data as Record<string, unknown> | null
        : null;
      must(await sb().from("profiles").update(values).eq("id", userId!).select("id").single());
      if (before) {
        const changes = tracked
          .filter((k) => values[k as keyof typeof values] != null && Number(values[k as keyof typeof values]) !== Number(before[k]))
          .map((k) => ({ field: k, old_value: before[k] == null ? null : Number(before[k]), new_value: Number(values[k as keyof typeof values]), reason: reason ?? null, source }));
        if (changes.length) {
          const { error } = await sb().from("goal_changes").insert(changes);
          // the goal itself saved; only the history note failed — say so, don't roll back
          if (error) toast.error("Goal saved, but its history entry couldn't be recorded", { description: error.message });
        }
      }
    },
    onMutate: async ({ values }) => {
      await qc.cancelQueries({ queryKey: ["profile", userId] });
      const prev = qc.getQueryData<Profile>(["profile", userId]);
      if (prev) qc.setQueryData(["profile", userId], { ...prev, ...values });
      return { prev };
    },
    onError: (e: Error, v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["profile", userId], ctx.prev);
      if (!v.quiet) toast.error("Couldn't save", { description: e.message });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["goal-changes"] });
    },
  });
}

export function useGoalChanges() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["goal-changes", userId],
    enabled: !!userId,
    queryFn: async () => must(await sb().from("goal_changes").select("*").order("changed_at", { ascending: false }).limit(200)),
  });
}

/**
 * Save part of profiles.prefs (DESIGN-V2 §4.4). Every prefs writer goes through this: it
 * reads the stored prefs fresh, deep-merges the patch with mergePrefs() (unknown keys and
 * the rest of `day` are kept), writes, and patches the cached profile optimistically with
 * rollback. Writes run one at a time (a mutation scope), so two quick toggles can't race
 * each other into dropping a key, and the cache is only refreshed from the server once the
 * last queued write is done (no flicker back). `quiet` skips the error toast.
 */
const PREFS_KEY = ["profile-prefs"];

export function useSavePrefs({ quiet = false }: { quiet?: boolean } = {}) {
  const qc = useQueryClient();
  const { userId } = useUser();
  const othersPending = () => qc.isMutating({ mutationKey: PREFS_KEY }) > 1;
  return useMutation({
    mutationKey: PREFS_KEY,
    scope: { id: "profile-prefs" },
    mutationFn: async (patch: PrefsPatch) => {
      const stored = await sb().from("profiles").select("prefs").eq("id", userId!).single();
      if (stored.error) throw new Error(friendlyError(stored.error.message));
      const next = mergePrefs(stored.data.prefs, patch) as NonNullable<Json>;
      must(await sb().from("profiles").update({ prefs: next }).eq("id", userId!).select("id").single());
      return next;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["profile", userId] });
      const prev = qc.getQueryData<Profile>(["profile", userId]);
      if (prev) qc.setQueryData<Profile>(["profile", userId], { ...prev, prefs: mergePrefs(prev.prefs, patch) as NonNullable<Json> });
      return { prev };
    },
    onError: (e: Error, _patch, ctx) => {
      if (ctx?.prev && !othersPending()) qc.setQueryData(["profile", userId], ctx.prev);
      if (!quiet) toast.error("Couldn't save", { description: e.message });
    },
    onSuccess: (next) => {
      if (othersPending()) return;
      const cur = qc.getQueryData<Profile>(["profile", userId]);
      if (cur) qc.setQueryData<Profile>(["profile", userId], { ...cur, prefs: next });
    },
    onSettled: () => {
      if (!othersPending()) qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}
