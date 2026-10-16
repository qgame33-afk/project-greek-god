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

/** Last ~2 completed sessions per exercise, for suggestions and "last time" lines. */
export async function fetchRecentHistory(slugs: string[]): Promise<Record<string, PastSet[]>> {
  if (!slugs.length) return {};
  const rows = must(
    await sb()
      .from("set_history")
      .select("local_date,session_id,set_index,weight_lb,reps,duration_sec,rir,exercise_slug")
      .in("exercise_slug", slugs)
      .order("local_date", { ascending: false })
      .limit(600),
  );
  const out: Record<string, PastSet[]> = {};
  const sessionsSeen: Record<string, Set<string>> = {};
  for (const r of rows) {
    const slug = r.exercise_slug!;
    sessionsSeen[slug] ??= new Set();
    if (!sessionsSeen[slug].has(r.session_id!) && sessionsSeen[slug].size >= 2) continue;
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
  return out;
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
  const today = useToday();
  const { profile } = useProfile();
  const { byKey } = useTemplates();
  const plans = useDayPlans(addDays(today, -1), addDays(today, 1));
  const active = useActiveSession();
  const [starting, setStarting] = useState(false);
  const busy = useRef(false);

  const start = async (opts: StartOptions): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setStarting(true);
    try {
      const current = active.data ?? must(await sb().from("workout_sessions").select("*").eq("status", "active").limit(1)).at(0) ?? null;
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
      must(
        await sb()
          .from("workout_sessions")
          .insert({ id, name: opts.template.name, template_key: opts.template.key, local_date: opts.date, mode: opts.mode, status: "active" })
          .select("id")
          .single(),
      );
      const rows = buildSessionSets(id, opts, history);
      if (rows.length) {
        const { error } = await sb().from("exercise_sets").insert(rows);
        if (error) {
          await sb().from("workout_sessions").delete().eq("id", id);
          throw new Error(error.message);
        }
      }
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
    if (active.data) {
      router.push(`/workout/${active.data.id}`);
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
