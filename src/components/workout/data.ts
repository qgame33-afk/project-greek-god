"use client";

// Data hooks for the live workout. The session lives in its own TanStack cache entry that is
// the source of truth while training: every set edit is applied to it optimistically and
// written through the outbox (which survives refreshes and dead gym Wi-Fi). Nothing refetches
// it behind the user's back, so a pending write can never be overwritten by stale server data.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { addDays, type ISODate } from "@/lib/dates";
import { must, sb, useToday, useUser } from "@/lib/data/core";
import { drained, enqueue } from "@/lib/data/outbox";
import { useProfile } from "@/lib/data/profile";
import { planFor, useDayPlans, useTemplates } from "@/lib/data/training";
import type { PastSet } from "@/lib/training/progression";
import type { PriorBest } from "@/lib/workout/pr";
import { diffSets, isEmptyDiff, isNetworkError, setPayload } from "@/lib/workout/sync";
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

export async function fetchLive(id: string, opts: { serverWins?: boolean } = {}): Promise<LiveData | null> {
  if (!isUuid(id)) return null;
  const copy = getDeviceCopy<LiveData>(id);
  // Push anything still queued first so the read reflects every tap made on this device.
  if (online()) await drained(4000);
  let server: LiveData;
  try {
    const session = must(await sb().from("workout_sessions").select("*").eq("id", id).maybeSingle());
    if (!session) return null;
    const sets = must(await sb().from("exercise_sets").select("*").eq("session_id", id).order("exercise_order").order("set_index"));
    server = { session, sets };
  } catch (e) {
    // No signal (a reload in a basement gym): keep training from the copy on this device.
    if (copy && (!online() || isNetworkError(e instanceof Error ? e.message : String(e)))) return copy.data;
    throw e;
  }
  if (server.session.status !== "active") return server;
  // This device has changes the server may not hold (a write the outbox gave up on): the
  // device copy wins, and the workout screen re-sends the difference.
  if (copy?.dirty && !opts.serverWins && copy.data.session.id === id) {
    return { session: { ...server.session, notes: copy.data.session.notes }, sets: copy.data.sets };
  }
  setDeviceCopy(id, server, false);
  return server;
}

/**
 * Bring the server in line with this device's copy of the session. The difference is queued
 * through the outbox (so it stays ordered behind any newer tap) and "clean" is returned only
 * once the server already matches.
 */
export async function resyncSession(id: string, local: LiveData): Promise<"clean" | "queued"> {
  const server = must(await sb().from("exercise_sets").select("*").eq("session_id", id));
  const ses: WSession | null = must(await sb().from("workout_sessions").select("*").eq("id", id).maybeSingle());
  if (!ses) return "clean";
  const d = diffSets(local.sets, server);
  const notesDiffer = (local.session.notes ?? null) !== (ses.notes ?? null) && ses.status === local.session.status;
  if (isEmptyDiff(d) && !notesDiffer) return "clean";
  for (const s of d.upserts) enqueue({ kind: "insert", table: "exercise_sets", values: setPayload(s) });
  for (const x of d.deletes) enqueue({ kind: "delete", table: "exercise_sets", id: x });
  if (notesDiffer) enqueue({ kind: "update", table: "workout_sessions", id, values: { notes: local.session.notes } });
  return "queued";
}

export function useLiveSession(id: string | null | undefined) {
  const { userId } = useUser();
  return useQuery({
    queryKey: liveKey(id ?? "", userId),
    enabled: !!userId && !!id,
    queryFn: () => fetchLive(id!),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}

/* ------------------------------------------------------------ mutations */

type SetValues = Partial<Omit<WSet, "id" | "user_id" | "session_id" | "created_at" | "updated_at">>;

/** Optimistic, outbox-backed writes for one session. */
export function useSessionOps(id: string) {
  const qc = useQueryClient();
  const { userId } = useUser();

  const patch = useCallback(
    (fn: (d: LiveData) => LiveData) =>
      qc.setQueryData<LiveData | null>(liveKey(id, userId), (d) => {
        if (!d) return d;
        const next = fn(d);
        // Every tap also lands in this device's copy, so nothing depends on the network.
        setDeviceCopy(id, next, true);
        return next;
      }),
    [qc, id, userId],
  );

  return useMemo(
    () => ({
      updateSet(setId: string, values: SetValues) {
        patch((d) => ({ ...d, sets: d.sets.map((s) => (s.id === setId ? { ...s, ...values } : s)) }));
        enqueue({ kind: "update", table: "exercise_sets", id: setId, values });
      },
      updateSets(list: { id: string; values: SetValues }[]) {
        if (!list.length) return;
        const map = new Map(list.map((x) => [x.id, x.values]));
        patch((d) => ({ ...d, sets: d.sets.map((s) => (map.has(s.id) ? { ...s, ...map.get(s.id) } : s)) }));
        for (const x of list) enqueue({ kind: "update", table: "exercise_sets", id: x.id, values: x.values });
      },
      insertSets(rows: WSet[]) {
        if (!rows.length) return;
        patch((d) => ({ ...d, sets: [...d.sets.filter((s) => !rows.some((r) => r.id === s.id)), ...rows] }));
        for (const r of rows) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { created_at, updated_at, ...values } = r;
          enqueue({ kind: "insert", table: "exercise_sets", values });
        }
      },
      deleteSets(ids: string[]) {
        if (!ids.length) return;
        const set = new Set(ids);
        patch((d) => ({ ...d, sets: d.sets.filter((s) => !set.has(s.id)) }));
        for (const x of ids) enqueue({ kind: "delete", table: "exercise_sets", id: x });
      },
      updateSession(values: Partial<Pick<WSession, "notes" | "status" | "ended_at">>) {
        patch((d) => ({ ...d, session: { ...d.session, ...values } }));
        enqueue({ kind: "update", table: "workout_sessions", id, values });
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
 * The last two completed sessions of each exercise BEFORE this session (this session's own
 * sets are excluded, so suggestions stay fixed while you train). One query per exercise so a
 * rarely trained lift is never crowded out by frequent ones.
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
          .limit(60),
      );
      const seen = new Set<string>();
      const list: PastSet[] = [];
      for (const r of rows) {
        if (!seen.has(r.session_id!) && seen.size >= 2) continue;
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
  return out;
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
