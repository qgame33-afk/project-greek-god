"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { fetchAll, must, newId, sb, useToday, useUser, type Insert } from "@/lib/data/core";
import { useProfile, useSaveProfile } from "@/lib/data/profile";
import { useRecovery } from "@/lib/data/recovery";
import { volleyballEntries } from "@/lib/recovery/volleyball";
import {
  planFor,
  scheduleOf,
  useAllSessions,
  useDayPlans,
  useSessions,
  useSetsInRange,
  useTemplates,
  useVolleyball,
  type DayPlan,
  type DayPlanResolved,
  type Session,
  type StoredTemplate,
  type Volleyball,
} from "@/lib/data/training";
import { sessionsSealed } from "@/lib/adherence";
import { addDays, dateRange, shortDate, weekDates, weekStart, type ISODate } from "@/lib/dates";
import { blockStrip, programWeek } from "@/lib/training/block";
import type { Mode } from "@/lib/training/progression";
import { historyTimings, sessionTimingCounts } from "@/lib/training/timing-history";
import { modeTemplate } from "@/lib/training/volume";
import { plannedSetsByZone, setsByZone, zoneRows } from "@/lib/training/volume-zones";
import { sealedDays } from "@/lib/training/week";
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
    // logged sessions plus check-in "Volleyball this day" switches: the count Recovery,
    // readiness and Progress use, so the week strip never says "no volleyball" beside them
    const volleyballDays = volleyballEntries(volleyball, recovery);
    const dates = weekDates(today);
    const days = weekDays({ dates, plans: planLikes, sessions, volleyball: volleyballDays, today });
    const missed = missedWorkouts({ today, plans: planLikes, sessions, since: profile?.start_date ?? null });
    const load7d = volleyballSessions7d(volleyballDays, today);
    const vbAdvice = volleyballAdvice({ load7d, perWeek: profile?.volleyball_per_week ?? 2, recovery: latestRecovery(recovery), today });
    const mode = profile?.training_mode ?? "standard";
    const historyFrom = addDays(today, -SESSIONS_BACK);
    const deload = deloadAdvice({ sessions, recovery, today, mode, historyFrom });
    // the honest block: weeks that happened since the last deload or the programme start
    const block = blockStrip({ sessions, today, programStart: profile?.start_date ?? null, historyFrom, mode });
    // "4/6 raised": the same days Now counts (one volleyball swap per week counts as sealed)
    const sealed = sessionsSealed(
      sealedDays({
        dates,
        planKey: (d) => resolve(d).key,
        schedule: scheduleOf(profile ?? undefined),
        sessions,
        volleyballDates: volleyballDays.map((v) => v.local_date),
        programStart: profile?.start_date ?? null,
      }),
      today,
    );
    const weekNo = programWeek(profile?.start_date ?? null, today);
    return { plansRows, resolved, planLikes, resolve, sessions, volleyball, volleyballDays, recovery, days, dates, missed, load7d, vbAdvice, deload, block, sealed, weekNo };
  }, [plansQ.data, sessionsQ.data, vbQ.data, recQ.data, profile, byKey, today, from, to]);

  const loading = profileLoading || templatesLoading || plansQ.isLoading || sessionsQ.isLoading;
  /** Everything the Week draws in its first frame (so nothing pops in and shifts it). */
  const weekReady = !loading && !recQ.isLoading && !vbQ.isLoading;
  const error = plansQ.error ?? sessionsQ.error ?? null;
  const refetch = () => {
    plansQ.refetch();
    sessionsQ.refetch();
    vbQ.refetch();
    recQ.refetch();
  };
  return { today, profile, byKey, templates, mode: (profile?.training_mode ?? "standard") as Mode, loading, weekReady, error, refetch, ...derived };
}

/* --------------------------------------------------------- weekly volume */

/**
 * Hard sets per zone this week so far (Mon → today, completed working sets) and the sets the
 * still-open planned sessions of the week would add, in the current mode.
 */
export function useWeekVolume(week: ReturnType<typeof useTrainingWeek>) {
  const from = weekStart(week.today);
  const q = useSetsInRange(from, week.today);
  const open = useMemo(() => {
    const out: { date: ISODate; template: StoredTemplate }[] = [];
    for (const d of week.dates) {
      if (d < week.today) continue;
      const p = week.resolve(d);
      if (!p.template) continue;
      if (week.sessions.some((s) => s.local_date === d && (s.status === "done" || s.status === "active"))) continue;
      out.push({ date: d, template: p.template });
    }
    return out;
  }, [week]);
  const rows = useMemo(() => {
    const done = setsByZone(q.data ?? []);
    const planned = plannedSetsByZone(
      open.map((o) => o.template),
      week.mode,
    );
    // real sets, not the zone sum (a squat set counts toward quads and glutes but is one set)
    const plannedTotal = open.reduce((n, o) => n + modeTemplate(o.template, week.mode).exercises.reduce((a, e) => a + e.sets, 0), 0);
    return { rows: zoneRows(done, planned), other: done.other, plannedTotal };
  }, [q.data, open, week.mode]);
  return { ...rows, open, loading: q.isLoading, error: q.error, refetch: () => q.refetch() };
}

/* ---------------------------------------------------- timing over history */

/** Every completed working set (set_history), oldest first. Feeds History's timing summaries. */
export function useAllSetHistory() {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["sets-range", "all", userId],
    enabled: !!userId,
    queryFn: async () => fetchAll((a, b) => sb().from("set_history").select("id,session_id,exercise_slug,local_date,set_index,weight_lb,reps,duration_sec,completed_at").order("local_date").range(a, b)),
  });
}

/** "3 records · 8 beat last" per session: setTiming over the whole history, modes from the sessions. */
export function useSessionTimings() {
  const sets = useAllSetHistory();
  const sessions = useAllSessions();
  const counts = useMemo(() => {
    if (!sets.data || !sessions.data) return null;
    const modes = new Map(sessions.data.map((s) => [s.id, s.mode as Mode]));
    return sessionTimingCounts(sets.data, historyTimings(sets.data, (id) => modes.get(id)));
  }, [sets.data, sessions.data]);
  return { counts, loading: sets.isLoading || sessions.isLoading };
}

/** Per-day bests of every exercise since `from` (28-day sparklines in the library). */
export function useRecentDaily(from: ISODate) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["exercise-daily", "since", from, userId],
    enabled: !!userId,
    queryFn: async () => fetchAll((a, b) => sb().from("exercise_daily").select("*").gte("local_date", from).order("local_date").range(a, b)),
  });
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

/** Change profile.training_mode with Undo; double taps are ignored. Resolves true when saved. */
export function useSetTrainingMode() {
  const { profile } = useProfile();
  const save = useSaveProfile();
  const busy = useRef(false);
  const current = (profile?.training_mode ?? "standard") as Mode;
  const setMode = async (m: Mode) => {
    if (m === current || busy.current) return false;
    busy.current = true;
    const prev = current;
    try {
      await save.mutateAsync({ values: { training_mode: m } });
    } catch {
      return false;
    } finally {
      busy.current = false;
    }
    toast.success(m === "deload" ? "Deload week on" : `${MODE_LABEL[m]} mode on`, {
      description: "Applies to workouts you start from now on.",
      duration: 6000,
      action: { label: "Undo", onClick: () => save.mutateAsync({ values: { training_mode: prev } }).catch(() => {}) },
    });
    return true;
  };
  return { mode: current, setMode, pending: save.isPending };
}

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
