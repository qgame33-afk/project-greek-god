"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { fetchAll, must, newId, sb, useToday, useUser, type Insert } from "@/lib/data/core";
import { useProfile, useSaveProfile } from "@/lib/data/profile";
import { useRecovery } from "@/lib/data/recovery";
import {
  planFor,
  useAllSessions,
  useDayPlans,
  useSessions,
  useTemplates,
  useVolleyball,
  type DayPlan,
  type DayPlanResolved,
  type Session,
  type StoredTemplate,
  type Volleyball,
} from "@/lib/data/training";
import { addDays, dateRange, shortDate, weekDates, type ISODate } from "@/lib/dates";
import type { Mode } from "@/lib/training/progression";
import {
  deloadAdvice,
  latestRecovery,
  missedWorkouts,
  scheduleFreeze,
  volleyballAdvice,
  volleyballSessions7d,
  weekDays,
  type DayPlanWrite,
  type PlanLike,
} from "@/lib/training/schedule";
import type { WeightUnit } from "@/lib/units";

export const PLAN_BACK = 14;
export const PLAN_AHEAD = 14;
/** How far back sessions are read for the week view, missed detection and deload advice. */
export const SESSIONS_BACK = 56;

export function useUnits(): { unit: WeightUnit } {
  const { profile } = useProfile();
  return { unit: (profile?.weight_unit ?? "lb") as WeightUnit };
}

export function toPlanLike(p: DayPlanResolved): PlanLike {
  return { date: p.date, key: p.key, name: p.template?.name ?? null, overridden: p.overridden, reason: p.reason, movedFrom: p.movedFrom };
}

/**
 * Everything the training hub needs for "this week": resolved plans from two weeks back to
 * two weeks ahead, recent sessions, volleyball and recovery, plus the derived colonnade days,
 * missed workouts and recommendations. All derived from real rows.
 */
export function useTrainingWeek() {
  const today = useToday();
  const { profile, loading: profileLoading } = useProfile();
  const { byKey, templates, loading: templatesLoading } = useTemplates();
  const from = addDays(today, -PLAN_BACK);
  const to = addDays(today, PLAN_AHEAD);
  const plansQ = useDayPlans(from, to);
  const sessionsQ = useSessions(addDays(today, -SESSIONS_BACK), addDays(today, PLAN_AHEAD));
  const vbQ = useVolleyball(from, to);
  const recQ = useRecovery(addDays(today, -13), today);

  const derived = useMemo(() => {
    const plansRows: DayPlan[] = plansQ.data ?? [];
    const resolve = (d: ISODate) => planFor(d, profile ?? undefined, plansRows, byKey);
    const resolved = dateRange(from, to).map(resolve);
    const planLikes = resolved.map(toPlanLike);
    const sessions = sessionsQ.data ?? [];
    const volleyball = vbQ.data ?? [];
    const recovery = recQ.data ?? [];
    const dates = weekDates(today);
    const days = weekDays({ dates, plans: planLikes, sessions, volleyball, today });
    const missed = missedWorkouts({ today, plans: planLikes, sessions, since: profile?.start_date ?? null });
    const load7d = volleyballSessions7d(volleyball, today);
    const vbAdvice = volleyballAdvice({ load7d, perWeek: profile?.volleyball_per_week ?? 2, recovery: latestRecovery(recovery), today });
    const deload = deloadAdvice({ sessions, recovery, today, mode: profile?.training_mode ?? "standard", historyFrom: addDays(today, -SESSIONS_BACK) });
    return { plansRows, resolved, planLikes, resolve, sessions, volleyball, recovery, days, missed, load7d, vbAdvice, deload };
  }, [plansQ.data, sessionsQ.data, vbQ.data, recQ.data, profile, byKey, today, from, to]);

  const loading = profileLoading || templatesLoading || plansQ.isLoading || sessionsQ.isLoading;
  const error = plansQ.error ?? sessionsQ.error ?? null;
  const refetch = () => {
    plansQ.refetch();
    sessionsQ.refetch();
    vbQ.refetch();
    recQ.refetch();
  };
  return { today, profile, byKey, templates, mode: (profile?.training_mode ?? "standard") as Mode, loading, error, refetch, ...derived };
}

/* ------------------------------------------------------------ day plans */

type PlanSnapshot = { date: ISODate; row: DayPlan | null };

function patchPlans(qc: ReturnType<typeof useQueryClient>, writes: DayPlanWrite[], deletes: ISODate[], userId: string | null) {
  const snaps = qc.getQueriesData<DayPlan[]>({ queryKey: ["day-plans"] });
  for (const [key, rows] of snaps) {
    if (!rows) continue;
    const [, f, t] = key as [string, string, string];
    let next = rows.filter((r) => !deletes.includes(r.plan_date));
    for (const w of writes) {
      if (w.plan_date < f || w.plan_date > t) continue;
      const prev = next.find((r) => r.plan_date === w.plan_date);
      const row: DayPlan = {
        id: prev?.id ?? `optimistic-${w.plan_date}`,
        user_id: userId ?? "",
        created_at: prev?.created_at ?? new Date().toISOString(),
        note: prev?.note ?? null,
        ...w,
      };
      next = [...next.filter((r) => r.plan_date !== w.plan_date), row];
    }
    qc.setQueryData(key, next);
  }
  return snaps;
}

/**
 * Write day_plans overrides for several dates at once (optimistic, with rollback), and offer
 * Undo that restores exactly what each date had before (an older override or none).
 */
export function useDayPlanWrites() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const busy = useRef(false);

  const snapshotFor = (dates: ISODate[]): PlanSnapshot[] => {
    const all = qc.getQueriesData<DayPlan[]>({ queryKey: ["day-plans"] }).flatMap(([, rows]) => rows ?? []);
    return dates.map((date) => ({ date, row: all.find((r) => r.plan_date === date && !r.id.startsWith("optimistic")) ?? null }));
  };

  const m = useMutation({
    mutationFn: async ({ writes, deletes }: { writes: DayPlanWrite[]; deletes: ISODate[]; label?: string }) => {
      if (writes.length) must(await sb().from("day_plans").upsert(writes, { onConflict: "user_id,plan_date" }).select("id"));
      if (deletes.length) must(await sb().from("day_plans").delete().in("plan_date", deletes).select("id"));
    },
    onMutate: async ({ writes, deletes }) => {
      await qc.cancelQueries({ queryKey: ["day-plans"] });
      return { snaps: patchPlans(qc, writes, deletes, userId) };
    },
    onError: (e: Error, _v, ctx) => {
      ctx?.snaps.forEach(([k, rows]) => qc.setQueryData(k as QueryKey, rows));
      toast.error("Couldn't update the plan. Nothing changed.", { description: e.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["day-plans"] }),
  });

  /** Apply writes/deletes; toast `message` with Undo. Resolves true on success. */
  const apply = async (opts: { writes?: DayPlanWrite[]; deletes?: ISODate[]; message: string; description?: string }) => {
    if (busy.current) return false;
    busy.current = true;
    const writes = opts.writes ?? [];
    const deletes = opts.deletes ?? [];
    const before = snapshotFor([...writes.map((w) => w.plan_date), ...deletes]);
    try {
      await m.mutateAsync({ writes, deletes });
      toast.success(opts.message, {
        description: opts.description,
        duration: 6000,
        action: {
          label: "Undo",
          onClick: () => {
            const restore = before.filter((b) => b.row).map((b) => ({ plan_date: b.date, template_key: b.row!.template_key, reason: b.row!.reason as DayPlanWrite["reason"], moved_from: b.row!.moved_from }));
            const remove = before.filter((b) => !b.row).map((b) => b.date);
            m.mutateAsync({ writes: restore, deletes: remove })
              .then(() => toast("Plan restored."))
              .catch(() => {});
          },
        },
      });
      return true;
    } catch {
      return false;
    } finally {
      busy.current = false;
    }
  };

  return { apply, pending: m.isPending };
}

/* ------------------------------------------------------------- volleyball */

export const VB_KINDS = [
  { value: "practice", label: "Practice" },
  { value: "game", label: "Game" },
  { value: "tournament", label: "Tournament" },
  { value: "open_gym", label: "Open gym" },
] as const;
export type VbKind = (typeof VB_KINDS)[number]["value"];
export const vbKindLabel = (k: string) => VB_KINDS.find((x) => x.value === k)?.label ?? k;

function patchVolleyball(qc: ReturnType<typeof useQueryClient>, fn: (rows: Volleyball[], from: string, to: string) => Volleyball[]) {
  const snaps = qc.getQueriesData<Volleyball[]>({ queryKey: ["volleyball"] });
  for (const [key, rows] of snaps) {
    if (!rows) continue;
    const [, f, t] = key as [string, string, string];
    qc.setQueryData(key, fn(rows, f, t));
  }
  return snaps;
}

/**
 * Log / delete volleyball sessions optimistically; both offer Undo. Double taps are ignored
 * (a ref guard, so two taps in the same frame never write twice).
 */
export function useVolleyballLog() {
  const qc = useQueryClient();
  const { userId } = useUser();
  const adding = useRef(false);
  /** Row ids with a delete or restore in flight; another write to the same row waits. */
  const deleting = useRef(new Set<string>());
  const rollback = (snaps: [QueryKey, Volleyball[] | undefined][] | undefined) => snaps?.forEach(([k, rows]) => qc.setQueryData(k, rows));
  const settle = () => {
    qc.invalidateQueries({ queryKey: ["volleyball"] });
  };

  const insert = useMutation({
    mutationFn: async (row: Omit<Insert<"volleyball_sessions">, "user_id"> & { id: string }) => must(await sb().from("volleyball_sessions").insert(row).select("*").single()),
    onMutate: async (row) => {
      await qc.cancelQueries({ queryKey: ["volleyball"] });
      const full: Volleyball = {
        id: row.id,
        user_id: userId ?? "",
        local_date: row.local_date,
        kind: row.kind ?? "practice",
        duration_min: row.duration_min ?? null,
        intensity: row.intensity ?? null,
        notes: row.notes ?? null,
        created_at: new Date().toISOString(),
      };
      return { snaps: patchVolleyball(qc, (rows, f, t) => (full.local_date >= f && full.local_date <= t && !rows.some((r) => r.id === full.id) ? [full, ...rows] : rows)) };
    },
    onError: (e: Error, _v, ctx) => {
      rollback(ctx?.snaps);
      toast.error("Couldn't save. Your entry is kept.", { description: e.message });
    },
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => must(await sb().from("volleyball_sessions").delete().eq("id", id).select("id")),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["volleyball"] });
      return { snaps: patchVolleyball(qc, (rows) => rows.filter((r) => r.id !== id)) };
    },
    onError: (e: Error, _v, ctx) => {
      rollback(ctx?.snaps);
      toast.error("Couldn't delete it. Nothing changed.", { description: e.message });
    },
    onSettled: settle,
  });

  const add = async (v: { local_date: ISODate; kind: VbKind; duration_min: number | null; intensity: number | null; notes?: string | null }) => {
    if (adding.current) return false;
    adding.current = true;
    const id = newId();
    try {
      await insert.mutateAsync({ id, ...v, notes: v.notes ?? null });
    } catch {
      return false;
    } finally {
      adding.current = false;
    }
    toast.success(`Volleyball logged · ${vbKindLabel(v.kind)}${v.duration_min ? ` · ${v.duration_min} min` : ""}`, {
      duration: 6000,
      action: { label: "Undo", onClick: () => remove.mutate(id) },
    });
    return true;
  };

  /** Put a deleted row back exactly as it was (same id). A delete of that row waits for it. */
  const restore = async (row: Volleyball) => {
    if (deleting.current.has(row.id)) return false;
    deleting.current.add(row.id);
    try {
      await insert.mutateAsync({ id: row.id, local_date: row.local_date, kind: row.kind, duration_min: row.duration_min, intensity: row.intensity, notes: row.notes });
      return true;
    } catch {
      return false;
    } finally {
      deleting.current.delete(row.id);
    }
  };

  /**
   * Delete with a toast Undo. Resolves to the toast's id (so an inline Undo can dismiss it), or
   * null when nothing was deleted. `onUndone` keeps the caller's inline Undo in sync.
   */
  const del = async (row: Volleyball, opts: { onUndone?: () => void } = {}): Promise<string | null> => {
    if (deleting.current.has(row.id)) return null;
    deleting.current.add(row.id);
    try {
      await remove.mutateAsync(row.id);
    } catch {
      return null;
    } finally {
      deleting.current.delete(row.id);
    }
    const toastId = `vb-del-${row.id}-${Date.now()}`;
    toast(`Deleted ${vbKindLabel(row.kind).toLowerCase()} · ${shortDate(row.local_date)}`, {
      id: toastId,
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          opts.onUndone?.();
          restore(row);
        },
      },
    });
    return toastId;
  };

  return { add, del, restore, adding: insert.isPending };
}

/* --------------------------------------------------------------- history */

/** Every completed set's PR events, grouped by session, for laurels in History. */
export function useAllPREvents() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["pr-events", "all", userId],
    enabled: !!userId,
    queryFn: async () => fetchAll((a, b) => sb().from("pr_events").select("*").order("local_date", { ascending: false }).range(a, b)),
  });
}

export function useExercisePRs(slug: string | null) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["pr-events", "exercise", slug, userId],
    enabled: !!userId && !!slug,
    queryFn: async () => fetchAll((a, b) => sb().from("pr_events").select("*").eq("exercise_slug", slug!).order("local_date", { ascending: false }).range(a, b)),
  });
}

/** Sessions that were discarded can be restored; deleting from History uses this soft delete. */
export function useSessionDelete() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "done" | "discarded" }) =>
      must(await sb().from("workout_sessions").update({ status }).eq("id", id).select("id").single()),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["sessions"] });
      const snaps = qc.getQueriesData<Session[]>({ queryKey: ["sessions"] });
      for (const [k, rows] of snaps) {
        if (!Array.isArray(rows)) continue;
        if (status === "discarded") qc.setQueryData(k, rows.filter((r) => r.id !== id));
      }
      return { snaps };
    },
    onError: (e: Error, _v, ctx) => {
      ctx?.snaps.forEach(([k, rows]) => qc.setQueryData(k, rows));
      toast.error("Couldn't delete the session.", { description: e.message });
    },
    onSettled: () => {
      for (const k of ["sessions", "exercise-bests", "exercise-daily", "exercise-sets", "pr-events", "sets-range", "recent-history", "session"]) qc.invalidateQueries({ queryKey: [k] });
    },
  });
  const busy = useRef(false);
  const del = async (s: Session) => {
    if (busy.current) return false;
    busy.current = true;
    try {
      await m.mutateAsync({ id: s.id, status: "discarded" });
    } catch {
      return false;
    } finally {
      busy.current = false;
    }
    toast(`Deleted ${s.name}`, {
      description: "Its sets no longer count toward history or records.",
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () =>
          m
            .mutateAsync({ id: s.id, status: "done" })
            .then(() => toast("Session restored."))
            .catch(() => {}),
      },
    });
    return true;
  };
  return { del, pending: m.isPending };
}

/* ------------------------------------------------------------- helpers */

export type { StoredTemplate };

export const MODE_LABEL: Record<Mode, string> = { standard: "Standard", intro: "Intro volume", deload: "Deload" };

/** Exercises the user created themselves (the built-in library ships with the app). */
export function useCustomExercises() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["custom-exercises", userId],
    enabled: !!userId,
    queryFn: async () => must(await sb().from("custom_exercises").select("*").order("name")),
  });
}

/* -------------------------------------------------------- schedule save */

/**
 * Save profile.weekly_schedule. The recent past keeps the plan it had: past dates whose
 * weekday changes get a "custom" day_plans row with the old template, so a new schedule never
 * invents missed workouts. Undo restores the old schedule and removes those rows.
 */
export function useSaveSchedule() {
  const qc = useQueryClient();
  const today = useToday();
  const save = useSaveProfile();
  const busy = useRef(false);

  const write = async (next: Record<string, string>, prev: Record<string, string>): Promise<string[] | null> => {
    const from = addDays(today, -PLAN_BACK);
    let frozen: string[] = [];
    try {
      const existing = must(await sb().from("day_plans").select("plan_date").gte("plan_date", from).lt("plan_date", today));
      const writes = scheduleFreeze({ from, today, oldSchedule: prev, newSchedule: next, overridden: existing.map((r) => r.plan_date) });
      if (writes.length) {
        const rows = must(await sb().from("day_plans").upsert(writes, { onConflict: "user_id,plan_date", ignoreDuplicates: true }).select("id"));
        frozen = rows.map((r) => r.id);
      }
    } catch (e) {
      toast.error("Couldn't save the schedule. Nothing changed.", { description: (e as Error).message });
      return null;
    }
    try {
      await save.mutateAsync({ values: { weekly_schedule: next } });
    } catch {
      if (frozen.length) await sb().from("day_plans").delete().in("id", frozen);
      return null; // useSaveProfile already explained why
    } finally {
      qc.invalidateQueries({ queryKey: ["day-plans"] });
    }
    return frozen;
  };

  const commit = async (next: Record<string, string>, prev: Record<string, string>) => {
    if (busy.current) return false;
    busy.current = true;
    try {
      const frozen = await write(next, prev);
      if (!frozen) return false;
      toast.success("Weekly schedule saved", {
        description: frozen.length ? "Applies from today. Past days keep the plan they had." : "Applies from today. Single-day changes stay as they are.",
        duration: 6000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await save.mutateAsync({ values: { weekly_schedule: prev } });
              if (frozen.length) must(await sb().from("day_plans").delete().in("id", frozen).select("id"));
              qc.invalidateQueries({ queryKey: ["day-plans"] });
              toast("Schedule restored.");
            } catch {
              /* the profile hook already reported it */
            }
          },
        },
      });
      return true;
    } finally {
      busy.current = false;
    }
  };

  return { commit, pending: save.isPending };
}

/* ---------------------------------------------------- typical durations */

/**
 * The user's median session length per template (standard mode, last 8 completed sessions of
 * at least 10 min), rounded to 5 min. Only templates with 3 or more such sessions are included.
 */
export function useTypicalDurations(): Record<string, number> {
  const all = useAllSessions();
  return useMemo(() => {
    const by: Record<string, number[]> = {};
    for (const s of all.data ?? []) {
      if (!s.template_key || s.mode !== "standard" || !s.duration_sec || s.duration_sec < 600) continue;
      const list = (by[s.template_key] ??= []);
      if (list.length < 8) list.push(s.duration_sec);
    }
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(by)) {
      if (v.length < 3) continue;
      const sorted = [...v].sort((a, b) => a - b);
      const mid = sorted.length / 2;
      const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
      out[k] = Math.round(median / 60 / 5) * 5;
    }
    return out;
  }, [all.data]);
}
