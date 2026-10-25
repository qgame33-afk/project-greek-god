// Plain words for the workout screens (docs/DESIGN-V3-SIMPLE.md §2, §4.2). Pure: the live screen,
// the summary and the workout bar build their sentences here so the copy is tested in one place.

import type { OverlapAdvice } from "@/lib/training/overlap";
import type { LibraryExercise } from "@/lib/training/types";
import type { LiftResult } from "@/lib/workout/gym";
import type { PriorBest } from "@/lib/workout/pr";
import type { Tracking } from "@/lib/workout/types";

type Unit = "lb" | "kg";

/** The unit beside the weight number: "lb each hand" (per-hand lifts), "lb added" (weighted bodyweight), "lb". */
export function weightUnit(lib: Pick<LibraryExercise, "perHand"> | undefined, t: Tracking, unit: Unit): string {
  if (t === "bodyweight_reps") return `${unit} added`;
  return lib?.perHand ? `${unit} each hand` : unit;
}

/** The same, spoken: "pounds each hand". */
export function weightUnitSpoken(lib: Pick<LibraryExercise, "perHand"> | undefined, t: Tracking, unit: Unit): string {
  const w = unit === "kg" ? "kilograms" : "pounds";
  if (t === "bodyweight_reps") return `${w} added`;
  return lib?.perHand ? `${w} each hand` : w;
}

/** The unit beside the reps number: "reps", "reps each side" (per-side lifts), "sec" (timed). */
export function workUnit(t: Tracking, perSide: boolean): string {
  if (t === "weight_time") return "sec";
  return perSide ? "reps each side" : "reps";
}

/** "aim 12–20 reps", "aim 10–15 reps each side", "aim 30–45 sec"; null with no target. */
export function aimLine(low: number | null, high: number | null, unit: string | null): string | null {
  if (low == null && high == null) return null;
  const range = low != null && high != null && low !== high ? `${low}–${high}` : String(low ?? high);
  const word = unit === "sec" ? "sec" : unit === "each" ? "reps each side" : "reps";
  return `aim ${range} ${word}`;
}

const trim = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1))));

/**
 * The previous-session comparison: "25 × 16, 15, 14, 13" when every set used the same weight,
 * else "135 × 8, 140 × 6"; reps alone for bodyweight work; seconds for timed sets.
 */
export function lastTimeText(sets: { weight_lb: number | null; reps: number | null; duration_sec: number | null }[], t: Tracking, toDisplay: (lb: number) => number): string | null {
  if (!sets.length) return null;
  const work = (s: (typeof sets)[number]) => (t === "weight_time" ? `${s.duration_sec ?? 0} s` : String(s.reps ?? 0));
  const loads = sets.map((s) => (s.weight_lb == null ? 0 : Number(s.weight_lb)));
  const loaded = t !== "reps" && loads.some((w) => w > 0);
  if (!loaded) return sets.map(work).join(", ");
  const prefix = t === "bodyweight_reps" ? "+" : "";
  if (loads.every((w) => w === loads[0])) return `${prefix}${trim(toDisplay(loads[0]))} × ${sets.map(work).join(", ")}`;
  return sets.map((s, i) => `${prefix}${trim(toDisplay(loads[i]))} × ${work(s)}`).join(", ");
}

/**
 * The win card's sentence (§4.2.5), from the set he lifted and the best it beat: more reps at
 * the same weight, more weight for the same reps, otherwise the strongest set by estimate.
 */
export function winSentence(set: { weightLb: number; reps: number }, prior: Pick<PriorBest, "weightLb" | "reps"> | undefined, loadText: string, unitWords: string): string {
  if (prior?.weightLb != null && Math.abs(prior.weightLb - set.weightLb) < 0.01 && (prior.reps ?? 0) < set.reps) return `Most reps you've done at ${loadText} ${unitWords}.`;
  if (prior?.reps != null && prior.reps === set.reps && (prior.weightLb ?? 0) < set.weightLb) return `Heaviest you've done for ${set.reps} reps.`;
  return "Your strongest set yet.";
}

/** The summary's verdict on a lift (§4.2.11): "New best", "+1 rep", "Same", "−1 rep", "Better", "Less", "First time". */
export function verdict(r: Pick<LiftResult, "timing" | "delta"> | null | undefined): { text: string; win: boolean } | null {
  if (!r || !r.timing) return null;
  if (r.timing === "record") return { text: "New best", win: true };
  if (r.timing === "first") return { text: "First time", win: false };
  if (r.timing === "matched") return { text: "Same", win: false };
  // rep deltas read as they are; load and estimate deltas become a plain word
  if (r.delta && /rep/.test(r.delta)) return { text: r.delta, win: false };
  return { text: r.timing === "beat" ? "Better" : "Less", win: false };
}

/** "1 minute 12 seconds" for VoiceOver. */
export function spokenTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return [m ? `${m} minute${m === 1 ? "" : "s"}` : "", r || !m ? `${r} second${r === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ");
}

export interface TipRow {
  title: string;
  detail: string;
}

/**
 * The in-workout tip's change rows (§4.2.15) from PROGRAM's advice: `reorder` → "Pec Deck next ·
 * Before Flat Dumbbell Bench Press"; `drop` → "Flat Dumbbell Bench Press · 1 set instead of 2";
 * `rir` → "Stop with 2–3 reps left · On Machine Shoulder Press". `planned` counts the working sets
 * of a lift in this workout.
 */
export function tipRows(advice: Pick<OverlapAdvice, "actions">, nameOf: (slug: string) => string, planned: (slug: string) => number): TipRow[] {
  return advice.actions.map((a) => {
    if (a.kind === "reorder") return { title: `${nameOf(a.move)} next`, detail: `Before ${nameOf(a.before)}` };
    if (a.kind === "drop") {
      const n = planned(a.slug);
      const left = Math.max(1, n - a.sets);
      return { title: nameOf(a.slug), detail: `${left} ${left === 1 ? "set" : "sets"} instead of ${n}` };
    }
    return { title: `Stop with ${a.rir} reps left`, detail: `On ${nameOf(a.slug)}` };
  });
}

/** The tip's title: "Triceps tired from Thursday". */
export function tipTitle(advice: Pick<OverlapAdvice, "muscle">, day: string | null): string {
  const m = advice.muscle === "biceps" ? "Biceps" : advice.muscle === "both" ? "Arms" : "Triceps";
  return `${m} tired from ${day ?? "yesterday"}`;
}

/** The finish sheet's line (§4.2.10). */
export function finishLine(unlogged: number, logged: number): string {
  if (unlogged > 0) return `${unlogged} ${unlogged === 1 ? "set is" : "sets are"} not logged. ${unlogged === 1 ? "It" : "They"} will be dropped.`;
  return `All ${logged} ${logged === 1 ? "set is" : "sets are"} logged.`;
}

/** A rep range with its plain unit (law 7): "12–20 reps", "10–15 each side", "30–45 sec". */
export function rangeText(low: number | null, high: number | null, unit: string | null): string {
  if (low == null && high == null) return "—";
  const lo = low ?? high!;
  const hi = high ?? low!;
  const r = lo === hi ? `${lo}` : `${lo}–${hi}`;
  if (unit === "sec") return `${r} sec`;
  if (unit === "each") return `${r} each side`;
  return `${r} reps`;
}
