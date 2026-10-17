"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { addDays, dayName, type ISODate } from "@/lib/dates";
import { getExercise } from "@/lib/training/library";
import { modeRir, plannedSetCount, suggest, type Mode, type PastSet, type Suggestion } from "@/lib/training/progression";
import type { TemplateKey } from "@/lib/training/types";
import { must, newId, sb, useToday, useUser, type Insert } from "./core";
import { useProfile } from "./profile";
import { planFor, useActiveSession, useDayPlans, useTemplates, type Session, type SetRow, type StoredTemplate } from "./training";

/**
 * Completed sessions kept per exercise for suggestions: enough to look past a deload week
 * to the last two real sessions (progression never reads a deload as performance).
 */
export const HISTORY_SESSIONS = 4;

/** Stamp each past set with its session's mode (what that session prescribed). */
export async function withSessionModes(byslug: Record<string, PastSet[]>): Promise<Record<string, PastSet[]>> {
  const ids = [...new Set(Object.values(byslug).flatMap((l) => l.map((s) => s.session_id)))];
  if (!ids.length) return byslug;
  const rows = must(await sb().from("workout_sessions").select("id,mode").in("id", ids));
  const mode = new Map(rows.map((r) => [r.id, (r.mode ?? "standard") as Mode]));
  for (const list of Object.values(byslug)) for (const s of list) s.mode = mode.get(s.session_id) ?? "standard";
  return byslug;
}

/** Last few completed sessions per exercise, for suggestions and "last time" lines. */
export async function fetchRecentHistory(slugs: string[]): Promise<Record<string, PastSet[]>> {
  if (!slugs.length) return {};
  const rows = must(
    await sb()
      .from("set_history")
      .select("local_date,session_id,set_index,weight_lb,reps,duration_sec,rir,exercise_slug")
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
  /** Lighter legs: skip optional jumps and trim leg accessory volume (heavy volleyball week). */
  lighterLegs?: boolean;
}

/** Build the planned set rows for a session from the template + history. */
export function buildSessionSets(sessionId: string, opts: StartOptions, history: Record<string, PastSet[]>): Insert<"exercise_sets">[] {
  const rows: Insert<"exercise_sets">[] = [];
  let order = 0;
  for (const t of opts.template.exercises) {
    const lib = getExercise(t.slug);
    if (opts.lighterLegs && t.optional) continue;
    const n = plannedSetCount(t, lib, opts.mode, opts.lighterLegs);
    const s: Suggestion = suggest(t, lib, history[t.slug] ?? [], opts.mode);
    for (let i = 0; i < n; i++) {
      rows.push({
        id: newId(),
        session_id: sessionId,
        local_date: opts.date,
        exercise_slug: t.slug,
        exercise_name: t.name,
        exercise_order: order,
        set_index: i,
        kind: "working",
        target_rep_low: s.target.low,
        target_rep_high: s.target.high,
        target_unit: t.unit,
        target_rir: modeRir(t, opts.mode),
        rest_sec: t.rest,
        suggested_weight_lb: s.weightLb,
      });
    }
    order++;
  }
  return rows;
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
