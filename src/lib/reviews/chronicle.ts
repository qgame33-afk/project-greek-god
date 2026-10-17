// The Chronicle (docs/DESIGN-V2.md §3.8): each month of the programme is a Book. These helpers
// turn a month's review numbers (lib/reviews/compute.ts, unchanged) into the Book's title and
// the facts its chapters quote. Every phrase states something that happened in the logs; a
// month with nothing logged says so plainly. Pure.

import { plannedWeight, type WeighIn } from "@/lib/bodyweight";
import { addMonths, monthEnd, monthName, parseISODate, type ISODate } from "@/lib/dates";
import { gildFraction, roman, trendAt, type Terrace } from "@/lib/progress/pace";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import type { ReviewStats } from "./compute";

export interface BookTitle {
  /** "BOOK I" */
  book: string;
  numeral: string;
  /** "SEPTEMBER" (with the year when the programme spans two of the same month) */
  film: string;
  /** "in which the climb began" */
  subtitle: string;
}

/** Terraces whose first crossing falls inside [from, to]. */
export function terracesReachedIn(ts: Pick<Terrace, "numeral" | "lb" | "reachedOn" | "index">[], from: ISODate, to: ISODate) {
  return ts.filter((t) => t.reachedOn && t.reachedOn >= from && t.reachedOn <= to);
}

/**
 * The subtitle, from the logs only, in this order: the month the climb began; a terrace
 * reached; records set; sessions sealed; otherwise "a quiet month". The current month is
 * "being written".
 */
export function bookSubtitle(
  s: Pick<ReviewStats, "window" | "training">,
  opts: { startDate: ISODate; current: boolean; terraces?: Pick<Terrace, "numeral" | "lb" | "reachedOn" | "index">[] },
): string {
  if (opts.current) return "being written";
  const { from, to } = s.window;
  if (opts.startDate >= from && opts.startDate <= to) return "in which the climb began";
  const reached = opts.terraces ? terracesReachedIn(opts.terraces, from, to) : [];
  if (reached.length) {
    const top = reached.reduce((a, b) => (b.index > a.index ? b : a));
    return reached.length > 1 ? `in which Terraces ${reached[0].numeral} to ${top.numeral} were reached` : `in which Terrace ${top.numeral} was reached`;
  }
  const records = s.training.prs.items.length;
  if (records > 1) return `in which ${records} records were set`;
  if (records === 1) return "in which a record was set";
  const n = s.training.sessions;
  if (n > 1) return `in which ${n} sessions were sealed`;
  if (n === 1) return "in which one session was sealed";
  return "a quiet month";
}

export function bookTitle(
  s: Pick<ReviewStats, "window" | "training" | "month">,
  opts: { startDate: ISODate; current: boolean; terraces?: Pick<Terrace, "numeral" | "lb" | "reachedOn" | "index">[]; withYear?: boolean },
): BookTitle {
  const numeral = roman(Math.max(1, s.window.monthIndex));
  return {
    book: `Book ${numeral}`,
    numeral,
    film: `${monthName(s.month).toUpperCase()}${opts.withYear ? ` ${s.month.slice(0, 4)}` : ""}`,
    subtitle: bookSubtitle(s, opts),
  };
}

/** "19 of 20 sessions" (planned training days sealed), or the plain count when none were planned. */
export function sessionsLine(t: ReviewStats["training"]): { value: string; label: string } {
  if (t.planned > 0) return { value: String(t.plannedDone), label: `sessions of ${t.planned}` };
  return { value: t.sessions ? String(t.sessions) : "—", label: t.sessions === 1 ? "session" : "sessions" };
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

const signed1 = (v: number) => {
  const r = round(v, 1);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)}`;
};

/**
 * Chapter I's three credits: the month's trend change (a change, never a rate), sessions sealed
 * of those planned, and records set. Missing data is "—", never zero.
 */
export function titleCredits(s: Pick<ReviewStats, "physical" | "training">, unit: WeightUnit): Credit[] {
  const ch = s.physical.change;
  const u = unit === "kg" ? "kilograms" : "pounds";
  const ses = sessionsLine(s.training);
  const rec = s.training.prs.items.length;
  return [
    ch == null
      ? { value: "—", label: `${unit} · trend change`, spoken: "Trend change: not enough weigh-ins" }
      : { value: signed1(toDisplayWeight(ch, unit)), label: `${unit} · trend change`, spoken: `Trend changed ${signed1(toDisplayWeight(ch, unit)).replace("−", "minus ")} ${u}` },
    { value: ses.value, label: ses.label, spoken: ses.value === "—" ? "No sessions" : `${ses.value} ${ses.label}` },
    { value: String(rec), label: rec === 1 ? "record" : "records", spoken: `${rec} ${rec === 1 ? "record" : "records"}` },
  ];
}

/**
 * Chapter III's month figure: "Trend +4.0 lb (1 → 30 Sep)", from the review's 7-day trend at the
 * month's first and last weigh-ins (lib/reviews/compute). With `earlyWater` the copy adds that the
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

/** "The Chronicle · 1 Nov" (the day the Book is sealed) or "The Chronicle · being written". */
export function chronicleStamp(month: ISODate, today: ISODate): string {
  const sealed = addMonths(month, 1);
  return sealed <= today ? `The Chronicle · ${parseISODate(sealed).getDate()} ${monthName(sealed, true)}` : "The Chronicle · being written";
}
