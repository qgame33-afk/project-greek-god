// The Chronicle (docs/DESIGN-V2.md §3.8): each month of the programme is a Book. These helpers
// turn a month's review numbers (lib/reviews/compute.ts, unchanged) into the Book's title and
// the facts its chapters quote. Every phrase states something that happened in the logs; a
// month with nothing logged says so plainly. Pure.

import { monthName, type ISODate } from "@/lib/dates";
import { roman, type Terrace } from "@/lib/progress/pace";
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
export function bookSubtitle(s: Pick<ReviewStats, "window" | "training">, opts: { startDate: ISODate; current: boolean; terraces?: Pick<Terrace, "numeral" | "lb" | "reachedOn" | "index">[] }): string {
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

export function bookTitle(s: Pick<ReviewStats, "window" | "training" | "month">, opts: { startDate: ISODate; current: boolean; terraces?: Pick<Terrace, "numeral" | "lb" | "reachedOn" | "index">[]; withYear?: boolean }): BookTitle {
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
