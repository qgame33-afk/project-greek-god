import { estimateDurationMin } from "@/lib/training/programs";
import type { DayTemplate } from "@/lib/training/types";
import { templateSummary } from "@/lib/training/volume";
import { formatInt, round, toDisplayWeight, type WeightUnit } from "@/lib/units";

/** "14,250 lb" in the user's unit. */
export function fmtVolume(lb: number | null | undefined, unit: WeightUnit) {
  if (lb == null || !Number.isFinite(Number(lb))) return "—";
  return `${formatInt(toDisplayWeight(Number(lb), unit))} ${unit}`;
}

/** Load value without unit, e.g. "185" or "83.9". */
export function fmtLoadValue(lb: number | null | undefined, unit: WeightUnit) {
  if (lb == null || !Number.isFinite(Number(lb))) return "—";
  const v = round(toDisplayWeight(Number(lb), unit), 1);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** "68 min" from seconds; "—" when unknown. */
export function fmtSessionMinutes(sec: number | null | undefined) {
  if (sec == null || sec <= 0) return "—";
  return `${Math.max(1, Math.round(sec / 60))} min`;
}

/**
 * "6 lifts · 17 sets · ~68 min". The time is the user's typical length for this template when
 * there is one (useTypicalDurations, standard mode only), else the estimate — one "~N min"
 * everywhere (DESIGN-V2 §2.4).
 */
export function templateMeta(t: DayTemplate, typicalMin?: number | null) {
  const s = templateSummary(t);
  return `${plural(s.exercises, "lift")} · ${plural(s.sets, "set")} · ~${typicalMin || estimateDurationMin(t)} min`;
}

const PLURAL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mondays", "Mon & Thu", or "Not scheduled". */
export function weekdaysLabel(days: number[]) {
  if (!days.length) return "Not scheduled";
  if (days.length === 1) return PLURAL[days[0]];
  return days.map((d) => SHORT[d]).join(" & ");
}

/** Sets × reps target, e.g. "3 × 5–8", "2 × 30–45 s", "3 × 8 each". */
export function targetLabel(e: { sets: number; repLow: number; repHigh: number; unit: string }) {
  const range = e.repLow === e.repHigh ? `${e.repLow}` : `${e.repLow}–${e.repHigh}`;
  const suffix = e.unit === "sec" ? " s" : e.unit === "each" ? " each" : "";
  return `${e.sets} × ${range}${suffix}`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
