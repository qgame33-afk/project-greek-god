// Latest personal records for the Today card, from the pr_events view (a set whose e1RM beat
// every earlier completed set of that exercise). Several sets in one session can each beat
// the previous one — they collapse into a single record per exercise per session.

import type { ISODate } from "@/lib/dates";

export interface PREventRow {
  session_id: string | null;
  set_id?: string | null;
  exercise_slug: string | null;
  exercise_name: string | null;
  local_date: ISODate | null;
  weight_lb: number | null;
  reps: number | null;
  e1rm_lb: number | null;
  prior_best_e1rm: number | null;
}

export interface RecordItem {
  key: string;
  sessionId: string | null;
  slug: string;
  name: string;
  date: ISODate;
  weightLb: number;
  reps: number;
  e1rmLb: number;
  /** e1RM gain over the best before this session. */
  gainLb: number;
}

export function latestRecords(events: PREventRow[], n = 3): RecordItem[] {
  const groups = new Map<string, RecordItem & { prior: number }>();
  for (const e of events) {
    if (!e.exercise_slug || !e.local_date || e.e1rm_lb == null || e.prior_best_e1rm == null || e.weight_lb == null || e.reps == null) continue;
    const key = `${e.session_id ?? e.local_date}|${e.exercise_slug}`;
    const e1 = Number(e.e1rm_lb);
    const prior = Number(e.prior_best_e1rm);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        key,
        sessionId: e.session_id,
        slug: e.exercise_slug,
        name: e.exercise_name ?? e.exercise_slug,
        date: e.local_date,
        weightLb: Number(e.weight_lb),
        reps: e.reps,
        e1rmLb: e1,
        prior,
        gainLb: 0,
      });
      continue;
    }
    g.prior = Math.min(g.prior, prior);
    if (e1 > g.e1rmLb) {
      g.e1rmLb = e1;
      g.weightLb = Number(e.weight_lb);
      g.reps = e.reps;
    }
  }
  return [...groups.values()]
    .map(({ prior, ...r }) => ({ ...r, gainLb: Math.round((r.e1rmLb - prior) * 10) / 10 }))
    .sort((a, b) => (a.date === b.date ? b.e1rmLb - a.e1rmLb : b.date.localeCompare(a.date)))
    .slice(0, n);
}
