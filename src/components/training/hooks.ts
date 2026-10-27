"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { fetchAll, isOffline, must, newId, sb, useToday, useUser, type Insert } from "@/lib/data/core";
import { useProfile, useSaveProfile, useSavePrefs } from "@/lib/data/profile";
import { useRecovery } from "@/lib/data/recovery";
import { useRecentHistory } from "@/lib/data/workout";
import { parseAppPrefs } from "@/lib/prefs";
import { useReadiness } from "@/lib/recovery/hooks";
import {
  planFor,
  useAllSessions,
  useDayPlans,
  useSessions,
  useSetsInRange,
  useTemplates,
  type DayPlan,
  type DayPlanResolved,
  type Session,
  type StoredTemplate,
  type Volleyball,
} from "@/lib/data/training";
import { sessionsSealed } from "@/lib/adherence";
import { addDays, dateRange, shortDate, weekDates, weekStart, type ISODate } from "@/lib/dates";
import { blockStrip, lighterWeekAdvice, programWeek, type LighterWeekAdvice } from "@/lib/training/block";
import { overlapInSession, overlapNextArmDay, overlapPreStart, type OverlapAdvice, type OverlapSet } from "@/lib/training/overlap";
import { activeProgram, programOfKey, programSince } from "@/lib/training/programs";
import type { Mode, PastSet } from "@/lib/training/progression";
import { historyTimings, sessionTimingCounts } from "@/lib/training/timing-history";
import type { ProgramId } from "@/lib/training/types";
import { modeTemplate } from "@/lib/training/volume";
import { groupRows, groupSets, groupTrends, plannedGroupSets, plannedSetsByZone, setsByZone, volumeSuggestions, zoneRows, type GroupRow, type VolumeSuggestion } from "@/lib/training/volume-zones";
import { sealedDays } from "@/lib/training/week";
import {
  deloadAdvice,
  missedWorkouts,
  scheduleFreeze,
  shiftWeek,
  skipToday,
  weekDays,
  type DayPlanWrite,
  type PlanLike,
  type VolleyballAdvice,
} from "@/lib/training/schedule";
import type { WeightUnit } from "@/lib/units";

export const PLAN_BACK = 14;
export const PLAN_AHEAD = 14;
/** How far back sessions are read for the week view, missed detection and deload advice. */
export const SESSIONS_BACK = 56;

/**
 * Writes here change the plan, never a workout, so they don't wait for a connection: offline
 * they say so at once and change nothing (a paused write would show a change that is lost if
 * the app closes, and hold every other control on the screen until the signal returns).
 */
export function offlineNoChange(what: string) {
  if (!isOffline()) return false;
  toast.error(`You're offline. ${what} didn't change.`, { description: "Try again when you're back online." });
  return true;
}

export function useUnits(): { unit: WeightUnit } {
  const { profile } = useProfile();
  return { unit: (profile?.weight_unit ?? "kg") as WeightUnit };
}

export function toPlanLike(p: DayPlanResolved): PlanLike {
  return { date: p.date, key: p.key, name: p.template?.name ?? null, overridden: p.overridden, reason: p.reason, movedFrom: p.movedFrom };
}

/** Days of history the lighter-week check reads for performance dips. */
const DIPS_BACK = 28;

/** Completed working sets per slug, newest first, stamped with their session's mode and template. */
function historyBySlug(rows: { exercise_slug: string | null; local_date: string | null; session_id: string | null; set_index: number | null; weight_lb: number | null; reps: number | null; duration_sec: number | null; rir: number | null; completed_at?: string | null }[], sessions: Session[]): Record<string, PastSet[]> {
  const by = new Map(sessions.map((x) => [x.id, x]));
  const out: Record<string, PastSet[]> = {};
  for (const r of [...rows].sort((a, b) => (b.local_date ?? "").localeCompare(a.local_date ?? "") || (a.set_index ?? 0) - (b.set_index ?? 0))) {
    if (!r.exercise_slug || !r.local_date || !r.session_id) continue;
    const ses = by.get(r.session_id);
    (out[r.exercise_slug] ??= []).push({
      local_date: r.local_date,
      session_id: r.session_id,
      set_index: r.set_index ?? 0,
      weight_lb: r.weight_lb == null ? null : Number(r.weight_lb),
      reps: r.reps,
      duration_sec: r.duration_sec,
      rir: r.rir == null ? null : Number(r.rir),
      mode: (ses?.mode ?? "standard") as Mode,
      template_key: ses?.template_key ?? null,
      completed_at: r.completed_at ?? null,
    });
  }
  return out;
}

/**
 * Everything the training hub needs for "this week": resolved plans from two weeks back to
 * two weeks ahead, recent sessions and check-ins, plus the derived week days, missed workouts
 * and recommendations — the lighter-week advice (§4.3), the one-time ease-in after the switch
 * (§4.2, DESIGN-V3 CR-4) and the "rest today" options (§4.4). All derived from real rows.
 */
export function useTrainingWeek() {
  const today = useToday();
  const { profile, loading: profileLoading } = useProfile();
  const { byKey, templates, program, loading: templatesLoading } = useTemplates();
  const from = addDays(today, -PLAN_BACK);
  const to = addDays(today, PLAN_AHEAD);
  const plansQ = useDayPlans(from, to);
  // the last two complete weeks, for the missed-workouts signal of the lighter-week check
  const pastPlansQ = useDayPlans(addDays(weekStart(today), -14), addDays(weekStart(today), -1));
  const sessionsQ = useSessions(addDays(today, -SESSIONS_BACK), addDays(today, PLAN_AHEAD));
  const recQ = useRecovery(addDays(today, -13), today);
  const setsQ = useSetsInRange(addDays(today, -DIPS_BACK), today);
  const readiness = useReadiness(today);

  const derived = useMemo(() => {
    const plansRows: DayPlan[] = plansQ.data ?? [];
    const resolve = (d: ISODate) => planFor(d, profile ?? undefined, plansRows, byKey);
    const resolved = dateRange(from, to).map(resolve);
    const planLikes = resolved.map(toPlanLike);
    const sessions = sessionsQ.data ?? [];
    const recovery = recQ.data ?? [];
    const dates = weekDates(today);
    // days before the programme started were never planned: no columns, nothing "missed"
    const start = profile?.start_date ?? null;
    const weekPlans = start ? planLikes.map((p) => (p.date < start ? { ...p, key: "rest", name: null } : p)) : planLikes;
    const days = weekDays({ dates, plans: weekPlans, sessions, today });
    const missed = missedWorkouts({ today, plans: planLikes, sessions, since: profile?.start_date ?? null });
    const mode = (profile?.training_mode ?? "standard") as Mode;
    const historyFrom = addDays(today, -SESSIONS_BACK);
    const deload = deloadAdvice({ sessions, recovery, today, mode, historyFrom });
    // the honest block: weeks that happened since the last deload or the programme start
    const block = blockStrip({ sessions, today, programStart: profile?.start_date ?? null, historyFrom, mode });
    // "4 of 6": the same days Today counts
    const sealed = sessionsSealed(sealedDays({ dates, planKey: (d) => resolve(d).key, sessions, programStart: profile?.start_date ?? null }), today);
    const weekNo = programWeek(profile?.start_date ?? null, today);

    // lighter weeks (§4.3): from sessions, check-ins, performance and missed workouts
    const prefs = parseAppPrefs(profile?.prefs);
    const pastRows = pastPlansQ.data ?? [];
    const plannedByWeek = [2, 1].map((i) => {
      const ws = addDays(weekStart(today), -7 * i);
      const wd = dateRange(ws, addDays(ws, 6)).filter((d) => !start || d >= start);
      const planned = wd.filter((d) => planFor(d, profile ?? undefined, pastRows, byKey).key !== "rest");
      const done = planned.filter((d) => sessions.some((x) => x.local_date === d && x.status === "done")).length;
      return { weekStart: ws, planned: planned.length, done };
    });
    const lighter: LighterWeekAdvice = lighterWeekAdvice({
      today,
      mode,
      modeSetAt: (prefs.modeSetAt as ISODate | undefined) ?? null,
      snoozedUntil: (prefs.lighterSnoozedUntil as ISODate | undefined) ?? null,
      sessions,
      checkins: recovery,
      sleepGoalH: Number(profile?.sleep_goal_h ?? 8),
      history: historyBySlug(setsQ.data ?? [], sessions),
      plannedByWeek,
      historyFrom: profile?.start_date ?? null,
    });

    // the one-time ease-in after the switch (§4.2, CR-4)
    const since = programSince(profile?.prefs, activeProgram(profile));
    const snoozed = !!prefs.lighterSnoozedUntil && today <= (prefs.lighterSnoozedUntil as string);
    const easeIn =
      program === "twoset" &&
      !!since &&
      today >= since &&
      today < addDays(since, 7) &&
      mode === "standard" &&
      !snoozed &&
      !sessions.some((x) => x.status === "done" && x.local_date >= since && programOfKey(x.template_key) === "twoset");

    // rest today (§4.4): six days aren't mandatory
    const g = readiness.guidance;
    const todayPlan = resolve(today);
    const startedToday = sessions.some((x) => x.local_date === today && (x.status === "active" || x.status === "done"));
    const wantsRest = !!g && (g.level === "recover" || (g.level === "ease" && (lighter.kind === "deload" || lighter.kind === "lighter")));
    const restToday: { shift: DayPlanWrite[]; skip: DayPlanWrite[] } | null =
      wantsRest && !!todayPlan.template && !startedToday ? { shift: shiftWeek({ from: today, plans: planLikes.filter((p) => p.date >= today), horizon: 7 }), skip: skipToday(today) } : null;

    /** @deprecated volleyball is no longer read (PROGRAM-ARNOLD §6); kept empty until P2. */
    const volleyball: Volleyball[] = [];
    /** @deprecated */
    const volleyballDays: { local_date: ISODate }[] = [];
    /** @deprecated */
    const vbAdvice: VolleyballAdvice = { heavy: false, reasons: [] };
    return { plansRows, resolved, planLikes, resolve, sessions, recovery, days, dates, missed, deload, block, sealed, weekNo, lighter, easeIn, restToday, volleyball, volleyballDays, load7d: 0, vbAdvice };
  }, [plansQ.data, pastPlansQ.data, sessionsQ.data, recQ.data, setsQ.data, readiness.guidance, profile, byKey, program, today, from, to]);

  const loading = profileLoading || templatesLoading || plansQ.isLoading || sessionsQ.isLoading;
  /** Everything the Week draws in its first frame (so nothing pops in and shifts it). */
  const weekReady = !loading && !recQ.isLoading;
  const error = plansQ.error ?? sessionsQ.error ?? null;
  const refetch = () => {
    plansQ.refetch();
    pastPlansQ.refetch();
    sessionsQ.refetch();
    recQ.refetch();
    setsQ.refetch();
  };
  return { today, profile, byKey, templates, program: program as ProgramId, mode: (profile?.training_mode ?? "standard") as Mode, loading, weekReady, error, refetch, ...derived };
}

/* --------------------------------------------------------- weekly volume */

/**
 * Sets by muscle this week so far (Mon → today, completed working sets, Quinton's 13 groups
 * with fractional credit, §5), what the still-open planned sessions of the week would add in
 * the current mode, each group's 6-week strength trend, and up to two performance-based
 * suggestions (§5.4). `legacyRows`/`other` are the old 10-zone rows (@deprecated, P2 removes).
 */
export function useWeekVolume(week: ReturnType<typeof useTrainingWeek>): {
  rows: GroupRow[];
  suggestions: VolumeSuggestion[];
  plannedTotal: number;
  open: { date: ISODate; template: StoredTemplate }[];
  loading: boolean;
  offline: boolean;
  error: Error | null;
  refetch: () => void;
  /** @deprecated */
  legacyRows: ReturnType<typeof zoneRows>;
  /** @deprecated */
  other: number;
} {
  const from = weekStart(week.today);
  const q = useSetsInRange(from, week.today);
  // 6 weeks for the trend; the last 4 complete weeks for the suggestions
  const histQ = useSetsInRange(addDays(week.today, -42), week.today);
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
  const out = useMemo(() => {
    const doneSets = q.data ?? [];
    const done = groupSets(doneSets);
    const planned = plannedGroupSets(
      open.map((o) => o.template),
      week.mode,
    );
    const history = historyBySlug(histQ.data ?? [], week.sessions);
    const trends = groupTrends(history, week.today);
    const prefs = week.profile?.prefs;
    const suggestions = volumeSuggestions({
      today: week.today,
      sets: histQ.data ?? [],
      sessions: week.sessions,
      checkins: week.recovery,
      templates: week.templates,
      trends,
      mode: week.mode,
      programSince: programSince(prefs, week.program),
      startDate: week.profile?.start_date ?? null,
    });
    // real sets, not the group sum (a squat set credits quads and glutes but is one set)
    const plannedTotal = open.reduce((n, o) => n + modeTemplate(o.template, week.mode).exercises.reduce((a, e) => a + e.sets, 0), 0);
    const legacyDone = setsByZone(doneSets);
    return { rows: groupRows(done, planned, trends), suggestions, plannedTotal, legacyRows: zoneRows(legacyDone, plannedSetsByZone(open.map((o) => o.template), week.mode)), other: legacyDone.other };
  }, [q.data, histQ.data, open, week.mode, week.sessions, week.today, week.recovery, week.templates, week.profile, week.program]);
  // offline with nothing cached: unknown, never "nothing logged"
  const offline = q.isPending && q.fetchStatus === "paused";
  return {
    ...out,
    open,
    loading: q.isPending && !offline,
    offline,
    error: (q.error as Error | null) ?? null,
    refetch: () => {
      q.refetch();
      histQ.refetch();
    },
  };
}

/* ------------------------------------------------------------ overlap */

/**
 * Fatigue-overlap advice for a date's session (§4.6): before the start (arms still sore after
 * an arm day), the next arm day's prevention, and — with `sessionId` — the in-session check of
 * the first two sets of the watched lifts. Advice only; nothing is applied until tapped.
 */
export function useOverlapAdvice(input: { date: ISODate; template: StoredTemplate | null; sessionId?: string; fired?: ("triceps" | "biceps")[] }): {
  preStart: OverlapAdvice | null;
  nextArmDay: OverlapAdvice | null;
  inSession: OverlapAdvice | null;
} {
  const { userId } = useUser();
  const { unit } = useUnits();
  const { date, template, sessionId } = input;
  const yesterdayDate = addDays(date, -1);
  const sessionsQ = useSessions(addDays(date, -SESSIONS_BACK), date);
  const histQ = useSetsInRange(addDays(date, -SESSIONS_BACK), date);
  const recQ = useRecovery(date, date);
  const liveQ = useQuery({
    queryKey: ["overlap-live-sets", sessionId, userId],
    enabled: !!userId && !!sessionId,
    queryFn: async () => must(await sb().from("exercise_sets").select("id,session_id,exercise_slug,set_index,weight_lb,reps,kind,completed,completed_at").eq("session_id", sessionId!)),
  });
  const watched = useMemo(() => (template ? template.exercises.map((e) => e.slug) : []), [template]);
  const prior = useRecentHistory(sessionId ? watched : []);
  const firedKey = (input.fired ?? []).join(",");

  return useMemo(() => {
    const sessions = (sessionsQ.data ?? []).filter((x) => x.status === "done");
    const sets: OverlapSet[] = (histQ.data ?? [])
      .filter((r) => r.session_id && r.exercise_slug)
      .map((r) => ({ id: r.id, session_id: r.session_id!, exercise_slug: r.exercise_slug!, set_index: r.set_index ?? 0, weight_lb: r.weight_lb, reps: r.reps, completed: true, completed_at: r.completed_at }));
    const ySession = sessions.find((x) => x.local_date === yesterdayDate) ?? null;
    const yesterday = ySession ? { session: ySession, sets: sets.filter((x) => x.session_id === ySession.id) } : null;
    const checkin = (recQ.data ?? []).find((c) => c.local_date === date) ?? null;
    const preStart = overlapPreStart({ today: date, template, yesterday, checkin });
    const nextArmDay = overlapNextArmDay({ sessions: sessions.filter((x) => x.local_date < date), sets, template });
    const live = (liveQ.data ?? []) as OverlapSet[];
    const inSession = sessionId ? overlapInSession({ template, unit, sets: live, prior: prior.data ?? {}, yesterday, sessionId, fired: firedKey ? (firedKey.split(",") as ("triceps" | "biceps")[]) : [] }) : null;
    return { preStart, nextArmDay, inSession };
  }, [sessionsQ.data, histQ.data, recQ.data, liveQ.data, prior.data, template, unit, date, yesterdayDate, sessionId, firedKey]);
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
    networkMode: "always",
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
    if (busy.current || offlineNoChange("The plan")) return false;
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
/* @deprecated: the volleyball UI is removed by the screen streams; P2 deletes this block. */

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
 * @deprecated removed in P2.
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
    networkMode: "always",
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
    networkMode: "always",
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
    networkMode: "always",
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

/** The modes' on-screen names (DESIGN-V3 §2.2): Normal · Easier sets · Light week. Stored values stay standard/intro/deload. */
export const MODE_LABEL: Record<Mode, string> = { standard: "Normal", intro: "Easier sets", deload: "Light week" };

/**
 * Change profile.training_mode with Undo; double taps are ignored. Also writes
 * prefs.modeSetAt = today (the lighter-week check's "back to normal after 7 days"). Resolves
 * true when saved. Never automatic: only a tap calls this.
 */
export function useSetTrainingMode(): { mode: Mode; setMode(m: Mode): Promise<boolean>; pending: boolean } {
  const { profile } = useProfile();
  const today = useToday();
  const save = useSaveProfile();
  const savePrefs = useSavePrefs({ quiet: true });
  const busy = useRef(false);
  const current = (profile?.training_mode ?? "standard") as Mode;
  const setMode = async (m: Mode) => {
    if (m === current || busy.current || offlineNoChange("Training mode")) return false;
    busy.current = true;
    const prev = current;
    const prevSetAt = (parseAppPrefs(profile?.prefs).modeSetAt as string | undefined) ?? undefined;
    try {
      await save.mutateAsync({ values: { training_mode: m } });
    } catch {
      return false;
    } finally {
      busy.current = false;
    }
    savePrefs.mutate({ modeSetAt: today });
    toast.success(m === "deload" ? "Light week on" : m === "intro" ? "Fewer sets on" : "Back to normal", {
      description: "Applies to the next workout you start.",
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          save.mutateAsync({ values: { training_mode: prev } }).catch(() => {});
          if (prevSetAt) savePrefs.mutate({ modeSetAt: prevSetAt });
        },
      },
    });
    return true;
  };
  return { mode: current, setMode, pending: save.isPending };
}

/** "Not now" on a lighter-week or ease-in suggestion: hidden until today + 7 (prefs.lighterSnoozedUntil). */
export function useLighterSnooze(): { snooze(): Promise<boolean> } {
  const today = useToday();
  const savePrefs = useSavePrefs();
  const busy = useRef(false);
  const snooze = async () => {
    if (busy.current || offlineNoChange("The suggestion")) return false;
    busy.current = true;
    try {
      await savePrefs.mutateAsync({ lighterSnoozedUntil: addDays(today, 7) });
      return true;
    } catch {
      return false;
    } finally {
      busy.current = false;
    }
  };
  return { snooze };
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
      const existing = must(await sb().from("day_plans").select("plan_date").gte("plan_date", from).lte("plan_date", today));
      // today keeps its plan too when a workout was started or finished today (§1.1)
      const trainedToday = must(await sb().from("workout_sessions").select("id").eq("local_date", today).in("status", ["active", "done"]).limit(1)).length > 0;
      const writes = scheduleFreeze({ from, today, oldSchedule: prev, newSchedule: next, overridden: existing.map((r) => r.plan_date), trainedToday });
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
        description: "Starts today. Days before today keep the plan they had.",
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
