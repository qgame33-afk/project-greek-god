// "This week" overview, computed only from logged rows. Missing data stays null so the UI
// can show "—" with guidance — nothing here ever fills a gap with a plausible number.

import { streak as streakOf } from "@/lib/habits";
import type { ISODate } from "@/lib/dates";

export interface WeekDayPlan {
  date: ISODate;
  kind: "train" | "rest";
  /** Template name for training days ("Push A"), "Rest" otherwise. */
  label: string;
}

export interface WeekInput {
  days: WeekDayPlan[]; // Monday → Sunday
  today: ISODate;
  /** Finished sessions (status = done) — any range; filtered to the week here. */
  doneSessions: { id: string; local_date: ISODate }[];
  /** Per-day nutrition totals (daily_nutrition view rows). */
  food: { local_date: ISODate | null; calories: number | null; protein_g: number | null; entries: number | null }[];
  /** Recovery check-ins. */
  sleep: { local_date: ISODate; sleep_hours: number | null }[];
  prEvents: { session_id: string | null; exercise_slug: string | null; local_date: ISODate | null }[];
  /** Programme start (profile.start_date). Training days before it are never "due" or missed. */
  startDate?: ISODate;
}

export interface ColonnadeDay {
  date: ISODate;
  kind: "train" | "rest";
  label: string;
  done: boolean;
  today: boolean;
  missed: boolean;
}

export interface WeekOverview {
  colonnade: ColonnadeDay[];
  /** Training days planned this week. */
  scheduled: number;
  /** Sessions finished this week, up to today. */
  done: number;
  /** Training days due so far (before today, plus today once it's done). */
  due: number;
  /** min(done, due) / due, 0–100. Null when nothing is due yet. */
  adherencePct: number | null;
  avgCalories: number | null;
  avgProtein: number | null;
  /** Completed days (before today) with at least one food entry. */
  nutritionDays: number;
  avgSleep: number | null;
  sleepDays: number;
  /** Distinct (session, exercise) records set this week. */
  prs: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function weeklyOverview(w: WeekInput): WeekOverview {
  const dates = new Set(w.days.map((d) => d.date));
  const inWeekToDate = (d: ISODate | null | undefined): d is ISODate => !!d && dates.has(d) && d <= w.today;

  const doneBy = new Map<ISODate, number>();
  for (const s of w.doneSessions) if (inWeekToDate(s.local_date)) doneBy.set(s.local_date, (doneBy.get(s.local_date) ?? 0) + 1);
  const done = [...doneBy.values()].reduce((a, b) => a + b, 0);
  const started = (d: ISODate) => !w.startDate || d >= w.startDate;

  const colonnade: ColonnadeDay[] = w.days.map((d) => ({
    date: d.date,
    kind: d.kind,
    label: d.label,
    done: (doneBy.get(d.date) ?? 0) > 0,
    today: d.date === w.today,
    missed: d.kind === "train" && started(d.date) && d.date < w.today && !doneBy.has(d.date),
  }));

  const scheduled = w.days.filter((d) => d.kind === "train" && started(d.date)).length;
  const trainBefore = w.days.filter((d) => d.kind === "train" && started(d.date) && d.date < w.today).length;
  const todayIsTrain = w.days.some((d) => d.kind === "train" && d.date === w.today);
  const due = trainBefore + (todayIsTrain && doneBy.has(w.today) ? 1 : 0);
  const adherencePct = due > 0 ? Math.round((Math.min(done, due) / due) * 100) : null;

  const foodDays = w.food.filter((f) => f.local_date && dates.has(f.local_date) && f.local_date < w.today && (f.entries ?? 0) > 0);
  const avgCalories = foodDays.length ? Math.round(foodDays.reduce((a, f) => a + Number(f.calories ?? 0), 0) / foodDays.length) : null;
  const avgProtein = foodDays.length ? Math.round(foodDays.reduce((a, f) => a + Number(f.protein_g ?? 0), 0) / foodDays.length) : null;

  const sleepRows = w.sleep.filter((s) => inWeekToDate(s.local_date) && s.sleep_hours != null);
  const avgSleep = sleepRows.length ? r1(sleepRows.reduce((a, s) => a + Number(s.sleep_hours), 0) / sleepRows.length) : null;

  const prKeys = new Set(w.prEvents.filter((e) => inWeekToDate(e.local_date)).map((e) => `${e.session_id}|${e.exercise_slug}`));

  return {
    colonnade,
    scheduled,
    done,
    due,
    adherencePct,
    avgCalories,
    avgProtein,
    nutritionDays: foodDays.length,
    avgSleep,
    sleepDays: sleepRows.length,
    prs: prKeys.size,
  };
}

/** Consistency streak from mission ratios (shared STREAK_THRESHOLD rule in lib/habits). */
export function consistencyStreak(days: { date: ISODate; ratio: number }[], today: ISODate): number {
  return streakOf(Object.fromEntries(days.map((d) => [d.date, d.ratio])), today);
}
