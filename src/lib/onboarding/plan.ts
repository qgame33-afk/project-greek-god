// Pure onboarding logic: defaults from the profile, per-step validation, the plan summary shown
// on the finale, and the profile update written when the user finishes.
// No React, no Supabase — everything here is unit-tested.

import { DEFAULT_ROADMAP, requiredWeeklyGain } from "@/lib/bodyweight";
import { isTime, parseAppPrefs } from "@/lib/prefs";
import { addDays, addMonths, daysBetween, monthStart, parseISODate, type ISODate } from "@/lib/dates";
import { PROGRAMS, TWOSET_SCHEDULE } from "@/lib/training/programs";
import type { TwoSetKey } from "@/lib/training/types";
import { round, toDisplayWeight, type LengthUnit, type WeightUnit } from "@/lib/units";
import { balancedCarbs, macroLine, macrosOverflow } from "./macros";

export type PlanKey = TwoSetKey | "rest";
export type Experience = "beginner" | "intermediate" | "advanced";
export type Schedule = Record<string, PlanKey>;

export const STEPS = ["welcome", "body", "goal", "training", "nutrition", "units", "finale"] as const;
export type StepId = (typeof STEPS)[number];

/**
 * The Oath (docs/DESIGN-V2.md §3.11): the same answers in five steps. Each one validates the old
 * steps it absorbed, so the profile written is exactly the seven-step flow's for the same answers.
 */
export const OATH_STEPS = ["climber", "summit", "training", "fuel", "oath"] as const;
export type OathStepId = (typeof OATH_STEPS)[number];
export const OATH_LABELS: Record<OathStepId, string> = { climber: "About you", summit: "Goal", training: "Training", fuel: "Food", oath: "Done" };
const OATH_COVERS: Record<OathStepId, StepId[]> = { climber: ["body", "units"], summit: ["goal"], training: ["training"], fuel: ["nutrition"], oath: [] };

export const STEP_LABELS: Record<StepId, string> = {
  welcome: "Welcome",
  body: "Body",
  goal: "Goal",
  training: "Training",
  nutrition: "Nutrition",
  units: "Units",
  finale: "Your plan",
};

/** The two-set split's days ("Arms & Shoulders (Monday)" …) and Rest: onboarding always starts on it. */
export const SCHEDULE_OPTIONS: { value: PlanKey; label: string }[] = [
  ...PROGRAMS.twoset.templates.map((t) => ({ value: t.key as TwoSetKey, label: `${t.short} (${t.subtitle})` })),
  { value: "rest", label: "Rest" },
];

/** Monday-first display order of JS weekday keys ("0" = Sunday). */
export const WEEK_ORDER = ["1", "2", "3", "4", "5", "6", "0"] as const;
export const WEEKDAY_LABEL: Record<string, string> = { "0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday" };

/** The owner's profile from SPEC §2/§5 — used only when the profile row has no value. */
export const OWNER_DEFAULTS = {
  startWeightLb: 163,
  heightCm: 189.2,
  goalWeightLb: 183,
  goalRangeMinLb: 180,
  goalRangeMaxLb: 185,
  targetDate: "2027-08-01",
  experience: "intermediate" as Experience,
  calorieGoal: 3300,
  proteinGoal: 185,
  fatGoal: 85,
  waterGoalMl: 3000,
  sleepGoalH: 8,
} as const;

export interface OnboardingAnswers {
  displayName: string;
  weightUnit: WeightUnit;
  lengthUnit: LengthUnit;
  startWeightLb: number;
  heightCm: number;
  /** Optional weigh-in for today. A weight_entries row is created only when this is set. */
  todayWeighInLb: number | null;
  goalWeightLb: number;
  goalRangeMinLb: number;
  goalRangeMaxLb: number;
  startDate: ISODate;
  targetDate: ISODate;
  experience: Experience;
  schedule: Schedule;
  /** @deprecated always 0, never validated or written (PROGRAM-ARNOLD §6); removed in P2 once the step drops it. */
  volleyballPerWeek: number;
  introVolume: boolean;
  calorieGoal: number;
  proteinGoal: number;
  fatGoal: number;
  waterGoalMl: number;
  sleepGoalH: number;
  timezone: string;
  /** His usual training time ("16:30"), stored in profiles.prefs.day.trainAt — not a profile column. */
  trainAt: string | null;
}

/** The subset of a profile row onboarding reads (kept structural so tests need no DB types). */
export interface ProfileLike {
  display_name?: string | null;
  weight_unit?: string | null;
  length_unit?: string | null;
  start_weight_lb?: number | string | null;
  height_cm?: number | string | null;
  goal_weight_lb?: number | string | null;
  goal_range_min_lb?: number | string | null;
  goal_range_max_lb?: number | string | null;
  start_date?: string | null;
  target_date?: string | null;
  experience?: string | null;
  weekly_schedule?: unknown;
  training_mode?: string | null;
  calorie_goal?: number | null;
  protein_goal?: number | null;
  fat_goal?: number | null;
  water_goal_ml?: number | null;
  sleep_goal_h?: number | string | null;
  timezone?: string | null;
  onboarded?: boolean | null;
  prefs?: unknown;
}

const num = (v: unknown, fallback: number) => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const KEYS = new Set<string>(SCHEDULE_OPTIONS.map((o) => o.value));

/** A clean 7-day two-set schedule: unknown keys (a Push/Pull/Legs day too) or missing days fall back to the default week. */
export function normalizeSchedule(raw: unknown): Schedule {
  const out: Schedule = { ...(TWOSET_SCHEDULE as Schedule) };
  if (raw && typeof raw === "object") {
    for (const d of WEEK_ORDER) {
      const v = (raw as Record<string, unknown>)[d];
      if (typeof v === "string" && KEYS.has(v)) out[d] = v as PlanKey;
    }
  }
  return out;
}

/**
 * Starting answers. Every value comes from the user's profile (prefilled with the owner's
 * numbers from SPEC §2), so nothing is forced — each one is editable before it's saved.
 */
export function answersFromProfile(p: ProfileLike | null | undefined, today: ISODate, detectedTz: string | null): OnboardingAnswers {
  const D = OWNER_DEFAULTS;
  const target = p?.target_date && p.target_date > today ? p.target_date : D.targetDate > today ? D.targetDate : addDays(today, 7 * 42);
  // A brand-new profile's start date is its creation day; the plan starts today unless the
  // user already onboarded with a different date.
  const startDate = p?.onboarded && p.start_date ? p.start_date : today;
  const exp = p?.experience === "beginner" || p?.experience === "advanced" ? p.experience : "intermediate";
  return {
    displayName: (p?.display_name ?? "").slice(0, 60),
    weightUnit: p?.weight_unit === "lb" ? "lb" : "kg",
    lengthUnit: p?.length_unit === "in" ? "in" : "cm",
    startWeightLb: num(p?.start_weight_lb, D.startWeightLb),
    heightCm: num(p?.height_cm, D.heightCm),
    todayWeighInLb: null,
    goalWeightLb: num(p?.goal_weight_lb, D.goalWeightLb),
    goalRangeMinLb: num(p?.goal_range_min_lb, D.goalRangeMinLb),
    goalRangeMaxLb: num(p?.goal_range_max_lb, D.goalRangeMaxLb),
    startDate,
    targetDate: target,
    experience: exp,
    schedule: normalizeSchedule(p?.weekly_schedule),
    volleyballPerWeek: 0,
    introVolume: p?.training_mode === "intro",
    calorieGoal: Math.round(num(p?.calorie_goal, D.calorieGoal)),
    proteinGoal: Math.round(num(p?.protein_goal, D.proteinGoal)),
    fatGoal: Math.round(num(p?.fat_goal, D.fatGoal)),
    waterGoalMl: Math.round(num(p?.water_goal_ml, D.waterGoalMl)),
    sleepGoalH: num(p?.sleep_goal_h, D.sleepGoalH),
    timezone: detectedTz || p?.timezone || "UTC",
    trainAt: parseAppPrefs(p?.prefs).day.trainAt,
  };
}

/** Merge a stored draft over fresh defaults, dropping anything malformed. */
export function restoreDraft(defaults: OnboardingAnswers, raw: unknown): OnboardingAnswers {
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;
  const out: OnboardingAnswers = { ...defaults };
  for (const k of Object.keys(defaults) as (keyof OnboardingAnswers)[]) {
    const v = r[k];
    const d = defaults[k];
    if (k === "schedule") out.schedule = normalizeSchedule(v ?? defaults.schedule);
    else if (k === "todayWeighInLb") out.todayWeighInLb = typeof v === "number" && Number.isFinite(v) ? v : null;
    else if (k === "trainAt") out.trainAt = v === null ? null : isTime(v) ? (v as string) : defaults.trainAt;
    else if (typeof v === typeof d && v !== null) (out as unknown as Record<string, unknown>)[k] = v;
  }
  if (out.weightUnit !== "lb" && out.weightUnit !== "kg") out.weightUnit = defaults.weightUnit;
  if (out.lengthUnit !== "in" && out.lengthUnit !== "cm") out.lengthUnit = defaults.lengthUnit;
  return out;
}

/**
 * Keep the goal band shaped the same when the goal leaves it: 183 in 180–185 → goal 190
 * becomes 187–192. Inside the band, nothing moves.
 */
export function shiftRange(goal: number, min: number, max: number): { min: number; max: number } {
  if (goal >= min && goal <= max) return { min, max };
  // reuse the band's own width, split 60/40 below/above the goal (the owner's 180–185 around 183)
  const width = Math.max(0, max - min);
  const below = round(width * 0.6, 1);
  return { min: round(goal - below, 1), max: round(goal + width - below, 1) };
}

export const trainingDays = (s: Schedule) => WEEK_ORDER.filter((d) => s[d] && s[d] !== "rest").length;

export interface RoadmapStep {
  month: ISODate; // first of month
  label: string; // "OCT"
  year: number;
  title: string;
  detail: string;
}

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Month-by-month roadmap from the start month to the target month, using the SPEC §12
 * milestones. A different span keeps the first and final months and spreads the rest.
 */
export function roadmapSteps(startDate: ISODate, targetDate: ISODate, startLb: number, unit: WeightUnit, maxMonths = 24): RoadmapStep[] {
  const first = monthStart(startDate);
  const last = monthStart(targetDate);
  let n = 0;
  while (n < maxMonths && addMonths(first, n) <= last) n++;
  if (n === 0) return [];
  const steps: RoadmapStep[] = [];
  for (let i = 0; i < n; i++) {
    const lastIdx = DEFAULT_ROADMAP.length - 1;
    const idx = i === 0 ? 0 : i === n - 1 ? lastIdx : Math.min(lastIdx - 1, Math.max(1, 1 + Math.round(((i - 1) * (lastIdx - 2)) / Math.max(1, n - 3))));
    const m = addMonths(first, i);
    const d = parseISODate(m);
    const base = DEFAULT_ROADMAP[idx];
    steps.push({
      month: m,
      label: MON[d.getMonth()],
      year: d.getFullYear(),
      title: base.title,
      detail: i === 0 ? `Start at ${formatPlacardWeight(startLb, unit)} ${unit}. Baseline weigh-ins, photos and measurements.` : base.detail,
    });
  }
  return steps;
}

/** 163 → "163", 163.4 → "163.4"; in kg one decimal. */
export function formatPlacardWeight(lb: number, unit: WeightUnit) {
  const v = round(toDisplayWeight(lb, unit), 1);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export interface PlanSummary {
  days: number;
  weeks: number;
  trainingDays: number;
  deltaLb: number;
  /** lb per week needed (negative = loss); null when the target date isn't after the start. */
  weeklyRateLb: number | null;
  /** Above 1 lb/week of gain — mostly fat. */
  tooFast: boolean;
  carbs: number;
  macro: ReturnType<typeof macroLine>;
  placard: string;
  roadmap: RoadmapStep[];
}

export function planSummary(a: OnboardingAnswers): PlanSummary {
  const days = Math.max(0, daysBetween(a.startDate, a.targetDate));
  const weeks = Math.ceil(days / 7);
  const td = trainingDays(a.schedule);
  const carbs = balancedCarbs(a.calorieGoal, a.proteinGoal, a.fatGoal);
  const rate = requiredWeeklyGain(a.startWeightLb, a.goalWeightLb, a.startDate, a.targetDate);
  const u = a.weightUnit.toUpperCase();
  const placard = [
    `${formatPlacardWeight(a.startWeightLb, a.weightUnit)} → ${formatPlacardWeight(a.goalWeightLb, a.weightUnit)} ${u}`,
    `${weeks} ${weeks === 1 ? "WEEK" : "WEEKS"}`,
    // "a week", so it never reads as part of the duration ("42 weeks · 6 days")
    `${td} ${td === 1 ? "DAY" : "DAYS"} A WEEK`,
    `${a.calorieGoal.toLocaleString("en-US")} KCAL`,
    `${a.proteinGoal} G`,
  ].join(" · ");
  return {
    days,
    weeks,
    trainingDays: td,
    deltaLb: round(a.goalWeightLb - a.startWeightLb, 1),
    weeklyRateLb: rate,
    tooFast: rate != null && rate > 1,
    carbs,
    macro: macroLine({ calories: a.calorieGoal, protein: a.proteinGoal, carbs, fat: a.fatGoal }),
    placard,
    roadmap: roadmapSteps(a.startDate, a.targetDate, a.startWeightLb, a.weightUnit),
  };
}

/** "≈ 0.48 lb per week" / "≈ 0.2 kg loss per week" / "Hold your weight". */
export function weeklyRateText(rateLb: number | null, unit: WeightUnit) {
  if (rateLb == null) return "Pick a date after your start date";
  if (Math.abs(rateLb) < 0.005) return "Hold your current weight";
  const v = toDisplayWeight(Math.abs(rateLb), unit);
  const s = v >= 1 ? v.toFixed(1) : v.toFixed(2).replace(/0$/, "");
  return `≈ ${s} ${unit} ${rateLb < 0 ? "loss " : ""}per week`;
}

export type StepErrors = Partial<Record<keyof OnboardingAnswers | "macros", string>>;

/** Field errors for one step. An empty object means the step can continue. */
export function validateStep(step: StepId, a: OnboardingAnswers, today: ISODate): StepErrors {
  const e: StepErrors = {};
  const wUnit = a.weightUnit;
  const lim = wUnit === "kg" ? "27–272 kg" : "60–600 lb";
  if (step === "body") {
    if (!(a.startWeightLb >= 60 && a.startWeightLb <= 600)) e.startWeightLb = `Enter a weight between ${lim}.`;
    if (!(a.heightCm >= 100 && a.heightCm <= 250)) e.heightCm = a.lengthUnit === "cm" ? "Enter a height between 100 and 250 cm." : "Enter a height between 3′4″ and 8′2″.";
    if (a.displayName.trim().length > 60) e.displayName = "Keep it under 60 characters.";
    if (a.todayWeighInLb != null && !(a.todayWeighInLb >= 60 && a.todayWeighInLb <= 600)) e.todayWeighInLb = `Enter a weight between ${lim}, or leave it blank.`;
  }
  if (step === "goal") {
    if (!(a.goalWeightLb >= 60 && a.goalWeightLb <= 600)) e.goalWeightLb = `Enter a weight between ${lim}.`;
    if (!a.targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(a.targetDate)) e.targetDate = "Pick a target date.";
    else if (a.targetDate <= today) e.targetDate = "Pick a date after today.";
    else if (a.targetDate <= a.startDate) e.targetDate = "Pick a date after your start date.";
    else if (daysBetween(a.startDate, a.targetDate) > 365 * 5) e.targetDate = "Pick a date within five years.";
    if (!(a.goalRangeMinLb <= a.goalRangeMaxLb)) e.goalRangeMinLb = "The range's low end must be below its high end.";
  }
  if (step === "training") {
    if (a.trainAt != null && !isTime(a.trainAt)) e.trainAt = "Pick a time, or leave it unset.";
  }
  if (step === "nutrition") {
    if (!(a.calorieGoal >= 1000 && a.calorieGoal <= 8000)) e.calorieGoal = "Between 1,000 and 8,000 kcal.";
    if (!(a.proteinGoal >= 0 && a.proteinGoal <= 500)) e.proteinGoal = "Between 0 and 500 g.";
    if (!(a.fatGoal >= 0 && a.fatGoal <= 400)) e.fatGoal = "Between 0 and 400 g.";
    if (!e.calorieGoal && macrosOverflow(a.calorieGoal, a.proteinGoal, a.fatGoal)) e.macros = "Protein and fat alone are over the calorie goal. Lower one of them or raise calories.";
    else if (balancedCarbs(a.calorieGoal, a.proteinGoal, a.fatGoal) > 1200) e.macros = "That leaves more than 1,200 g of carbs. Raise protein or fat.";
    if (!(a.waterGoalMl >= 500 && a.waterGoalMl <= 10000)) e.waterGoalMl = "Between 0.5 and 10 L.";
    if (!(a.sleepGoalH >= 4 && a.sleepGoalH <= 12)) e.sleepGoalH = "Between 4 and 12 hours.";
  }
  if (step === "units") {
    if (!a.timezone.trim()) e.timezone = "Pick your time zone.";
  }
  return e;
}

/** Field errors for one Oath step: everything the old steps it absorbed would have checked. */
export function validateOathStep(step: OathStepId, a: OnboardingAnswers, today: ISODate): StepErrors {
  return Object.assign({}, ...OATH_COVERS[step].map((s) => validateStep(s, a, today))) as StepErrors;
}

/** The first Oath step with an error (the final check before the hold), or null. */
export function firstInvalidOathStep(a: OnboardingAnswers, today: ISODate): OathStepId | null {
  return OATH_STEPS.find((s) => Object.keys(validateOathStep(s, a, today)).length > 0) ?? null;
}

/** How the required pace reads for a lean gain: plain words, never a judgement of him. */
export function paceVerdict(rateLb: number | null): "hold" | "achievable" | "fast" | "too_fast" | "loss" | null {
  if (rateLb == null) return null;
  if (Math.abs(rateLb) < 0.005) return "hold";
  if (rateLb < 0) return "loss";
  if (rateLb > 1) return "too_fast";
  if (rateLb > 0.5) return "fast";
  return "achievable";
}

/** The profile columns written on finish. carb_goal is derived so the targets always add up. */
export function profileUpdateFromAnswers(a: OnboardingAnswers) {
  return {
    display_name: a.displayName.trim() || null,
    height_cm: round(a.heightCm, 1),
    start_weight_lb: round(a.startWeightLb, 1),
    goal_weight_lb: round(a.goalWeightLb, 1),
    goal_range_min_lb: round(Math.min(a.goalRangeMinLb, a.goalWeightLb), 1),
    goal_range_max_lb: round(Math.max(a.goalRangeMaxLb, a.goalWeightLb), 1),
    start_date: a.startDate,
    target_date: a.targetDate,
    experience: a.experience,
    weight_unit: a.weightUnit,
    length_unit: a.lengthUnit,
    calorie_goal: Math.round(a.calorieGoal),
    protein_goal: Math.round(a.proteinGoal),
    fat_goal: Math.round(a.fatGoal),
    carb_goal: balancedCarbs(a.calorieGoal, a.proteinGoal, a.fatGoal),
    water_goal_ml: Math.round(a.waterGoalMl),
    sleep_goal_h: round(a.sleepGoalH, 2),
    weekly_schedule: normalizeSchedule(a.schedule),
    training_mode: a.introVolume ? "intro" : "standard",
    timezone: a.timezone,
    onboarded: true,
  };
}

/** "6 days · Two-set split" schedule summary. */
export function scheduleSummary(s: Schedule) {
  const td = trainingDays(s);
  return `${td} ${td === 1 ? "day" : "days"} · ${PROGRAMS.twoset.name}`;
}
