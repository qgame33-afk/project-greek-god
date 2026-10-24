// Small helpers that describe today's planned session for the hero line and the workout card.

import { addDays, dayName, type ISODate } from "@/lib/dates";
import { estimateDurationMin } from "@/lib/training/programs";
import { isLegDay } from "@/lib/training/volume";
import type { DayTemplate, TemplateExercise } from "@/lib/training/types";
import type { PlanFacts } from "./daily-line";
import type { NextSession } from "./recovery-recs";

/** The plan as the daily line needs it. A leg day is judged by its content (isLegDay), never its key. */
export function planFacts(t: Pick<DayTemplate, "key" | "name" | "exercises"> | null): PlanFacts {
  if (!t) return { kind: "rest" };
  return { kind: "train", name: t.name, legs: isLegDay(t) };
}

/** "3 × 5–8", "3 × 12–20 each", "3 × 30–45 s", "3 × 3" */
export function prescription(e: Pick<TemplateExercise, "sets" | "repLow" | "repHigh" | "unit">): string {
  const reps = e.repLow === e.repHigh ? `${e.repLow}` : `${e.repLow}–${e.repHigh}`;
  const suffix = e.unit === "sec" ? " s" : e.unit === "each" ? " each" : "";
  return `${e.sets} × ${reps}${suffix}`;
}

/** Relative day label for an upcoming date: "Tomorrow", else the weekday name. */
export function upcomingLabel(date: ISODate, today: ISODate): string {
  return date === addDays(today, 1) ? "Tomorrow" : dayName(date);
}

/**
 * First training day after `today` within the next `horizon` days.
 * `resolve` returns the template planned on a date (null for rest).
 */
export function nextSession(today: ISODate, resolve: (d: ISODate) => DayTemplate | null, horizon = 8): (NextSession & { date: ISODate }) | null {
  for (let i = 1; i <= horizon; i++) {
    const d = addDays(today, i);
    const t = resolve(d);
    if (t) return { date: d, name: t.name, when: upcomingLabel(d, today), exercises: t.exercises.length, minutes: estimateDurationMin(t) };
  }
  return null;
}
