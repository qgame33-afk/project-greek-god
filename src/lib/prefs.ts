// App preferences stored in profiles.prefs (jsonb, no migration; DESIGN-V2 §4.4): the
// workout booleans, the day schedule (meal times and the usual training time), Gym Mode
// auto and small UI flags. Pure. Every write goes through mergePrefs() — via useSavePrefs()
// in lib/data/profile.ts — so a writer can never drop keys it doesn't know about.

import { normalizeSettings } from "@/lib/reminders/schedule";
import { parsePrefs, type WorkoutPrefs } from "@/lib/workout/prefs";

/** Minutes since local midnight, 0–1439. */
export type Min = number;

export interface DaySchedule {
  trainAt: string | null; // "HH:MM" local; null = not set
  meals: { breakfast: string; lunch: string; dinner: string; snacks: [string, string, string] };
  preWorkoutMin: number; // default 60
}

export const DEFAULT_DAY_SCHEDULE: DaySchedule = {
  trainAt: null,
  meals: { breakfast: "07:40", lunch: "12:30", dinner: "18:30", snacks: ["10:30", "15:00", "21:30"] },
  preWorkoutMin: 60,
};

export interface AppPrefs extends WorkoutPrefs {
  day: DaySchedule;
  /** Land in Gym Mode when the app opens with a session active. Default on. */
  gymAuto: boolean;
  coachNoteSeen?: boolean;
  [k: string]: unknown;
}

/** A patch for mergePrefs(): any top-level key, and any part of `day`. */
export type PrefsPatch = Partial<Omit<AppPrefs, "day">> & {
  day?: {
    trainAt?: string | null;
    preWorkoutMin?: number;
    meals?: Partial<Omit<DaySchedule["meals"], "snacks">> & { snacks?: readonly (string | null | undefined)[] };
  };
};

export const PRE_WORKOUT_MIN_MAX = 240;

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** "7:05" / "07:05" → true; "24:00", "7.30", "" → false. */
export function isTime(v: unknown): v is string {
  return typeof v === "string" && TIME_RE.test(v.trim());
}

/** "7:05" → "07:05". Assumes isTime(). */
function normTime(v: string): string {
  const [h, m] = v.trim().split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

/** "16:30" → 990. NaN for anything that isn't a valid HH:MM time. */
export function toMinutes(hhmm: string): number {
  if (!isTime(hhmm)) return Number.NaN;
  const [h, m] = hhmm.trim().split(":").map(Number);
  return h * 60 + m;
}

/** 990 → "16:30". Wraps around midnight (−30 → "23:30", 1470 → "00:30"). */
export function fromMinutes(min: Min): string {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

/** 990 → "4:30 PM", 0 → "12:00 AM". */
export function formatClock(min: Min): string {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(v / 60);
  const m = v % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function parseDay(raw: unknown): DaySchedule {
  const o = isObj(raw) ? raw : {};
  const meals = isObj(o.meals) ? o.meals : {};
  const d = DEFAULT_DAY_SCHEDULE;
  const t = (v: unknown, fallback: string) => (isTime(v) ? normTime(v) : fallback);
  const sn = Array.isArray(meals.snacks) ? meals.snacks : [];
  const pre = Number(o.preWorkoutMin);
  return {
    trainAt: isTime(o.trainAt) ? normTime(o.trainAt) : null,
    meals: {
      breakfast: t(meals.breakfast, d.meals.breakfast),
      lunch: t(meals.lunch, d.meals.lunch),
      dinner: t(meals.dinner, d.meals.dinner),
      snacks: [t(sn[0], d.meals.snacks[0]), t(sn[1], d.meals.snacks[1]), t(sn[2], d.meals.snacks[2])],
    },
    preWorkoutMin: o.preWorkoutMin != null && Number.isFinite(pre) && pre >= 0 && pre <= PRE_WORKOUT_MIN_MAX ? Math.round(pre) : d.preWorkoutMin,
  };
}

/**
 * Whatever is stored in profiles.prefs, as complete AppPrefs. Tolerant: an invalid field
 * falls back to its default on its own; unknown keys are kept as they are.
 */
export function parseAppPrefs(json: unknown): AppPrefs {
  const o = isObj(json) ? json : {};
  const out: AppPrefs = { ...o, ...parsePrefs(o), day: parseDay(o.day), gymAuto: typeof o.gymAuto === "boolean" ? o.gymAuto : true };
  if (typeof o.coachNoteSeen === "boolean") out.coachNoteSeen = o.coachNoteSeen;
  else delete out.coachNoteSeen;
  return out;
}

function mergeDay(current: unknown, p: NonNullable<PrefsPatch["day"]>): Record<string, unknown> {
  const c: Record<string, unknown> = isObj(current) ? { ...current } : {};
  if (p.trainAt === null) c.trainAt = null;
  else if (isTime(p.trainAt)) c.trainAt = normTime(p.trainAt);
  if (p.preWorkoutMin !== undefined) {
    const n = Number(p.preWorkoutMin);
    if (Number.isFinite(n) && n >= 0 && n <= PRE_WORKOUT_MIN_MAX) c.preWorkoutMin = Math.round(n);
  }
  if (p.meals) {
    const m: Record<string, unknown> = isObj(c.meals) ? { ...c.meals } : {};
    for (const k of ["breakfast", "lunch", "dinner"] as const) {
      const v = p.meals[k];
      if (isTime(v)) m[k] = normTime(v);
    }
    if (p.meals.snacks) {
      const cur = Array.isArray(m.snacks) ? m.snacks : [];
      m.snacks = [0, 1, 2].map((i) => {
        const v = p.meals!.snacks![i];
        if (isTime(v)) return normTime(v);
        return isTime(cur[i]) ? normTime(cur[i] as string) : DEFAULT_DAY_SCHEDULE.meals.snacks[i];
      });
    }
    c.meals = m;
  }
  return c;
}

/**
 * The JSON to store: `current` (the stored prefs, read fresh) with `patch` applied.
 * Deep-merges `day` (and `day.meals`), keeps every key it doesn't know, skips undefined
 * values and ignores invalid times rather than storing them.
 */
export function mergePrefs(current: unknown, patch: PrefsPatch): Record<string, unknown> {
  const cur = isObj(current) ? current : {};
  const out: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "day" || v === undefined) continue;
    out[k] = v;
  }
  if (patch.day) out.day = mergeDay(cur.day, patch.day);
  return out;
}

/**
 * The usual training time the Day Engine uses: prefs.day.trainAt, else the workout
 * reminder's time when that reminder is on, else null (the engine handles null).
 */
export function effectiveTrainAt(prefs: Pick<AppPrefs, "day">, reminders: unknown): string | null {
  if (prefs.day.trainAt) return prefs.day.trainAt;
  const r = normalizeSettings(reminders);
  return r.workout.on ? r.workout.time : null;
}
