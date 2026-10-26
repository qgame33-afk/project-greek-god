// Progress › Strength (docs/DESIGN-V3-SIMPLE.md §4.5.3): the words and sets the screen shows,
// read from logged sets through lib/progress (hall, strength). Pure.

import { dayName, monthName, monthStart, parseISODate, type ISODate } from "@/lib/dates";
import type { RecordEntry } from "@/lib/progress/hall";
import { setE1rm, type LiftSummary, type StrengthSet } from "@/lib/progress/strength";
import { getExercise } from "@/lib/training/library";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";

/** "Thu 22 Oct" (with the year when it isn't this year). */
export function dayLabel(d: ISODate, today: ISODate): string {
  const x = parseISODate(d);
  const base = `${dayName(d, true)} ${x.getDate()} ${monthName(d, true)}`;
  return d.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${d.slice(0, 4)}`;
}

/** A load in the display unit without trailing zeros: "25", "27.5". */
export function loadText(lb: number, unit: WeightUnit): string {
  const v = round(toDisplayWeight(lb, unit), 1);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** "70 × 10" (§0 law 7: compact rows may drop "each hand"); "BW × 12"; "BW+25 × 8" for added load. */
export function setText(s: Pick<StrengthSet, "weight_lb" | "reps">, unit: WeightUnit, bodyweight = false): string {
  const w = s.weight_lb != null && Number(s.weight_lb) > 0 ? Number(s.weight_lb) : 0;
  const r = s.reps ?? 0;
  if (w === 0) return `BW × ${r}`;
  return `${bodyweight ? "BW+" : ""}${loadText(w, unit)} × ${r}`;
}

/** Load is per dumbbell: the tracked lift says so, or the library does. */
export function isPerHand(r: Pick<RecordEntry, "perHand" | "set">): boolean {
  return r.perHand || !!getExercise(r.set.exercise_slug)?.perHand;
}

/** The best set of a group: the highest estimate, else the heaviest, else the most reps. */
export function bestSet<T extends StrengthSet>(sets: T[]): T | null {
  let best: T | null = null;
  let bestE = -1;
  for (const s of sets) {
    const e = setE1rm(s) ?? -1;
    if (!best || e > bestE || (e === bestE && ((s.weight_lb ?? 0) > (best.weight_lb ?? 0) || ((s.weight_lb ?? 0) === (best.weight_lb ?? 0) && (s.reps ?? 0) > (best.reps ?? 0))))) {
      best = s;
      bestE = e;
    }
  }
  return best;
}

/**
 * The win card's sentence for a best (the same three cases as the workout's new-best card):
 * more reps at the same weight, more weight for the same reps, otherwise the strongest set.
 */
export function bestSentence(r: RecordEntry, summary: LiftSummary | undefined, unit: WeightUnit): string {
  const earlier = (summary?.sessions ?? []).filter((x) => x.date < r.date).flatMap((x) => x.sets);
  const w = Number(r.set.weight_lb ?? 0);
  const reps = r.set.reps ?? 0;
  const hand = isPerHand(r) ? " each hand" : "";
  const sameWeight = earlier.filter((s) => Math.abs(Number(s.weight_lb ?? 0) - w) < 0.01);
  if (w > 0 && sameWeight.length && sameWeight.every((s) => (s.reps ?? 0) < reps)) return `Most reps you've done at ${loadText(w, unit)} ${unit}${hand}.`;
  const sameReps = earlier.filter((s) => (s.reps ?? 0) === reps);
  if (w > 0 && sameReps.length && sameReps.every((s) => Number(s.weight_lb ?? 0) < w)) return `Heaviest you've done for ${reps} reps.`;
  return "Your strongest set yet.";
}

/** Bests set since the 1st of this month. */
export const bestsThisMonth = (records: RecordEntry[], today: ISODate) => records.filter((r) => r.date >= monthStart(today) && r.date <= today).length;

export interface LiftLine {
  key: string;
  name: string;
  slug: string;
  first: { date: ISODate; set: StrengthSet };
  latest: { date: ISODate; set: StrengthSet };
  sessions: number;
}

/** First and latest best set of each lift he has logged, most recent first. */
export function liftLines(lifts: { key: string; name: string; tracked: boolean }[], summaries: Map<string, LiftSummary>): LiftLine[] {
  const out: LiftLine[] = [];
  for (const l of lifts) {
    const s = summaries.get(l.key);
    const done = (s?.sessions ?? []).filter((x) => x.sets.length);
    if (!done.length) continue;
    const firstSet = bestSet(done[0].sets);
    const lastSet = bestSet(done.at(-1)!.sets);
    if (!firstSet || !lastSet) continue;
    const name = l.tracked ? l.name : lastSet.exercise_name;
    out.push({ key: l.key, name, slug: lastSet.exercise_slug, first: { date: done[0].date, set: firstSet }, latest: { date: done.at(-1)!.date, set: lastSet }, sessions: done.length });
  }
  return out.sort((a, b) => b.latest.date.localeCompare(a.latest.date) || a.name.localeCompare(b.name));
}
