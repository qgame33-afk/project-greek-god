import type { CoachAccess, CoachCategory } from "./types";

export const CATEGORY_ORDER: CoachCategory[] = ["training", "nutrition", "recovery", "bodyweight", "measurements", "profile"];

export const CATEGORY_META: Record<CoachCategory, { label: string; chip: string; description: string }> = {
  profile: { label: "Profile & goals", chip: "Goals", description: "Height, experience, goal weight, dates and daily targets." },
  training: { label: "Training", chip: "Training", description: "Sessions, sets, lifts, program, volleyball and jump tests." },
  nutrition: { label: "Nutrition", chip: "Nutrition", description: "Food log, calories, macros and water." },
  bodyweight: { label: "Bodyweight", chip: "Weight", description: "Weigh-ins and the trend." },
  recovery: { label: "Recovery", chip: "Recovery", description: "Sleep, soreness, fatigue, stress and pain notes." },
  measurements: { label: "Measurements", chip: "Body", description: "Tape measurements and body-fat estimates." },
};

export const ALL_ACCESS: CoachAccess = { profile: true, training: true, nutrition: true, bodyweight: true, recovery: true, measurements: true };

/** Normalise the profile.coach_access JSON. Missing keys default to shared (the column default). */
export function normalizeAccess(raw: unknown): CoachAccess {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = { ...ALL_ACCESS };
  for (const k of CATEGORY_ORDER) if (typeof o[k] === "boolean") out[k] = o[k] as boolean;
  return out;
}

export function sharedCategories(a: CoachAccess): CoachCategory[] {
  return CATEGORY_ORDER.filter((k) => a[k]);
}

/** "Using: Training · Nutrition · Recovery · Weight +1" */
export function accessChipLabel(a: CoachAccess, max = 4): string {
  const { text, more } = accessChipParts(a, max);
  return more ? `${text} +${more}` : text;
}

/** The chip as two parts so the "+N" never gets truncated away on narrow screens. */
export function accessChipParts(a: CoachAccess, max = 4): { text: string; more: number } {
  const on = sharedCategories(a).map((k) => CATEGORY_META[k].chip);
  if (!on.length) return { text: "Using: nothing — general answers only", more: 0 };
  return { text: `Using: ${on.slice(0, max).join(" · ")}`, more: Math.max(0, on.length - max) };
}
