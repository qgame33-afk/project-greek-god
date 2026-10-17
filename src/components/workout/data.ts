"use client";

// Data hooks for the live workout. The session lives in its own TanStack cache entry: every
// set edit is applied to it optimistically, recorded in this device's journal and written
// through the outbox (which survives refreshes and dead gym Wi-Fi). The cache is never
// replaced wholesale behind the user's back — a sync merges the server's sets in (so sets
// logged on another device appear) while keeping every change this device hasn't seen land.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { addDays, type ISODate } from "@/lib/dates";
import { must, sb, useToday, useUser } from "@/lib/data/core";
import { drained, enqueue, outboxPending, useOutbox } from "@/lib/data/outbox";
import { useProfile } from "@/lib/data/profile";
import { planFor, useDayPlans, useTemplates } from "@/lib/data/training";
import { HISTORY_SESSIONS, withSessionModes } from "@/lib/data/workout";
import type { PastSet } from "@/lib/training/progression";
import type { PriorBest } from "@/lib/workout/pr";
import {
  emptyJournal,
  isNetworkError,
  journalEmpty,
  journalFromDiff,
  reconcile,
  reconcileNotes,
  recordDelete,
  recordInsert,
  recordNotes,
  recordUpdate,
  sameSets,
  setPayload,
  type Journal,
  type Push,
} from "@/lib/workout/sync";
import type { WSession, WSet } from "@/lib/workout/types";
import { getDeviceCopy, setDeviceCopy } from "./stores";

export interface LiveData {
  session: WSession;
  sets: WSet[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string) => UUID.test(id);

export const liveKey = (id: string, userId: string | null) => ["workout-live", id, userId] as const;

const online = () => typeof navigator === "undefined" || navigator.onLine !== false;

async function fetchServer(id: string): Promise<LiveData | null> {
  const session = must(await sb().from("workout_sessions").select("*").eq("id", id).maybeSingle());
  if (!session) return null;
  const sets = must(await sb().from("exercise_sets").select("*").eq("session_id", id).order("exercise_order").order("set_index"));
  return { session, sets };
}

/** This device's journal for a session (a copy saved before journals existed is converted). */
function journalOf(copy: ReturnType<typeof getDeviceCopy<LiveData>>, server: LiveData): Journal {
  if (!copy) return emptyJournal();
  if (copy.journal) return copy.journal;
  return copy.dirty ? journalFromDiff(copy.data.sets, server.sets, copy.data.session.notes, server.session.notes) : emptyJournal();
}

/** A write to the server: one of this device's set changes, or its session note. */
export type LivePush = Push | { kind: "notes"; notes: string | null };

export interface Merged {
  data: LiveData;
  journal: Journal;
  push: LivePush[];
  conflicts: number;
}

/**
 * The session as this device should show it: the server's sets with this device's
 * unconfirmed changes on top, plus the writes that bring the server in line with them.
 */
export function mergeLive(server: LiveData, local: LiveData | null, journal: Journal): Merged {
  // Finished or discarded elsewhere while this device trained: the server's word is final.
  const ended = server.session.status === "discarded" || (local?.session.status === "active" && server.session.status !== "active");
  if (!local || ended || journalEmpty(journal)) return { data: server, journal: emptyJournal(), push: [], conflicts: 0 };
  const r = reconcile(local.sets, server.sets, journal);
  const n = reconcileNotes(local.session.notes ?? null, server.session.notes ?? null, journal.notesBase);
  const push: LivePush[] = n.push ? [...r.push, { kind: "notes", notes: n.notes }] : r.push;
  return { data: { session: { ...server.session, notes: n.notes }, sets: r.sets }, journal: { ...r.journal, notesBase: n.base }, push, conflicts: r.conflicts };
}

/** Queue the writes that bring the server in line with this device's changes. */
function enqueuePush(sessionId: string, push: LivePush[]) {
  for (const p of push) {
    if (p.kind === "notes") enqueue({ kind: "update", table: "workout_sessions", id: sessionId, values: { notes: p.notes } });
    else if (p.kind === "update") enqueue({ kind: "update", table: "exercise_sets", id: p.id, values: p.values });
    else if (p.kind === "insert") enqueue({ kind: "insert", table: "exercise_sets", values: setPayload(p.row) });
    else enqueue({ kind: "delete", table: "exercise_sets", id: p.id });
  }
}

/** Apply the writes directly, in order (Finish waits on each one). */
export async function applyPush(sessionId: string, push: LivePush[]) {
  for (const p of push) {
    if (p.kind === "notes") must(await sb().from("workout_sessions").update({ notes: p.notes }).eq("id", sessionId).select("id"));
    else if (p.kind === "update") must(await sb().from("exercise_sets").update(p.values as never).eq("id", p.id).select("id"));
    else if (p.kind === "insert") must(await sb().from("exercise_sets").upsert(setPayload(p.row) as never, { onConflict: "id" }).select("id"));
    else must(await sb().from("exercise_sets").delete().eq("id", p.id).select("id"));
  }
}

export async function fetchLive(id: string, opts: { serverWins?: boolean } = {}): Promise<LiveData | null> {
  if (!isUuid(id)) return null;
  const copy = getDeviceCopy<LiveData>(id);
  // Push anything still queued first so the read reflects every tap made on this device.
  if (online()) await drained(4000);
  let server: LiveData | null;
  try {
    server = await fetchServer(id);
  } catch (e) {
    // No signal (a reload in a basement gym): keep training from the copy on this device.
    if (copy && (!online() || isNetworkError(e instanceof Error ? e.message : String(e)))) return copy.data;
    throw e;
  }
  if (!server || server.session.status !== "active") return server;
  if (opts.serverWins || copy?.data.session.id !== id) {
    setDeviceCopy(id, server, emptyJournal());
    return server;
  }
  // The server's sets (including any logged on another device) with this device's
  // unconfirmed changes on top; the live screen's sync re-sends those.
  const m = mergeLive(server, copy.data, journalOf(copy, server));
  setDeviceCopy(id, m.data, m.journal);
  return m.data;
}

export function useLiveSession(id: string | null | undefined) {
  const { userId } = useUser();
  return useQuery({
    queryKey: liveKey(id ?? "", userId),
    enabled: !!userId && !!id,
    queryFn: () => fetchLive(id!),
    // Never refetched wholesale: the live screen merges server changes in (useSessionSync).
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}

/* ------------------------------------------------------------ mutations */

type SetValues = Partial<Omit<WSet, "id" | "user_id" | "session_id" | "created_at" | "updated_at">>;

/** Optimistic, outbox-backed writes for one session, each recorded in this device's journal. */
export function useSessionOps(id: string) {
  const qc = useQueryClient();
  const { userId } = useUser();
  const syncing = useRef(false);

  const patch = useCallback(
    (fn: (d: LiveData) => LiveData, note: (j: Journal, d: LiveData) => Journal) =>
      qc.setQueryData<LiveData | null>(liveKey(id, userId), (d) => {
        if (!d) return d;
        const next = fn(d);
        // Every tap also lands in this device's copy, so nothing depends on the network.
        const copy = getDeviceCopy<LiveData>(id);
        setDeviceCopy(id, next, note(copy?.journal ?? emptyJournal(), d));
        return next;
      }),
    [qc, id, userId],
  );

  return useMemo(
    () => ({
      updateSet(setId: string, values: SetValues) {
        patch(
          (d) => ({ ...d, sets: d.sets.map((s) => (s.id === setId ? { ...s, ...values } : s)) }),
          (j, d) => recordUpdate(j, d.sets.find((s) => s.id === setId), values),
        );
        enqueue({ kind: "update", table: "exercise_sets", id: setId, values });
      },
      updateSets(list: { id: string; values: SetValues }[]) {
        if (!list.length) return;
        const map = new Map(list.map((x) => [x.id, x.values]));
        patch(
          (d) => ({ ...d, sets: d.sets.map((s) => (map.has(s.id) ? { ...s, ...map.get(s.id) } : s)) }),
          (j, d) => list.reduce((acc, x) => recordUpdate(acc, d.sets.find((s) => s.id === x.id), x.values), j),
        );
        for (const x of list) enqueue({ kind: "update", table: "exercise_sets", id: x.id, values: x.values });
      },
      insertSets(rows: WSet[]) {
        if (!rows.length) return;
        patch(
          (d) => ({ ...d, sets: [...d.sets.filter((s) => !rows.some((r) => r.id === s.id)), ...rows] }),
          (j) => rows.reduce(recordInsert, j),
        );
        for (const r of rows) {
          const { created_at, updated_at, ...values } = r;
          enqueue({ kind: "insert", table: "exercise_sets", values });
        }
      },
      deleteSets(ids: string[]) {
        if (!ids.length) return;
        const set = new Set(ids);
        patch(
          (d) => ({ ...d, sets: d.sets.filter((s) => !set.has(s.id)) }),
          (j, d) => d.sets.filter((s) => set.has(s.id)).reduce(recordDelete, j),
        );
        for (const x of ids) enqueue({ kind: "delete", table: "exercise_sets", id: x });
      },
      updateSession(values: Partial<Pick<WSession, "notes">>) {
        patch(
          (d) => ({ ...d, session: { ...d.session, ...values } }),
          (j, d) => ("notes" in values ? recordNotes(j, d.session.notes ?? null) : j),
        );
        enqueue({ kind: "update", table: "workout_sessions", id, values });
      },
      /**
       * Merge the server's copy in: sets logged on another device appear, and this device's
       * unconfirmed changes are re-sent (only those — never a whole row it didn't change).
       * Skipped while writes are queued or when a tap lands mid-read; the next tick retries.
       */
      async sync(): Promise<Merged | null> {
        const key = liveKey(id, userId);
        const before = qc.getQueryData<LiveData | null>(key);
        if (syncing.current || !before || before.session.status !== "active" || !online() || outboxPending() > 0) return null;
        syncing.current = true;
        try {
          const server = await fetchServer(id);
          if (!server || qc.getQueryData(key) !== before || outboxPending() > 0) return null;
          const m = mergeLive(server, before, journalOf(getDeviceCopy<LiveData>(id), server));
          enqueuePush(id, m.push);
          setDeviceCopy(id, m.data, m.journal);
          const same = m.data.session.status === before.session.status && (m.data.session.notes ?? null) === (before.session.notes ?? null) && sameSets(m.data.sets, before.sets);
          if (!same) qc.setQueryData(key, m.data);
          return m;
        } catch {
          return null; // no signal — the next tick tries again
        } finally {
          syncing.current = false;
        }
      },
      /** Replace the cache with server truth (when the server rejected a write). */
      async reload() {
        const fresh = await fetchLive(id, { serverWins: true });
        qc.setQueryData(liveKey(id, userId), fresh);
        return fresh;
      },
      setData(d: LiveData) {
        qc.setQueryData(liveKey(id, userId), d);
      },
    }),
    [patch, id, qc, userId],
  );
}

/**
 * Keep the live session in step with the server while it is on screen: whenever the outbox
 * is idle, on focus, on return to the tab, on reconnect and every 20 s.
 */
export function useSessionSync(ops: ReturnType<typeof useSessionOps>, enabled: boolean) {
  const outbox = useOutbox();
  const idle = outbox.pending === 0;
  useEffect(() => {
    if (!enabled || !idle) return;
    const run = () => {
      if (document.visibilityState === "visible") void ops.sync();
    };
    const first = window.setTimeout(run, 1500);
    const every = window.setInterval(run, 20000);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      window.removeEventListener("focus", run);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [enabled, idle, ops]);
}

/** A full exercise_sets row for an optimistic insert. */
export function newSetRow(base: Pick<WSet, "session_id" | "local_date" | "exercise_slug" | "exercise_name" | "exercise_order" | "set_index" | "user_id"> & Partial<WSet>): WSet {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    kind: "working",
    weight_lb: null,
    reps: null,
    duration_sec: null,
    rir: null,
    completed: false,
    completed_at: null,
    notes: null,
    target_rep_low: null,
    target_rep_high: null,
    target_unit: "reps",
    target_rir: null,
    rest_sec: null,
    suggested_weight_lb: null,
    created_at: now,
    updated_at: now,
    ...base,
  };
}

/** Invalidate everything a finished/edited session feeds (Today, Training, Progress, Reviews). */
export function invalidateTraining(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ["sessions", "session", "exercise-bests", "exercise-daily", "exercise-sets", "pr-events", "sets-range", "recent-history", "prior-history", "prior-bests"]) {
    qc.invalidateQueries({ queryKey: [k] });
  }
}

/* --------------------------------------------------------------- history */

/**
 * The last few completed sessions of each exercise BEFORE this session (this session's own
 * sets are excluded, so suggestions stay fixed while you train), each stamped with its
 * session mode. One query per exercise so a rarely trained lift is never crowded out.
 */
export async function fetchPriorHistory(slugs: string[], sessionId: string, beforeDate: ISODate): Promise<Record<string, PastSet[]>> {
  const out: Record<string, PastSet[]> = {};
  await Promise.all(
    slugs.map(async (slug) => {
      const rows = must(
        await sb()
          .from("set_history")
          .select("local_date,session_id,set_index,weight_lb,reps,duration_sec,rir,completed_at")
          .eq("exercise_slug", slug)
          .neq("session_id", sessionId)
          .lte("local_date", beforeDate)
          .order("local_date", { ascending: false })
          .order("completed_at", { ascending: false })
          .limit(80),
      );
      const seen = new Set<string>();
      const list: PastSet[] = [];
      for (const r of rows) {
        if (!seen.has(r.session_id!) && seen.size >= HISTORY_SESSIONS) continue;
        seen.add(r.session_id!);
        list.push({
          local_date: r.local_date!,
          session_id: r.session_id!,
          set_index: r.set_index ?? 0,
          weight_lb: r.weight_lb == null ? null : Number(r.weight_lb),
          reps: r.reps,
          duration_sec: r.duration_sec,
          rir: r.rir == null ? null : Number(r.rir),
        });
      }
      out[slug] = list;
    }),
  );
  return withSessionModes(out);
}

export function usePriorHistory(sessionId: string, slugs: string[], beforeDate: ISODate | undefined) {
  const { userId } = useUser();
  const key = [...new Set(slugs)].sort();
  return useQuery({
    queryKey: ["prior-history", sessionId, key.join(","), beforeDate, userId],
    enabled: !!userId && !!beforeDate && key.length > 0,
    queryFn: () => fetchPriorHistory(key, sessionId, beforeDate!),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
}

/** Best e1RM and set count per exercise before this session — the bar a PR has to clear. */
export async function fetchPriorBests(slugs: string[], sessionId: string, beforeDate: ISODate): Promise<Record<string, PriorBest>> {
  const out: Record<string, PriorBest> = {};
  await Promise.all(
    slugs.map(async (slug) => {
      const res = await sb()
        .from("set_history")
        .select("e1rm_lb,weight_lb,reps", { count: "exact" })
        .eq("exercise_slug", slug)
        .neq("session_id", sessionId)
        .lte("local_date", beforeDate)
        .order("e1rm_lb", { ascending: false, nullsFirst: false })
        .limit(1);
      if (res.error) throw new Error(res.error.message);
      const top = res.data?.[0];
      out[slug] = {
        e1rm: top?.e1rm_lb == null ? null : Number(top.e1rm_lb),
        sets: res.count ?? 0,
        weightLb: top?.weight_lb == null ? null : Number(top.weight_lb),
        reps: top?.reps ?? null,
      };
    }),
  );
  return out;
}

export function usePriorBests(sessionId: string, slugs: string[], beforeDate: ISODate | undefined) {
  const { userId } = useUser();
  const key = [...new Set(slugs)].sort();
  return useQuery({
    queryKey: ["prior-bests", sessionId, key.join(","), beforeDate, userId],
    enabled: !!userId && !!beforeDate && key.length > 0,
    queryFn: () => fetchPriorBests(key, sessionId, beforeDate!),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
}

/** The previous finished session of the same template (for "Volume +4% vs last Push A"). */
export function usePreviousSession(session: WSession | undefined) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["prev-session", session?.id, session?.template_key, userId],
    enabled: !!userId && !!session?.template_key,
    queryFn: async () =>
      must(
        await sb()
          .from("workout_sessions")
          .select("id,name,total_volume_lb,local_date,started_at")
          .eq("template_key", session!.template_key!)
          .eq("status", "done")
          .neq("id", session!.id)
          .lt("started_at", session!.started_at)
          .order("started_at", { ascending: false })
          .limit(1),
      ).at(0) ?? null,
  });
}

/** The next scheduled training day after today: "Tomorrow · Pull A". */
export function useNextWorkout() {
  const today = useToday();
  const { profile } = useProfile();
  const { byKey, loading } = useTemplates();
  const plans = useDayPlans(addDays(today, 1), addDays(today, 8));
  if (loading || plans.isLoading) return null;
  for (let i = 1; i <= 8; i++) {
    const date = addDays(today, i);
    const p = planFor(date, profile ?? undefined, plans.data ?? [], byKey);
    if (p.template) return { date, name: p.template.name, inDays: i };
  }
  return null;
}
