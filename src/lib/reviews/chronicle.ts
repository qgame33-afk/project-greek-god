// The monthly recap (docs/DESIGN-V3-SIMPLE.md §4.5.5–§4.5.6; the old Chronicle's helpers keep
// their names). These turn a month's review numbers (lib/reviews/compute.ts, unchanged) into the
// recap's title, its one-line summary and the facts it quotes. Every phrase states something that
// happened in the logs; a month with nothing logged says so plainly. Pure.

import { plannedWeight, type WeighIn } from "@/lib/bodyweight";
import { addMonths, dayName, monthEnd, monthName, parseISODate, type ISODate } from "@/lib/dates";
import { gildFraction, roman, trendAt, type Terrace } from "@/lib/progress/pace";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import type { ReviewStats } from "./compute";

export interface BookTitle {
  /** "September recap" */
  book: string;
  /** The month's place in the programme (data; never shown as a roman numeral). */
  numeral: string;
  /** "September" (with the year when the programme spans two of the same month) */
  film: string;
  /** "The month you started", "So far", "Reached 165 lb" */
  subtitle: string;
}

/** Milestones whose first crossing falls inside [from, to]. */
export function terracesReachedIn(ts: Pick<Terrace, "numeral" | "lb" | "reachedOn" | "index">[], from: ISODate, to: ISODate) {
  return ts.filter((t) => t.reachedOn && t.reachedOn >= from && t.reachedOn <= to);
}

/**
 * The one-line summary, from the logs only, in this order: the month he started; a milestone
 * reached; new bests; workouts done; otherwise "A quiet month". The current month is "So far".
 */
export function bookSubtitle(
  s: Pick<ReviewStats, "window" | "training">,
  opts: { startDate: ISODate; current: boolean; terraces?: Pick<Terrace, "numeral" | "lb" | "reachedOn" | "index">[] },
): string {
  if (opts.current) return "So far";
  const { from, to } = s.window;
  if (opts.startDate >= from && opts.startDate <= to) return "The month you started";
  const reached = opts.terraces ? terracesReachedIn(opts.terraces, from, to) : [];
  if (reached.length) {
    const first = reached.reduce((a, b) => (b.index < a.index ? b : a));
    const top = reached.reduce((a, b) => (b.index > a.index ? b : a));
    return reached.length > 1 ? `Reached ${lbTxt(first.lb)} to ${lbTxt(top.lb)} lb` : `Reached ${lbTxt(top.lb)} lb`;
  }
  const records = s.training.prs.items.length;
  if (records > 1) return `${records} new bests`;
  if (records === 1) return "A new best";
  const n = s.training.sessions;
  if (n > 1) return `${n} workouts done`;
  if (n === 1) return "One workout done";
  return "A quiet month";
}

export function bookTitle(
  s: Pick<ReviewStats, "window" | "training" | "month">,
  opts: { startDate: ISODate; current: boolean; terraces?: Pick<Terrace, "numeral" | "lb" | "reachedOn" | "index">[]; withYear?: boolean },
): BookTitle {
  const numeral = roman(Math.max(1, s.window.monthIndex));
  return {
    book: `${monthName(s.month)} recap`,
    numeral,
    film: `${monthName(s.month)}${opts.withYear ? ` ${s.month.slice(0, 4)}` : ""}`,
    subtitle: bookSubtitle(s, opts),
  };
}

/** "24 of 26 workouts" (planned training days done), or the plain count when none were planned. */
export function sessionsLine(t: ReviewStats["training"]): { value: string; label: string } {
  if (t.planned > 0) return { value: String(t.plannedDone), label: `workouts of ${t.planned}` };
  return { value: t.sessions ? String(t.sessions) : "—", label: t.sessions === 1 ? "workout" : "workouts" };
}

/** True when the month overlaps the programme's first 14 days (water and glycogen). */
export const includesEarlyWater = (s: Pick<ReviewStats, "physical">) => !!s.physical.earlyWater;

/* ---------------------------------------------------------------- chapters */

export interface Credit {
  value: string;
  label: string;
  /** One VoiceOver phrase for the credit. */
  spoken: string;
}

const lbTxt = (lb: number) => (Number.isInteger(lb) ? String(lb) : String(round(lb, 1)));

const signed1 = (v: number) => {
  const r = round(v, 1);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)}`;
};

/**
 * The month's three numbers: the change in the 7-day average (a change, never a rate), workouts
 * done of those planned, and new bests. Missing data is "—", never zero.
 */
export function titleCredits(s: Pick<ReviewStats, "physical" | "training">, unit: WeightUnit): Credit[] {
  const ch = s.physical.change;
  const u = unit === "kg" ? "kilograms" : "pounds";
  const ses = sessionsLine(s.training);
  const rec = s.training.prs.items.length;
  return [
    ch == null
      ? { value: "—", label: `${unit} · weight change`, spoken: "Weight change: not enough weigh-ins" }
      : { value: signed1(toDisplayWeight(ch, unit)), label: `${unit} · weight change`, spoken: `7-day average changed ${signed1(toDisplayWeight(ch, unit)).replace("−", "minus ")} ${u}` },
    { value: ses.value, label: ses.label, spoken: ses.value === "—" ? "No workouts" : `${ses.value} ${ses.label}` },
    { value: String(rec), label: rec === 1 ? "new best" : "new bests", spoken: `${rec} ${rec === 1 ? "new best" : "new bests"}` },
  ];
}

/**
 * Chapter III's month figure: "Trend +4.0 lb (1 → 30 Sep)", from the review's averages of the
 * month's first and last 7 days of weigh-ins (lib/reviews/compute). With `earlyWater` the copy adds that the
 * month includes the programme's first 14 days.
 */
export function monthChange(s: Pick<ReviewStats, "physical">, unit: WeightUnit): { value: string | null; range: string | null; earlyWater: boolean } {
  const p = s.physical;
  const range =
    p.monthStartDate && p.monthEndDate
      ? `${parseISODate(p.monthStartDate).getDate()}${p.monthStartDate.slice(0, 7) === p.monthEndDate.slice(0, 7) ? "" : ` ${monthName(p.monthStartDate, true)}`} → ${parseISODate(p.monthEndDate).getDate()} ${monthName(p.monthEndDate, true)}`
      : null;
  return { value: p.change == null ? null : `${signed1(toDisplayWeight(p.change, unit))} ${unit}`, range, earlyWater: !!p.earlyWater };
}

/** The statue as it stood at the month's last day: gildFraction of the trend then (§4.1.4). */
export function bookGild(weighIns: WeighIn[], end: ISODate, startLb: number, goalLb: number): number {
  const upTo = weighIns.filter((w) => w.local_date <= end);
  return gildFraction(trendAt(upTo, end).lb, startLb, goalLb, upTo.length);
}

/** Next month's PLAN line: the straight-line plan weight at its last day (not a prediction). */
export function nextMonthPlan(
  month: ISODate,
  profile: { start_date: ISODate; target_date: ISODate; start_weight_lb: number | string | null; goal_weight_lb: number | string | null },
): { month: ISODate; end: ISODate; lb: number } | null {
  const s = Number(profile.start_weight_lb);
  const g = Number(profile.goal_weight_lb);
  if (!Number.isFinite(s) || !Number.isFinite(g) || profile.start_weight_lb == null || profile.goal_weight_lb == null) return null;
  const next = addMonths(month, 1);
  if (next > profile.target_date) return null;
  const end = monthEnd(next);
  return { month: next, end, lb: round(plannedWeight(end < profile.target_date ? end : profile.target_date, profile.start_date, profile.target_date, s, g), 1) };
}

/** "Ready Sun 1 Nov": the day a month's recap is ready (the 1st of the next month). */
export function chronicleStamp(month: ISODate, _today?: ISODate): string {
  const ready = addMonths(month, 1);
  return `Ready ${dayName(ready, true)} ${parseISODate(ready).getDate()} ${monthName(ready, true)}`;
}
