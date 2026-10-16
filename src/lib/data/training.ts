"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { addDays, weekday, type ISODate } from "@/lib/dates";
import { DEFAULT_SCHEDULE, PROGRAM, PROGRAM_BY_KEY } from "@/lib/training/program";
import type { DayTemplate, TemplateExercise, TemplateKey, WarmupStep } from "@/lib/training/types";
import { fetchAll, must, sb, useUser, type Insert, type Row } from "./core";
import type { Profile } from "./profile";

export type Session = Row<"workout_sessions">;
export type SetRow = Row<"exercise_sets">;
export type DayPlan = Row<"day_plans">;
export type Volleyball = Row<"volleyball_sessions">;

/* -------------------------------------------------------------- templates */

export type StoredTemplate = DayTemplate & { id?: string };

function fromRow(r: Row<"program_templates">): StoredTemplate {
  const def = PROGRAM_BY_KEY[r.key as TemplateKey];
  return {
    id: r.id,
    key: r.key as TemplateKey,
    name: r.name,
    subtitle: def?.subtitle ?? "",
    focus: r.focus ?? def?.focus ?? "",
    weekday: def?.weekday ?? 0,
    warmup: (Array.isArray(r.warmup) && r.warmup.length ? (r.warmup as unknown as WarmupStep[]) : def?.warmup) ?? [],
    exercises: (r.exercises as unknown as TemplateExercise[]) ?? [],
  };
}

export function programSeedRows(): Omit<Insert<"program_templates">, "user_id">[] {
  return PROGRAM.map((t, i) => ({
    key: t.key,
    name: t.name,
    focus: t.focus,
    sort: i,
    warmup: t.warmup as unknown as Insert<"program_templates">["warmup"],
    exercises: t.exercises as unknown as Insert<"program_templates">["exercises"],
  }));
}

/** The user's (editable) six templates. Falls back to the built-in program until seeded. */
export function useTemplates() {
  const { userId } = useUser();
  const q = useQuery({
    queryKey: ["templates", userId],
    enabled: !!userId,
    queryFn: async () => {
      let rows = must(await sb().from("program_templates").select("*").order("sort"));
      if (!rows.length) {
        // first use — seed the user's copy of the program (idempotent on (user_id, key))
        await sb().from("program_templates").upsert(programSeedRows(), { onConflict: "user_id,key", ignoreDuplicates: true });
        rows = must(await sb().from("program_templates").select("*").order("sort"));
      }
      return rows.map(fromRow);
    },
  });
  const templates: StoredTemplate[] = useMemo(() => (q.data?.length ? q.data : PROGRAM), [q.data]);
  const byKey = useMemo(() => Object.fromEntries(templates.map((t) => [t.key, t])) as Record<TemplateKey, StoredTemplate>, [templates]);
  return { templates, byKey, loading: q.isLoading };
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: StoredTemplate) =>
      must(
        await sb()
          .from("program_templates")
          .upsert(
            {
              key: t.key,
              name: t.name,
              focus: t.focus,
              sort: PROGRAM.findIndex((p) => p.key === t.key),
              warmup: t.warmup as unknown as Insert<"program_templates">["warmup"],
              exercises: t.exercises as unknown as Insert<"program_templates">["exercises"],
            },
            { onConflict: "user_id,key" },
          )
          .select("id")
          .single(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
    onError: (e: Error) => toast.error("Couldn't save the template", { description: e.message }),
  });
}

/* ------------------------------------------------------------- schedule */

export type PlanKey = TemplateKey | "rest";

export interface DayPlanResolved {
  date: ISODate;
  key: PlanKey;
  template: StoredTemplate | null;
  overridden: boolean;
  reason: string | null;
  movedFrom: ISODate | null;
}

export function scheduleOf(profile: Profile | undefined): Record<string, PlanKey> {
  const s = (profile?.weekly_schedule ?? DEFAULT_SCHEDULE) as Record<string, PlanKey>;
  return { ...(DEFAULT_SCHEDULE as Record<string, PlanKey>), ...s };
}

/** What's planned on a date: explicit override first, else the weekly schedule. */
export function planFor(date: ISODate, profile: Profile | undefined, plans: DayPlan[], byKey: Record<string, StoredTemplate>): DayPlanResolved {
  const o = plans.find((p) => p.plan_date === date);
  const key = (o?.template_key ?? scheduleOf(profile)[String(weekday(date))] ?? "rest") as PlanKey;
  return {
    date,
    key,
    template: key === "rest" ? null : (byKey[key] ?? PROGRAM_BY_KEY[key as TemplateKey] ?? null),
    overridden: !!o,
    reason: o?.reason ?? null,
    movedFrom: o?.moved_from ?? null,
  };
}

export function useDayPlans(from: ISODate, to: ISODate) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["day-plans", from, to, userId],
    enabled: !!userId,
    queryFn: async () => must(await sb().from("day_plans").select("*").gte("plan_date", from).lte("plan_date", to)),
  });
}

export function useDayPlanMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["day-plans"] });
  const onError = (e: Error) => toast.error("Couldn't update the plan", { description: e.message });
  const set = useMutation({
    mutationFn: async (v: { plan_date: ISODate; template_key: PlanKey; reason?: "rescheduled" | "swap" | "rest" | "custom"; moved_from?: ISODate | null; note?: string | null }) =>
      must(await sb().from("day_plans").upsert(v, { onConflict: "user_id,plan_date" }).select("id").single()),
    onSuccess: done,
    onError,
  });
  const clear = useMutation({
    mutationFn: async (date: ISODate) => must(await sb().from("day_plans").delete().eq("plan_date", date)),
    onSuccess: done,
    onError,
  });
  return { set, clear };
}

/* --------------------------------------------------------------- sessions */

export function useSessions(from: ISODate, to: ISODate) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["sessions", from, to, userId],
    enabled: !!userId,
    queryFn: async () =>
      fetchAll((a, b) =>
        sb().from("workout_sessions").select("*").neq("status", "discarded").gte("local_date", from).lte("local_date", to).order("started_at", { ascending: false }).range(a, b),
      ),
  });
}

export function useActiveSession() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["sessions", "active", userId],
    enabled: !!userId,
    queryFn: async () => must(await sb().from("workout_sessions").select("*").eq("status", "active").order("started_at", { ascending: false }).limit(1)).at(0) ?? null,
  });
}

/** All done sessions (history), newest first. */
export function useAllSessions() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["sessions", "all", userId],
    enabled: !!userId,
    queryFn: async () => fetchAll((a, b) => sb().from("workout_sessions").select("*").eq("status", "done").order("started_at", { ascending: false }).range(a, b)),
  });
}

/* ----------------------------------------------------- exercise history */

export function useExerciseBests() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["exercise-bests", userId],
    enabled: !!userId,
    queryFn: async () => fetchAll((a, b) => sb().from("exercise_bests").select("*").order("last_date", { ascending: false }).range(a, b)),
  });
}

export function useExerciseDaily(slug: string | null) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["exercise-daily", slug, userId],
    enabled: !!userId && !!slug,
    queryFn: async () => fetchAll((a, b) => sb().from("exercise_daily").select("*").eq("exercise_slug", slug!).order("local_date").range(a, b)),
  });
}

export function useExerciseSets(slug: string | null) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["exercise-sets", slug, userId],
    enabled: !!userId && !!slug,
    queryFn: async () =>
      fetchAll((a, b) => sb().from("set_history").select("*").eq("exercise_slug", slug!).order("local_date", { ascending: false }).order("set_index").range(a, b)),
  });
}

export function usePREvents(from: ISODate, to: ISODate) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["pr-events", from, to, userId],
    enabled: !!userId,
    queryFn: async () => fetchAll((a, b) => sb().from("pr_events").select("*").gte("local_date", from).lte("local_date", to).order("local_date", { ascending: false }).range(a, b)),
  });
}

/** Completed working sets in a date range (weekly volume per muscle, monthly review). */
export function useSetsInRange(from: ISODate, to: ISODate) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["sets-range", from, to, userId],
    enabled: !!userId,
    queryFn: async () => fetchAll((a, b) => sb().from("set_history").select("*").gte("local_date", from).lte("local_date", to).order("local_date").range(a, b)),
  });
}

/* ------------------------------------------------------------- volleyball */

export function useVolleyball(from: ISODate, to: ISODate) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["volleyball", from, to, userId],
    enabled: !!userId,
    queryFn: async () => must(await sb().from("volleyball_sessions").select("*").gte("local_date", from).lte("local_date", to).order("local_date", { ascending: false })),
  });
}

export function useVolleyballMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["volleyball"] });
  const onError = (e: Error) => toast.error("Couldn't save", { description: e.message });
  const add = useMutation({
    mutationFn: async (v: Omit<Insert<"volleyball_sessions">, "user_id">) => must(await sb().from("volleyball_sessions").insert(v).select("*").single()),
    onSuccess: done,
    onError,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => must(await sb().from("volleyball_sessions").delete().eq("id", id)),
    onSuccess: done,
    onError,
  });
  return { add, remove };
}

/** Days in the last 7 (including `date`) with volleyball. */
export function volleyballLoad(v: Volleyball[], date: ISODate) {
  const from = addDays(date, -6);
  return new Set(v.filter((x) => x.local_date >= from && x.local_date <= date).map((x) => x.local_date)).size;
}
