// Gym loads in the user's unit (docs/PROGRAM-V3.md §2). Pure.
//
// The database stores pounds (exercise_sets.weight_lb is numeric(6,1)); profiles.weight_unit
// decides what is shown and typed. Every load on screen goes through these helpers, so a
// value is converted exactly once in each direction:
//   display: storedLb → displayLoad(lb, unit)  (kg on a 0.5 grid, lb on a 0.5 grid)
//   input:   typed    → storeLoad(value, unit) (kg: lb at the column's 0.1; lb: on the 0.5 grid)
// 0.1 lb is 0.045 kg, less than half of the 0.5 kg display grid, so a kg value typed on that
// grid (22.5 kg) is stored and shown back exactly (tested over 0–300 kg). In lb a typed load
// lands on the 0.5 lb grid and is stored as typed (50 lb is 50.0, never 49.6); a set typed in kg
// earlier (49.6 lb) shows as its pound value on that grid (49.5 lb). Bodyweight shows on a 0.1
// grid in either unit; weight_entries.weight_lb is also 0.1 lb, so it round-trips too.

import { LB_PER_KG, round, type WeightUnit } from "@/lib/units";
import type { LibraryExercise } from "./types";

/** The display grid for gym loads: 0.5 kg or 0.5 lb (whole and half plates read as "22.5", "47.5"). */
export const LOAD_GRID: Record<WeightUnit, number> = { kg: 0.5, lb: 0.5 };
/** The display grid for bodyweight: 0.1 in either unit. */
export const BODY_GRID = 0.1;

const snap = (v: number, grid: number) => round(Math.round(v / grid) * grid, 2);

/** A stored load (lb) in the display unit, on the display grid. */
export function displayLoad(lb: number, unit: WeightUnit): number {
  return unit === "kg" ? snap(lb / LB_PER_KG, LOAD_GRID.kg) : snap(lb, LOAD_GRID.lb);
}

/** A load typed in the display unit, as the pounds to store: kg at the column's 0.1 lb, lb on its 0.5 lb grid. */
export function storeLoad(value: number, unit: WeightUnit): number {
  return unit === "kg" ? round(value * LB_PER_KG, 1) : round(snap(value, LOAD_GRID.lb), 1);
}

/** Stored bodyweight (lb) in the display unit, one decimal. */
export function displayBodyweight(lb: number, unit: WeightUnit): number {
  return unit === "kg" ? snap(lb / LB_PER_KG, BODY_GRID) : round(lb, 1);
}

/** Bodyweight typed in the display unit, as the pounds to store. */
export function storeBodyweight(value: number, unit: WeightUnit): number {
  return round(unit === "kg" ? value * LB_PER_KG : value, 1);
}

/** "22.5 kg" / "50 lb": a load for display, whole numbers without a decimal. */
export function loadText(lb: number | null | undefined, unit: WeightUnit, withUnit = true): string {
  if (lb == null || !Number.isFinite(lb)) return "—";
  const v = displayLoad(lb, unit);
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return withUnit ? `${s} ${unit}` : s;
}

/**
 * The smallest sensible load step for an exercise, in the display unit (the stepper's ± and the
 * progression's increase).
 * - kg: dumbbells 2 kg per hand, barbell/Smith 2.5 kg total, cable and machine stacks 2.5 kg,
 *   added load on bodyweight lifts 2.5 kg.
 * - lb: 5 lb — barbell and Smith total, dumbbells per hand, cable and machine stacks, added load —
 *   or 2.5 lb when the library's increment says so (light dumbbells, small isolation lifts);
 *   plate-loaded machines whose increment is 10 lb (a 5 lb plate on each side) keep 10.
 */
export function loadStep(lib: Pick<LibraryExercise, "equipment" | "increment" | "perHand"> | undefined, unit: WeightUnit): number {
  if (unit === "lb") {
    if (!lib) return 5;
    if (lib.increment > 0 && lib.increment <= 2.5) return 2.5;
    if (lib.equipment === "plate_loaded" && lib.increment >= 10) return 10;
    return 5;
  }
  if (!lib) return 2.5;
  if (lib.equipment === "dumbbell" || lib.equipment === "kettlebell" || lib.perHand) return 2;
  return 2.5;
}

/**
 * The next load after one step up, as pounds to store: the last load on the display grid, plus
 * one step, back to pounds. kg: 22.5 kg dumbbells → 24.5 kg (54.0 lb); 60 lb (27 kg on the grid)
 * on a cable → 29.5 kg. lb: 50 → 55; a load off the step grid (a set typed in kg, 49.6 lb) lands
 * on the nearest step after adding one (55 lb), so the suggestion is a dumbbell or plate he has.
 */
export function stepUp(lb: number, lib: Pick<LibraryExercise, "equipment" | "increment" | "perHand"> | undefined, unit: WeightUnit): number {
  const step = loadStep(lib, unit);
  if (unit === "lb") return storeLoad(Math.max(step, Math.round((displayLoad(lb, unit) + step) / step) * step), unit);
  return storeLoad(displayLoad(lb, unit) + step, unit);
}

/** About `pct` lighter (a reset or a deload), on the display grid, as pounds to store. */
export function scaleLoad(lb: number, factor: number, lib: Pick<LibraryExercise, "equipment" | "increment" | "perHand"> | undefined, unit: WeightUnit): number {
  const step = loadStep(lib, unit);
  const v = Math.max(step, Math.round((displayLoad(lb, unit) * factor) / step) * step);
  return storeLoad(round(v, 2), unit);
}

/** The barbell for plate maths in the display unit (20 kg / 45 lb). Use workout/plates.ts platesLabel(total, unit) for the per-side plates. */
export const BAR: Record<WeightUnit, number> = { kg: 20, lb: 45 };
