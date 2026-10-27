import { loadText } from "@/lib/training/loads";
import { PROGRAMS } from "@/lib/training/programs";
import type { ProgramId } from "@/lib/training/types";
import { formatInt, toDisplayWeight, type WeightUnit } from "@/lib/units";

/** "6,460 kg" in the user's unit (stored pounds converted once, here). */
export function fmtVolume(lb: number | null | undefined, unit: WeightUnit) {
  if (lb == null || !Number.isFinite(Number(lb))) return "—";
  return `${formatInt(toDisplayWeight(Number(lb), unit))} ${unit}`;
}

/** Load value without unit on the shared display grid, e.g. "185" or "84". */
export function fmtLoadValue(lb: number | null | undefined, unit: WeightUnit) {
  if (lb == null || !Number.isFinite(Number(lb))) return "—";
  return loadText(Number(lb), unit, false);
}

/** "68 min" from seconds; "—" when unknown. */
export function fmtSessionMinutes(sec: number | null | undefined) {
  if (sec == null || sec <= 0) return "—";
  return `${Math.max(1, Math.round(sec / 60))} min`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** A rep range in words: "12–20 reps", "10–15 reps each side", "30–45 s". */
export function repText(e: { repLow: number; repHigh: number; unit: string }) {
  const range = e.repLow === e.repHigh ? `${e.repLow}` : `${e.repLow}–${e.repHigh}`;
  if (e.unit === "sec") return `${range} s`;
  return e.unit === "each" ? `${range} reps each side` : `${range} reps`;
}

/**
 * A lift's plan line (docs/DESIGN-V3-SIMPLE.md §4.3.1 item 5): "4 sets · 12–20 reps · each hand",
 * "3 sets · 10–15 reps each side", "2 sets · 10–15 reps · optional".
 */
export function liftLine(e: { sets: number; repLow: number; repHigh: number; unit: string; optional?: boolean; rir?: string }, perHand?: boolean) {
  const parts = [plural(e.sets, "set"), repText(e)];
  if (perHand && e.unit !== "each") parts.push("each hand");
  if (e.optional) parts.push("optional");
  return parts.join(" · ");
}

/** The same line for VoiceOver: "4 sets of 12 to 20 reps each side". */
export function liftSpoken(e: { sets: number; repLow: number; repHigh: number; unit: string; optional?: boolean; rir?: string }) {
  const range = e.repLow === e.repHigh ? `${e.repLow}` : `${e.repLow} to ${e.repHigh}`;
  const what = e.unit === "sec" ? "seconds" : e.unit === "each" ? "reps each side" : "reps";
  return `${plural(e.sets, "set")} of ${range} ${what}${e.optional ? ", optional" : ""}`;
}

/** "about 45 min" */
export const aboutMin = (min: number) => `about ${min} min`;

/** "Shoulders, Biceps and Triceps B" for VoiceOver. */
export const spokenName = (s: string) => s.replace(/\s*&\s*/g, " and ");

/** True when a reps-in-the-tank target means "no reps left": "0" (Quinton's incline curls). */
const toFailure = (rir: string | null | undefined) => /^\s*0(\s*[–—-]\s*0)?\s*$/.test(rir ?? "");

const repsWord = (rir: string) => (rir.trim() === "1" ? "rep" : "reps");

/**
 * An effort target in words: "To failure" for "0", "Stop fresh" for "Fresh", else
 * "Stop with 1–2 reps left" ("1 rep" when it is exactly one).
 */
export function effortText(rir: string | null | undefined) {
  if (!rir) return "—";
  if (toFailure(rir)) return "To failure";
  if (/^fresh$/i.test(rir.trim())) return "Stop fresh, well before failure";
  return `Stop with ${rir} ${repsWord(rir)} left`;
}

/** A short label for pickers: "To failure", "1–2 reps left", "Fresh". */
export const effortShort = (rir: string) => (toFailure(rir) ? "To failure" : /^fresh$/i.test(rir.trim()) ? "Fresh" : `${rir} ${repsWord(rir)} left`);

/** "Stop with 2–3 reps left" / "Go to failure" (Options for today's RIR change). */
export const stopWith = (rir: string) => (toFailure(rir) ? "Go to failure" : `Stop with ${rir} ${repsWord(rir)} left`);

/** A program's name as it reads inside a sentence: "the Arnold split" for a "… split", else the name. */
export const programInSentence = (id: ProgramId) => (/split$/i.test(PROGRAMS[id].name) ? `the ${PROGRAMS[id].name}` : PROGRAMS[id].name);
