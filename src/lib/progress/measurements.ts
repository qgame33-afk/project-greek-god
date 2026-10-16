// Physique measurement fields (stored in inches) and per-field summaries. Pure.

import type { ISODate } from "@/lib/dates";
import { round, toDisplayLength, type LengthUnit } from "@/lib/units";

export type MeasureKey =
  | "biceps_flexed_in"
  | "forearm_in"
  | "chest_in"
  | "shoulders_in"
  | "waist_in"
  | "hips_in"
  | "thigh_in"
  | "calf_in";

export interface MeasureField {
  key: MeasureKey;
  label: string;
  long: string;
  /** Growth here is the goal (arms, chest…). Waist and hips are never shown as success. */
  growthGood: boolean;
  /** Database check range, inches. */
  min: number;
  max: number;
  hint: string;
}

export const MEASURE_FIELDS: MeasureField[] = [
  { key: "biceps_flexed_in", label: "Biceps", long: "Flexed biceps", growthGood: true, min: 5, max: 40, hint: "Flexed, at the peak" },
  { key: "forearm_in", label: "Forearms", long: "Forearms", growthGood: true, min: 5, max: 30, hint: "Widest point, fist clenched" },
  { key: "chest_in", label: "Chest", long: "Chest", growthGood: true, min: 20, max: 80, hint: "Across the nipples, relaxed exhale" },
  { key: "shoulders_in", label: "Shoulders", long: "Shoulder circumference", growthGood: true, min: 25, max: 90, hint: "Around both delts at the widest" },
  { key: "waist_in", label: "Waist", long: "Waist", growthGood: false, min: 15, max: 80, hint: "At the navel, relaxed" },
  { key: "hips_in", label: "Hips", long: "Hips", growthGood: false, min: 20, max: 80, hint: "Widest point of the glutes" },
  { key: "thigh_in", label: "Thighs", long: "Thighs", growthGood: true, min: 10, max: 45, hint: "Just below the glute fold" },
  { key: "calf_in", label: "Calves", long: "Calves", growthGood: true, min: 8, max: 30, hint: "Widest point, standing" },
];

export const BODY_FAT = { key: "body_fat_pct" as const, label: "Body fat", min: 2, max: 60 };

export const MEASURE_BY_KEY = Object.fromEntries(MEASURE_FIELDS.map((f) => [f.key, f])) as Record<MeasureKey, MeasureField>;

type Row = { local_date: ISODate } & Partial<Record<MeasureKey | "body_fat_pct", number | string | null>>;

/** Dated values of one field, oldest first (nulls skipped). */
export function fieldSeries(rows: Row[], key: MeasureKey | "body_fat_pct"): { date: ISODate; value: number }[] {
  return rows
    .filter((r) => r[key] != null && Number.isFinite(Number(r[key])))
    .map((r) => ({ date: r.local_date, value: Number(r[key]) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface FieldSummary {
  latest: number | null;
  latestDate: ISODate | null;
  first: number | null;
  firstDate: ISODate | null;
  /** latest − first; null with fewer than two entries. */
  change: number | null;
  count: number;
}

export function fieldSummary(rows: Row[], key: MeasureKey | "body_fat_pct"): FieldSummary {
  const s = fieldSeries(rows, key);
  const first = s[0] ?? null;
  const last = s.at(-1) ?? null;
  return {
    latest: last?.value ?? null,
    latestDate: last?.date ?? null,
    first: first?.value ?? null,
    firstDate: first?.date ?? null,
    change: s.length >= 2 && first && last ? round(last.value - first.value, 2) : null,
    count: s.length,
  };
}

/** Stepper increment per display unit: 0.25 in or 0.5 cm. */
export const measureStep = (unit: "in" | "cm") => (unit === "cm" ? 0.5 : 0.25);

/** Snap a display value onto the stepper grid. */
export function snap(v: number, step: number) {
  return round(Math.round(v / step) * step, 2);
}

/** True when an entry has at least one value. */
export function hasAnyValue(values: Partial<Record<MeasureKey | "body_fat_pct", number | null>>) {
  return MEASURE_FIELDS.some((f) => values[f.key] != null) || values.body_fat_pct != null;
}

/**
 * Display a stored length (inches): cm to 1 decimal; inches to quarter precision with at
 * least one decimal ("39.0", "14.5", "46.75"). `fixed` forces 2 decimals for aligned tables.
 */
export function fmtLen(inches: number | null | undefined, unit: LengthUnit, fixed = false) {
  if (inches == null || !Number.isFinite(inches)) return "—";
  const v = toDisplayLength(inches, unit);
  if (unit === "cm") return round(v, 1).toFixed(1);
  const r = round(v, 2);
  if (fixed) return r.toFixed(2);
  return Math.abs(r * 10 - Math.round(r * 10)) < 1e-6 ? r.toFixed(1) : r.toFixed(2);
}
