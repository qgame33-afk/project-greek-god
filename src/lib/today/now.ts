// The Now screen's copy and small rules (docs/DESIGN-V2.md §3.1). Pure: no React, no Supabase.
// Everything here describes numbers that come from logs, the plan or a fixed rule; when a value
// is missing the caller shows "—" and the next step instead of a guess.

import { daysBetween, monthName, parseISODate, dayName, addDays, monthStart, addMonths, type ISODate } from "@/lib/dates";
import type { DayItem } from "@/lib/now/day-engine";
import type { HabitStatus } from "@/lib/habits";
import { roman } from "@/lib/progress/pace";
import type { CheckinDraft } from "@/lib/recovery/checkin";
import type { Guidance } from "@/lib/recovery/guidance";
import { getExercise } from "@/lib/training/library";
import { groupSessions, suggest, type Mode, type PastSet } from "@/lib/training/progression";
import type { DayTemplate } from "@/lib/training/types";
import { programWeeks, trainingWeek } from "./timeline";

/* ------------------------------------------------------------- the header */

const DAYS3 = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** "SAT 17 OCT · DAY 41". The day count starts at 1 on the programme's start date. */
export function dayEyebrow(today: ISODate, startDate: ISODate | null | undefined): string {
  const d = parseISODate(today);
  const date = `${DAYS3[d.getDay()]} ${d.getDate()} ${monthName(today, true).toUpperCase()}`;
  if (!startDate || today < startDate) return date;
  return `${date} · DAY ${daysBetween(startDate, today) + 1}`;
}

/** "WEEK 6 OF 47", Monday-aligned like the temple. Null before the programme starts. */
export function programWeekLabel(today: ISODate, start: ISODate | null | undefined, target: ISODate | null | undefined): string | null {
  if (!start || !target || today < start) return null;
  const w = trainingWeek(start, today);
  const of = programWeeks(start, target);
  return w > of ? `WEEK ${w}` : `WEEK ${w} OF ${of}`;
}

/* ------------------------------------------------------------------ sleep */

/** 7.5 → "7 h 30", 8 → "8 h", 7.25 → "7 h 15". Null → "—". */
export function sleepShort(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return "—";
  const mins = Math.round(h * 60);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  if (!hh) return `${mm} min`;
  return mm ? `${hh} h ${String(mm).padStart(2, "0")}` : `${hh} h`;
}

/** 7.5 → "7 hours 30 minutes" (VoiceOver). */
export function sleepSpoken(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return "not logged";
  const mins = Math.round(h * 60);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  const hp = `${hh} ${hh === 1 ? "hour" : "hours"}`;
  return mm ? `${hh ? `${hp} ` : ""}${mm} minutes` : hp;
}

/* ---------------------------------------------------------- the check-in */

/** The legs and energy questions' chips, in order 1–5 (the stored scales). */
export const LEGS_CHIPS = ["None", "Light", "Some", "Sore", "Very sore"] as const;
export const ENERGY_CHIPS = ["Drained", "Low", "Okay", "Good", "Fresh"] as const;

export function chipFor(chips: readonly string[], v: number | null | undefined): string | null {
  return v != null && v >= 1 && v <= 5 ? chips[Math.round(v) - 1] : null;
}

/** Sleep stepper bounds and step (§3.1.4: ∓15 min). */
export const SLEEP_STEP_H = 0.25;

/**
 * A check-in answer as an upsert payload holding ONLY the answered fields, so the row on the
 * server is merged, never overwritten: a field set on /recovery (or on another device) stays.
 * Unknown or undefined fields are dropped; an explicit null clears that one field.
 */
export function checkinPatchPayload(date: ISODate, patch: Partial<CheckinDraft>) {
  const out: {
    local_date: ISODate;
    sleep_hours?: number | null;
    sleep_quality?: number | null;
    energy?: number | null;
    soreness?: number | null;
    fatigue?: number | null;
    stress?: number | null;
    pain_notes?: string | null;
    volleyball?: boolean;
  } = { local_date: date };
  const scale = (v: number | null) => (v != null && v >= 1 && v <= 5 ? Math.round(v) : null);
  if (patch.sleep !== undefined) out.sleep_hours = patch.sleep == null || !Number.isFinite(patch.sleep) ? null : Math.round(Math.min(24, Math.max(0, patch.sleep)) * 100) / 100;
  if (patch.quality !== undefined) out.sleep_quality = scale(patch.quality);
  if (patch.energy !== undefined) out.energy = scale(patch.energy);
  if (patch.soreness !== undefined) out.soreness = scale(patch.soreness);
  if (patch.fatigue !== undefined) out.fatigue = scale(patch.fatigue);
  if (patch.stress !== undefined) out.stress = scale(patch.stress);
  if (patch.pain !== undefined) {
    const p = patch.pain.trim().slice(0, 500);
    out.pain_notes = p ? p : null;
  }
  if (patch.volleyball !== undefined) out.volleyball = !!patch.volleyball;
  return out;
}

/* -------------------------------------------------------------- readiness */

/** The short chip on the Now card ("Ready to push"), from the one readiness call. Null without a check-in. */
export function readinessChip(g: Pick<Guidance, "level" | "hasCheckin"> | null | undefined, templateKey: string | null | undefined): string | null {
  if (!g || !g.hasCheckin) return null;
  const k = templateKey ?? "";
  switch (g.level) {
    case "go":
      return k.startsWith("push") ? "Ready to push" : k.startsWith("pull") ? "Ready to pull" : k.startsWith("legs") ? "Ready for legs" : "Ready to train";
    case "legs":
      return "Legs tired";
    case "trim":
      return "Trim today";
    case "ease":
      return "Go lighter";
    case "recover":
      return "Recovery suggested";
    case "rest":
      return "Rest well";
    default:
      return null;
  }
}

/* --------------------------------------------------------------- key lift */

export interface KeyLift {
  name: string;
  /** "190 × 5–8" in the display unit, or null when there's no load to suggest. */
  target: string | null;
  /** The last session's top set, "185 × 6", or null on a first session. */
  from: string | null;
  /** The progression rule's kind (increase / add_reps / hold / reset / deload / first). */
  kind: string;
  /** The rule's one-sentence reason, from the logged numbers. */
  reason: string;
}

/**
 * The lift the Now card leads with: the first loaded, rep-based lift of the session (jumps and
 * timed holds have no load to suggest), with the progression rule's target for today and the
 * last top set it came from. `fmt` formats a load in lb for display (unit conversion).
 */
export function keyLift(t: Pick<DayTemplate, "exercises"> | null | undefined, history: Record<string, PastSet[]>, mode: Mode, fmt: (lb: number) => string): KeyLift | null {
  if (!t) return null;
  const candidates = t.exercises.filter((e) => {
    const lib = getExercise(e.slug);
    return e.unit === "reps" && lib?.category !== "explosive" && lib?.tracking !== "reps";
  });
  for (const e of candidates) {
    const s = suggest(e, getExercise(e.slug), history[e.slug] ?? [], mode);
    if (s.weightLb == null && s.kind !== "first") continue;
    const range = s.target.low === s.target.high ? `${s.target.low}` : `${s.target.low}–${s.target.high}`;
    const last = groupSessions(history[e.slug] ?? [])[0] ?? [];
    let top: PastSet | null = null;
    for (const x of last) {
      const w = Number(x.weight_lb ?? 0);
      if (!top || w > Number(top.weight_lb ?? 0) || (w === Number(top.weight_lb ?? 0) && (x.reps ?? 0) > (top.reps ?? 0))) top = x;
    }
    return {
      name: e.name,
      target: s.weightLb != null ? `${fmt(s.weightLb)} × ${range}` : null,
      from: top && top.weight_lb && top.reps ? `${fmt(Number(top.weight_lb))} × ${top.reps}` : null,
      kind: s.kind,
      reason: s.reason,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ rites */

/** Habits that already have a home on Now: Train, Protein and Sleep in Today's three; the weigh-in on Dawn. */
const HOMED = new Set(["workout", "protein", "sleep", "weighin"]);
export const MAX_RITES = 6;

/** The rites row: the day's habits that aren't shown elsewhere on Now, in the user's order, at most 6. */
export function ritesOf(statuses: HabitStatus[]): { shown: HabitStatus[]; more: number; done: number; total: number } {
  const all = statuses.filter((s) => !HOMED.has(s.key));
  const shown = all.slice(0, MAX_RITES);
  return { shown, more: all.length - shown.length, done: all.filter((s) => s.done).length, total: all.length };
}

/* ---------------------------------------------------------- earlier today */

/** "weigh-in · check-in · 4 meals logged" for the collapsed Earlier row. Never counts what was missed. */
export function earlierSummary(earlier: Pick<DayItem, "kind" | "done" | "label">[]): string {
  const parts: string[] = [];
  if (earlier.some((x) => x.kind === "weighin" && x.done)) parts.push("weigh-in");
  if (earlier.some((x) => x.kind === "checkin" && x.done)) parts.push("check-in");
  const session = earlier.find((x) => x.kind === "session" && x.done);
  if (session) parts.push(`${session.label} sealed`);
  const meals = earlier.filter((x) => x.kind === "meal" && x.done).length;
  if (meals) parts.push(`${meals} ${meals === 1 ? "meal" : "meals"} logged`);
  const open = earlier.filter((x) => x.kind === "meal" && !x.done).length;
  if (!parts.length && open) parts.push(`${open} earlier ${open === 1 ? "meal" : "meals"}`);
  return parts.join(" · ");
}

/* --------------------------------------------------------------- chronicle */

/**
 * On days 1–3 of a month, last month's Chronicle is ready (if the programme ran in it).
 * Book numbers count months from the programme's start month (Book I).
 */
export function chronicleDue(today: ISODate, startDate: ISODate | null | undefined): { month: ISODate; param: string; book: string; monthName: string } | null {
  const day = parseISODate(today).getDate();
  if (day > 3 || !startDate) return null;
  const month = addMonths(monthStart(today), -1);
  if (monthStart(startDate) > month) return null;
  const startM = monthStart(startDate);
  const index = (Number(month.slice(0, 4)) - Number(startM.slice(0, 4))) * 12 + (Number(month.slice(5, 7)) - Number(startM.slice(5, 7)));
  return { month, param: month.slice(0, 7), book: roman(index + 1), monthName: monthName(month) };
}

export const chronicleOpenedKey = (param: string) => `pgg.chronicle.opened.${param}`;

/* ---------------------------------------------------------------- the scale */

/** "Friday was 168.0", "Yesterday was 168.0", "12 Oct was 168.0". */
export function lastWeighInCaption(date: ISODate, today: ISODate, shown: string): string {
  const diff = daysBetween(date, today);
  if (diff === 0) return `Today was ${shown}`;
  if (diff === 1) return `Yesterday was ${shown}`;
  if (diff < 7) return `${dayName(date)} was ${shown}`;
  return `${parseISODate(date).getDate()} ${monthName(date, true)} was ${shown}`;
}

/** A day-to-day change this large is almost always a typo or the wrong unit: ask before inscribing. */
export const IMPLAUSIBLE_CHANGE = 0.1;
export function implausibleWeighIn(lb: number, lastLb: number | null | undefined): boolean {
  if (lastLb == null || !(lastLb > 0)) return false;
  return Math.abs(lb - lastLb) / lastLb > IMPLAUSIBLE_CHANGE;
}

/** Scale line under the trend: "Scale 168.6 · 7:04 am" or "No weigh-in today · last 168.2 Fri". */
export function scaleLine(latest: { lb: string; date: ISODate; time?: string | null } | null, today: ISODate): string {
  if (!latest) return "No weigh-ins yet";
  if (latest.date === today) return latest.time ? `Scale ${latest.lb} · ${latest.time}` : `Scale ${latest.lb} today`;
  const diff = daysBetween(latest.date, today);
  const when = diff < 7 ? dayName(latest.date, true) : `${parseISODate(latest.date).getDate()} ${monthName(latest.date, true)}`;
  return `No weigh-in today · last ${latest.lb} ${when}`;
}

/** "7:04 am" from an ISO timestamp, in the device's timezone. */
export function clockOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/* -------------------------------------------------------------------- misc */

/** Minutes since midnight of an ISO timestamp, when it falls on `date` (device timezone); else null. */
export function minuteOn(iso: string | null | undefined, date: ISODate): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (local !== date) return local < date ? 0 : null;
  return d.getHours() * 60 + d.getMinutes();
}

/** Tomorrow's date (for "Tomorrow · Push A"). */
export const tomorrowOf = (d: ISODate) => addDays(d, 1);
