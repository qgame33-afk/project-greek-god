"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { addDays, dayName, type ISODate } from "@/lib/dates";
import { getExercise } from "@/lib/training/library";
import { plannedSetCount, suggest, type Mode, type PastSet, type Suggestion } from "@/lib/training/progression";
import type { TemplateKey } from "@/lib/training/types";
import { templateExerciseSets } from "@/lib/workout/session";
import { must, newId, sb, useToday, useUser, type Insert } from "./core";
import { useProfile } from "./profile";
import { planFor, useActiveSession, useDayPlans, useTemplates, type Session, type SetRow, type StoredTemplate } from "./training";

/**
 * Completed sessions kept per exercise for suggestions: enough to look past a deload week
 * to the last two real sessions (progression never reads a deload as performance).
 */
export const HISTORY_SESSIONS = 4;

/** Stamp each past set with its session's mode (what that session prescribed) and template. */
export async function withSessionModes(byslug: Record<string, PastSet[]>): Promise<Record<string, PastSet[]>> {
  const ids = [...new Set(Object.values(byslug).flatMap((l) => l.map((s) => s.session_id)))];
  if (!ids.length) return byslug;
  const rows = must(await sb().from("workout_sessions").select("id,mode,template_key").in("id", ids));
  const by = new Map(rows.map((r) => [r.id, r]));
  for (const list of Object.values(byslug))
    for (const s of list) {
      const r = by.get(s.session_id);
      s.mode = (r?.mode ?? "standard") as Mode;
      s.template_key = r?.template_key ?? null;
    }
  return byslug;
}

/** Last few completed sessions per exercise, for suggestions and "last time" lines. */
export async function fetchRecentHistory(slugs: string[]): Promise<Record<string, PastSet[]>> {
  if (!slugs.length) return {};
  const rows = must(
    await sb()
      .from("set_history")
      .select("local_date,session_id,set_index,weight_lb,reps,duration_sec,rir,exercise_slug,completed_at")
      .in("exercise_slug", slugs)
      .order("local_date", { ascending: false })
      .limit(1000),
  );
  const out: Record<string, PastSet[]> = {};
  const sessionsSeen: Record<string, Set<string>> = {};
  for (const r of rows) {
    const slug = r.exercise_slug!;
    sessionsSeen[slug] ??= new Set();
    if (!sessionsSeen[slug].has(r.session_id!) && sessionsSeen[slug].size >= HISTORY_SESSIONS) continue;
    sessionsSeen[slug].add(r.session_id!);
    (out[slug] ??= []).push({
      local_date: r.local_date!,
      session_id: r.session_id!,
      set_index: r.set_index ?? 0,
      weight_lb: r.weight_lb == null ? null : Number(r.weight_lb),
      reps: r.reps,
      duration_sec: r.duration_sec,
      rir: r.rir == null ? null : Number(r.rir),
      completed_at: r.completed_at ?? null,
    });
  }
  return withSessionModes(out);
}

export function useRecentHistory(slugs: string[]) {
  const { userId } = useUser();
  const key = [...new Set(slugs)].sort();
  return useQuery({
    queryKey: ["recent-history", key.join(","), userId],
    enabled: !!userId && key.length > 0,
    queryFn: () => fetchRecentHistory(key),
  });
}

export interface StartOptions {
  template: StoredTemplate;
  date: ISODate;
  mode: Mode;
  /** Materialise optional exercises (Thursday's reverse curls). Every app start passes false: they are offered after the last planned set (§1.4). */
  includeOptional?: boolean;
  /** This session only (fatigue overlap, §4.6): sets to drop per slug, RIR per slug, exercise order by slug. */
  adjust?: { dropSets?: Record<string, number>; rir?: Record<string, string>; order?: string[] };
  /** @deprecated volleyball-era "lighter legs"; use `adjust`. Removed in P2. */
  lighterLegs?: boolean;
}

/** Whether a start materialises optional lifts by default: never (they are offered, §1.4). */
export function includeOptionalByDefault(): false {
  return false;
}

/** The exercises in the order `adjust.order` asks for (listed slugs first, in that order; the rest after, as written). */
function ordered<T extends { slug: string }>(xs: T[], order?: string[]): T[] {
  if (!order?.length) return xs;
  const rank = (slug: string) => {
    const i = order.indexOf(slug);
    return i === -1 ? order.length : i;
  };
  return xs.map((x, i) => ({ x, i })).sort((a, b) => rank(a.x.slug) - rank(b.x.slug) || a.i - b.i).map((e) => e.x);
}

/** Build the planned set rows for a session from the template + history. */
export function buildSessionSets(sessionId: string, opts: StartOptions, history: Record<string, PastSet[]>): Insert<"exercise_sets">[] {
  const rows: Insert<"exercise_sets">[] = [];
  let order = 0;
  for (const t of ordered(opts.template.exercises, opts.adjust?.order)) {
    const lib = getExercise(t.slug);
    if (t.optional && !opts.includeOptional) continue;
    const s: Suggestion = suggest(t, lib, history[t.slug] ?? [], opts.mode, { templateKey: opts.template.key });
    // the deprecated lighter-legs trim, expressed as dropped sets
    const legacyDrop = opts.lighterLegs ? plannedSetCount(t, lib, opts.mode) - plannedSetCount(t, lib, opts.mode, true) : 0;
    const drafts = templateExerciseSets(t, opts.mode, 0, s, { dropSets: (opts.adjust?.dropSets?.[t.slug] ?? 0) + legacyDrop, rir: opts.adjust?.rir?.[t.slug] });
    for (const d of drafts) rows.push({ ...d, id: newId(), session_id: sessionId, local_date: opts.date, exercise_order: order });
    order++;
  }
  return rows;
}

/**
 * The `?t=` deep link rule (§2.5): start that template only when it belongs to the active
 * program; any other key (an old notification's `?t=push_a`) means "start today's plan".
 */
export function startTarget(t: string | null | undefined, activeKeys: readonly string[]): string | null {
  return t && activeKeys.includes(t) ? t : null;
}

/**
 * Start (or resume) a workout. Guards against double taps, resumes an active session for
 * the same day/template instead of creating a duplicate, and never silently reopens an old
 * session from another day — it takes you there so you can finish or discard it.
 */
export function useStartWorkout() {
  const router = useRouter();
  const qc = useQueryClient();
  const { userId } = useUser();
  const today = useToday();
  const { profile } = useProfile();
  const { byKey } = useTemplates();
  const plans = useDayPlans(addDays(today, -1), addDays(today, 1));
  const active = useActiveSession();
  const [starting, setStarting] = useState(false);
  const busy = useRef(false);

  /**
   * The session open right now: the server's word when there is a signal (a cached copy restored
   * at launch can still name a session sealed moments before), the cache only offline.
   */
  const openNow = async (): Promise<Session | null> => {
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    if (!online) return active.data ?? null;
    const row = must(await sb().from("workout_sessions").select("*").eq("status", "active").order("started_at", { ascending: false }).limit(1)).at(0) ?? null;
    if ((row?.id ?? null) !== (active.data?.id ?? null)) qc.setQueryData(["sessions", "active", userId], row);
    return row;
  };

  const start = async (opts: StartOptions): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setStarting(true);
    // Toasts from the screen being left (Training's "Push A on today · Undo") don't follow
    // into the workout, where their Undo would act on a plan that is already being trained.
    toast.dismiss();
    try {
      const current = await openNow();
      if (current) {
        if (current.local_date === opts.date && current.template_key === opts.template.key) {
          router.push(`/workout/${current.id}`);
          return true;
        }
        toast(`${current.name} from ${current.local_date === today ? "today" : dayName(current.local_date)} is still open`, {
          description: "Finish or discard it first — nothing was lost.",
        });
        router.push(`/workout/${current.id}`);
        return true;
      }
      const id = newId();
      const history = await fetchRecentHistory(opts.template.exercises.map((e) => e.slug));
      const session = must(
        await sb()
          .from("workout_sessions")
          .insert({ id, name: opts.template.name, template_key: opts.template.key, local_date: opts.date, mode: opts.mode, status: "active" })
          .select("*")
          .single(),
      );
      const rows = buildSessionSets(id, opts, history);
      let sets: SetRow[] = [];
      if (rows.length) {
        const { data, error } = await sb().from("exercise_sets").insert(rows).select("*");
        if (error) {
          await sb().from("workout_sessions").delete().eq("id", id);
          throw new Error(error.message);
        }
        sets = (data ?? []).sort((a, b) => a.exercise_order - b.exercise_order || a.set_index - b.set_index);
      }
      // Gym Mode opens on the session it was just given (no loading frame): set 1 is on screen
      // the moment the route changes, and the session title morphs into its header (Lights Out).
      // The key is the live screen's own cache entry (components/workout/data.ts liveKey).
      if (rows.length === sets.length) qc.setQueryData(["workout-live", id, userId], { session, sets });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      router.push(`/workout/${id}`);
      return true;
    } catch (e) {
      toast.error("Couldn't start the workout", { description: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      busy.current = false;
      setStarting(false);
    }
  };

  /** Start whatever is planned today. On a rest day, opens Training to pick a session. */
  const startToday = async (): Promise<boolean> => {
    const p = planFor(today, profile ?? undefined, plans.data ?? [], byKey);
    const open = await openNow().catch(() => active.data ?? null);
    if (open) {
      router.push(`/workout/${open.id}`);
      return true;
    }
    if (!p.template) {
      toast("Rest day — pick a session in Training if you want to lift.");
      router.push("/training");
      return true;
    }
    return start({ template: p.template, date: today, mode: (profile?.training_mode ?? "standard") as Mode });
  };

  return { start, startToday, starting, active: active.data ?? null };
}

/* ------------------------------------------------------ session queries */

export function useSessionDetail(id: string) {
  const { userId } = useUser();
  return useQuery({
    queryKey: ["session", id, userId],
    enabled: !!userId && !!id,
    queryFn: async () => {
      const session = must(await sb().from("workout_sessions").select("*").eq("id", id).maybeSingle());
      if (!session) return null;
      const sets = must(await sb().from("exercise_sets").select("*").eq("session_id", id).order("exercise_order").order("set_index"));
      return { session, sets } as { session: Session; sets: SetRow[] };
    },
  });
}

export type { TemplateKey };
