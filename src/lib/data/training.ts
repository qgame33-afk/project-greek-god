"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import type { ISODate } from "@/lib/dates";
import {
  activeProgram,
  DEFAULT_PROGRAM,
  isTemplateKey,
  programOfKey,
  programSince,
  PROGRAM_IDS,
  PROGRAMS,
  resolvePlanKey,
  scheduleFor,
  templateDef,
  visibleExercises,
  visibleWarmup,
} from "@/lib/training/programs";
import type { DayTemplate, ProgramId, TemplateExercise, TemplateKey, WarmupStep } from "@/lib/training/types";
import { fetchAll, isOffline, must, sb, useUser, type Insert, type Row } from "./core";
import { useProfile, type Profile } from "./profile";

export type Session = Row<"workout_sessions">;
export type SetRow = Row<"exercise_sets">;
export type DayPlan = Row<"day_plans">;

/* -------------------------------------------------------------- templates */

export type StoredTemplate = DayTemplate & { id?: string };

/**
 * A stored template row as the app shows it: name, focus, warm-up and exercises from the row
 * (jumps and their warm-up filtered out, never rewritten), everything else from the built-in
 * definition of its key. Null for a key neither program knows.
 */
export function fromRow(r: Pick<Row<"program_templates">, "id" | "key" | "name" | "focus" | "warmup" | "exercises">): StoredTemplate | null {
  const def = templateDef(r.key);
  if (!def) return null;
  const warmup = Array.isArray(r.warmup) && r.warmup.length ? (r.warmup as unknown as WarmupStep[]) : def.warmup;
  return {
    id: r.id,
    key: def.key,
    program: def.program,
    name: r.name,
    short: def.short,
    abbr: def.abbr,
    family: def.family,
    subtitle: def.subtitle,
    notes: def.notes,
    focus: r.focus ?? def.focus,
    weekday: def.weekday,
    warmup: visibleWarmup(warmup),
    exercises: visibleExercises(Array.isArray(r.exercises) ? (r.exercises as unknown as TemplateExercise[]) : []),
  };
}

/** The built-in templates of a program as program_templates rows (sort = index within the program). */
export function programSeedRows(program: ProgramId = DEFAULT_PROGRAM): Omit<Insert<"program_templates">, "user_id">[] {
  return PROGRAMS[program].templates.map((t, i) => ({
    key: t.key,
    name: t.name,
    focus: t.focus,
    sort: i,
    warmup: t.warmup as unknown as Insert<"program_templates">["warmup"],
    exercises: t.exercises as unknown as Insert<"program_templates">["exercises"],
  }));
}

/**
 * Insert the program's missing built-in rows (never overwriting a stored one: a second device
 * inserting at the same moment is a no-op). Offline it writes nothing.
 */
export async function ensureProgramRows(program: ProgramId, presentKeys: string[]): Promise<boolean> {
  const missing = PROGRAMS[program].keys.filter((k) => !presentKeys.includes(k));
  if (!missing.length || isOffline()) return false;
  const rows = programSeedRows(program).filter((r) => missing.includes(r.key as TemplateKey));
  must(await sb().from("program_templates").upsert(rows, { onConflict: "user_id,key", ignoreDuplicates: true }).select("id"));
  return true;
}

/** Stored rows over built-ins for one program, in its weekday order. */
function programTemplates(program: ProgramId, stored: Map<string, StoredTemplate>): StoredTemplate[] {
  return PROGRAMS[program].templates.map((t) => stored.get(t.key) ?? t);
}

/**
 * The active program's six templates (stored rows over built-ins), plus every template of both
 * programs by key, so a frozen past day or an open PPL session still resolves. Ensures the
 * active program's rows exist (§3.4). Waits for the profile, which decides the program.
 */
export function useTemplates(): { templates: StoredTemplate[]; byKey: Record<string, StoredTemplate>; program: ProgramId; all: Record<ProgramId, StoredTemplate[]>; loading: boolean } {
  const { userId } = useUser();
  const { profile, loading: profileLoading } = useProfile();
  const program = activeProgram(profile);
  const q = useQuery({
    queryKey: ["templates", userId, program],
    enabled: !!userId && !!profile,
    queryFn: async () => {
      let rows = must(await sb().from("program_templates").select("*").order("sort"));
      if (await ensureProgramRows(program, rows.map((r) => r.key))) rows = must(await sb().from("program_templates").select("*").order("sort"));
      return rows.map(fromRow).filter((t): t is StoredTemplate => !!t);
    },
  });
  const all = useMemo(() => {
    const stored = new Map((q.data ?? []).map((t) => [t.key as string, t]));
    return Object.fromEntries(PROGRAM_IDS.map((p) => [p, programTemplates(p, stored)])) as Record<ProgramId, StoredTemplate[]>;
  }, [q.data]);
  const templates = all[program];
  const byKey = useMemo(() => Object.fromEntries(PROGRAM_IDS.flatMap((p) => all[p].map((t) => [t.key, t]))) as Record<string, StoredTemplate>, [all]);
  return { templates, byKey, program, all, loading: q.isLoading || profileLoading };
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    // offline it fails at once ("nothing was lost"): the editor keeps every edit for a retry
    networkMode: "always",
    mutationFn: async (t: StoredTemplate) =>
      must(
        await sb()
          .from("program_templates")
          .upsert(
            {
              key: t.key,
              name: t.name,
              focus: t.focus,
              sort: Math.max(0, PROGRAMS[programOfKey(t.key) ?? DEFAULT_PROGRAM].keys.indexOf(t.key)),
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

/** The weekly schedule merged over the active program's default week (= scheduleFor). */
export function scheduleOf(profile: Profile | undefined): Record<string, PlanKey> {
  return scheduleFor(profile) as Record<string, PlanKey>;
}

/** What's planned on a date: the override first (program-aware, §2.4), else the weekly schedule. */
export function planFor(date: ISODate, profile: Profile | undefined, plans: DayPlan[], byKey: Record<string, StoredTemplate>): DayPlanResolved {
  const o = plans.find((p) => p.plan_date === date);
  const program = activeProgram(profile);
  const raw = resolvePlanKey(date, scheduleFor(profile), o, { program, since: programSince(profile?.prefs, program) });
  const key = (raw === "rest" || isTemplateKey(raw) ? raw : "rest") as PlanKey;
  return {
    date,
    key,
    template: key === "rest" ? null : (byKey[key] ?? templateDef(key) ?? null),
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

