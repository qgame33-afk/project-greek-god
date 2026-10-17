// Set timing over logged history (DESIGN-V2 §3.4.3): the exercise detail's per-set marks and
// History's "3 records · 8 beat last". Pure. Every mark comes from timingsForGroup() in
// lib/workout/timing — the same function Gym Mode and the Inscription use — fed with the same
// inputs they get: the best e1RM and set count before the session, and the prior sessions of the
// exercise with their modes (deload compares with deload).

import type { Mode, PastSet } from "./progression";
import { e1rm as e1rmOf } from "./progression";
import type { PriorBest } from "@/lib/workout/pr";
import { timingsForGroup, type SetTiming, type TimingResult } from "@/lib/workout/timing";
import type { WSet } from "@/lib/workout/types";

/** One completed working set as the set_history view returns it. */
export interface HistorySet {
  id: string | null;
  session_id: string | null;
  exercise_slug: string | null;
  local_date: string | null;
  set_index: number | null;
  weight_lb: number | string | null;
  reps: number | null;
  duration_sec: number | null;
  completed_at?: string | null;
}

/**
 * The fields timingsForGroup() reads from a live set, filled from a history row. set_history
 * only holds completed working sets, so kind and completed are fixed.
 */
function asLiveSet(r: HistorySet & { id: string }): WSet {
  return {
    id: r.id,
    session_id: r.session_id,
    exercise_slug: r.exercise_slug,
    kind: "working",
    completed: true,
    weight_lb: r.weight_lb == null ? null : Number(r.weight_lb),
    reps: r.reps,
    duration_sec: r.duration_sec,
    completed_at: r.completed_at ?? null,
    set_index: r.set_index ?? 0,
  } as unknown as WSet;
}

const sessionOrder = (a: HistorySet[], b: HistorySet[]) =>
  (a[0].local_date ?? "").localeCompare(b[0].local_date ?? "") || firstDone(a).localeCompare(firstDone(b)) || (a[0].session_id ?? "").localeCompare(b[0].session_id ?? "");
const firstDone = (s: HistorySet[]) => s.reduce((m, x) => (x.completed_at && (!m || x.completed_at < m) ? x.completed_at : m), "");

/**
 * Timing of every set in `rows` (any number of exercises), keyed by set id. `modeOf` gives a
 * session's mode (unknown = standard).
 */
export function historyTimings(rows: HistorySet[], modeOf: (sessionId: string) => Mode | null | undefined): Map<string, TimingResult> {
  const out = new Map<string, TimingResult>();
  const bySlug = new Map<string, HistorySet[]>();
  for (const r of rows) {
    if (!r.id || !r.session_id || !r.exercise_slug || !r.local_date) continue;
    const list = bySlug.get(r.exercise_slug) ?? [];
    list.push(r);
    bySlug.set(r.exercise_slug, list);
  }
  for (const list of bySlug.values()) {
    const bySession = new Map<string, HistorySet[]>();
    for (const r of list) {
      const s = bySession.get(r.session_id!) ?? [];
      s.push(r);
      bySession.set(r.session_id!, s);
    }
    const sessions = [...bySession.values()].sort(sessionOrder);
    const past: PastSet[] = [];
    let best: number | null = null;
    let bestSet: { weightLb: number | null; reps: number | null } = { weightLb: null, reps: null };
    let count = 0;
    for (const sets of sessions) {
      const sid = sets[0].session_id!;
      const mode = modeOf(sid) ?? "standard";
      const prior: PriorBest = { e1rm: best, sets: count, weightLb: bestSet.weightLb, reps: bestSet.reps };
      const live = sets.map((s) => asLiveSet(s as HistorySet & { id: string }));
      for (const [id, t] of timingsForGroup(live, prior, past, mode)) out.set(id, t);
      for (const s of sets) {
        const w = s.weight_lb == null ? null : Number(s.weight_lb);
        const v = e1rmOf(w, s.reps);
        if (v != null && (best == null || v > best)) {
          best = v;
          bestSet = { weightLb: w, reps: s.reps };
        }
        count++;
        past.push({ local_date: s.local_date!, session_id: sid, set_index: s.set_index ?? 0, weight_lb: w, reps: s.reps, duration_sec: s.duration_sec, rir: null, mode });
      }
    }
  }
  return out;
}

export interface TimingCounts {
  record: number;
  beat: number;
  matched: number;
  below: number;
  first: number;
}

/** Per-session counts of each timing, keyed by session id. */
export function sessionTimingCounts(rows: HistorySet[], timings: Map<string, TimingResult>): Map<string, TimingCounts> {
  const out = new Map<string, TimingCounts>();
  for (const r of rows) {
    if (!r.id || !r.session_id) continue;
    const t = timings.get(r.id)?.timing;
    if (!t) continue;
    const c = out.get(r.session_id) ?? { record: 0, beat: 0, matched: 0, below: 0, first: 0 };
    c[t] += 1;
    out.set(r.session_id, c);
  }
  return out;
}

/** "3 records · 8 beat last", "First benchmarks", "12 matched" — or null with nothing to say. */
export function timingSummary(c: TimingCounts | undefined): string | null {
  if (!c) return null;
  const parts: string[] = [];
  if (c.record) parts.push(`${c.record} ${c.record === 1 ? "record" : "records"}`);
  if (c.beat) parts.push(`${c.beat} beat last`);
  if (parts.length) return parts.join(" · ");
  if (c.first) return "First benchmarks";
  if (c.matched) return `${c.matched} matched`;
  return null;
}

/** The word under a timing mark (§3.2.4). */
export const TIMING_WORD: Record<Exclude<SetTiming, null>, string> = {
  record: "record",
  beat: "beat last",
  matched: "matched",
  below: "below last",
  first: "first benchmark",
};
