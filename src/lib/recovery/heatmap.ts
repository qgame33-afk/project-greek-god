// Monthly consistency calendar. Gold only marks what was earned; an empty day is a quiet
// surface, never red. Weeks start on Monday to match the training week.

import {
  addDays,
  longDate,
  monthEnd,
  monthStart,
  weekday,
  type ISODate,
} from "@/lib/dates";
import { STREAK_THRESHOLD } from "@/lib/habits";

export type CellKind =
  "pre" | "future" | "empty" | "low" | "mid" | "high" | "full";

/** Habit completion → cell. ⅓ / ⅔ / under 100% steps, gold leaf at 100%. */
export function cellKind(
  ratio: number,
  date: ISODate,
  today: ISODate,
  startDate?: ISODate | null,
): CellKind {
  if (date > today) return "future";
  if (startDate && date < startDate) return "pre";
  if (!(ratio > 0)) return "empty";
  if (ratio >= 1) return "full";
  if (ratio <= 1 / 3 + 1e-9) return "low";
  if (ratio <= 2 / 3 + 1e-9) return "mid";
  return "high";
}

/** Month laid out Monday-first, padded with nulls to whole weeks. */
export function monthGrid(month: ISODate): (ISODate | null)[] {
  const first = monthStart(month);
  const last = monthEnd(month);
  const lead = (weekday(first) + 6) % 7; // Monday = 0
  const cells: (ISODate | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export interface DayLite {
  date: ISODate;
  ratio: number;
  workoutDone: boolean;
  isTrainingDay: boolean;
}

export interface MonthSummary {
  /** Mean mission completion over counted days, 0–1. Null when no day has finished yet. */
  adherence: number | null;
  /** Days counted (elapsed, on/after the start date; today only once it qualifies). */
  counted: number;
  /** Counted days at or above the streak threshold. */
  qualifying: number;
  workoutsDone: number;
  workoutsPlanned: number;
}

/**
 * Month totals. Today is still in progress, so it's only counted once it already meets
 * the streak threshold — an unfinished morning never drags the percentage down.
 */
export function monthSummary(
  days: DayLite[],
  today: ISODate,
  startDate?: ISODate | null,
): MonthSummary {
  const eligible = days.filter(
    (d) => d.date <= today && (!startDate || d.date >= startDate),
  );
  const counted = eligible.filter(
    (d) => d.date < today || d.ratio >= STREAK_THRESHOLD,
  );
  const adherence = counted.length
    ? counted.reduce((a, d) => a + d.ratio, 0) / counted.length
    : null;
  return {
    adherence,
    counted: counted.length,
    qualifying: counted.filter((d) => d.ratio >= STREAK_THRESHOLD).length,
    workoutsDone: eligible.filter((d) => d.workoutDone).length,
    workoutsPlanned: eligible.filter(
      (d) => d.isTrainingDay && (d.date < today || d.workoutDone),
    ).length,
  };
}

/** Readable cell label for screen readers. */
export function cellLabel(
  date: ISODate,
  kind: CellKind,
  done: number,
  total: number,
  workout: boolean,
) {
  const base =
    kind === "future"
      ? "upcoming"
      : kind === "pre"
        ? "before your start date"
        : total
          ? `${done} of ${total} missions`
          : "no missions";
  return `${longDate(date)}: ${base}${workout ? ", workout done" : ""}`;
}
