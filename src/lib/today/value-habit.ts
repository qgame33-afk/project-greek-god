// How Today's sheet edits a value habit ("Steps", or a custom "Number with target" habit).
// Target and unit mirror evaluate() in lib/habits so the sheet and the checklist always agree.

import { formatInt } from "@/lib/units";

export interface ValueHabitDef {
  label: string;
  target: number | null;
  unit: string | null;
}

export interface ValueHabitSpec {
  label: string;
  /** Goal the row completes at (value ≥ target). */
  target: number;
  /** Unit shown under the number ("steps", "pages", or ""). */
  unit: string;
  step: number;
  max: number;
  /** Steps are whole numbers; custom values may carry one decimal. */
  integer: boolean;
  /** Quick-pick values, ascending and unique. */
  chips: number[];
}

export function valueHabitSpec(key: string, def: ValueHabitDef | null | undefined, stepsGoal: number): ValueHabitSpec {
  const steps = key === "steps";
  const rawTarget = def?.target != null && Number.isFinite(Number(def.target)) ? Number(def.target) : steps ? stepsGoal : 1;
  const target = rawTarget > 0 ? rawTarget : steps ? stepsGoal || 8000 : 1;
  const label = (def?.label ?? (steps ? "Steps" : key)).replace(/\s*\(optional\)\s*/i, "").trim() || "Habit";
  if (steps) {
    const chips = [...new Set([2500, 5000, 7500, Math.round(target)])].filter((n) => n > 0 && n <= 100000).sort((a, b) => a - b);
    return { label, target, unit: def?.unit?.trim() || "steps", step: 500, max: 100000, integer: true, chips };
  }
  // Custom values may be fractional ("7.5 h", "1.5 L"), so they keep one decimal.
  const half = Number.isInteger(target) && target % 2 === 0 ? target / 2 : Math.round(target * 5) / 10;
  return {
    label,
    target,
    unit: def?.unit?.trim() ?? "",
    step: target >= 100 ? 10 : 1,
    max: Math.max(1000, Math.ceil(target * 10)),
    integer: false,
    chips: [...new Set([half, target])].filter((n) => n > 0).sort((a, b) => a - b),
  };
}

/** Parse what the person typed; null when it isn't a usable value for this habit. */
export function parseHabitValue(text: string, spec: Pick<ValueHabitSpec, "max" | "integer">): number | null {
  const t = text.trim().replace(/,/g, "");
  if (t === "") return null;
  // Whole numbers only for integer habits — never silently round or drop a decimal point.
  if (!(spec.integer ? /^\d+$/ : /^\d+(\.\d+)?$/).test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > spec.max) return null;
  return spec.integer ? n : Math.round(n * 10) / 10;
}

/** "6,500" for steps, "12.5" for a decimal custom value. */
export function formatHabitValue(n: number, integer: boolean): string {
  return integer ? formatInt(n) : Number.isInteger(n) ? String(n) : n.toFixed(1);
}
