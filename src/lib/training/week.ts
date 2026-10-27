// Small pure helpers for Train → Week. No React, no Supabase.

import { weekday, type ISODate } from "@/lib/dates";
import { PROGRAMS } from "./programs";
import type { ProgramId } from "./types";

/**
 * The days sessionsSealed() (lib/adherence) counts, built the way Today builds them, so the
 * week's "4 of 6" on Train and on Today is one number:
 * - a day with a planned template is `train`, done when a session was completed that day;
 * - anything else is `rest`; days before the programme started were never planned.
 */
export function sealedDays({
  dates,
  planKey,
  sessions,
  programStart,
}: {
  dates: ISODate[];
  /** The resolved plan key for a date ("rest" or a template key). */
  planKey: (d: ISODate) => string;
  /** @deprecated unused (kept so older callers compile until P2). */
  schedule?: Record<string, string>;
  sessions: { local_date: ISODate; status: string }[];
  /** @deprecated ignored: volleyball is no longer read (PROGRAM-ARNOLD §6). */
  volleyballDates?: ISODate[];
  programStart?: ISODate | null;
}): { date: ISODate; kind: "train" | "rest"; done: boolean }[] {
  return dates.map((d) => {
    const before = !!programStart && d < programStart;
    const kind: "train" | "rest" = !before && planKey(d) !== "rest" ? "train" : "rest";
    const done = sessions.some((s) => s.local_date === d && s.status === "done");
    return { date: d, kind, done };
  });
}

/** The program's name, the one spelling every screen shows ("Two-set split" / "Push/Pull/Legs"; DESIGN-V3 CR-2). */
export function programLabel(program: ProgramId): string {
  return PROGRAMS[program].name;
}

/** @deprecated use programLabel(program); removed in P2. */
export function splitLabel(keys: string[]): string | null {
  const fams = ["push", "pull", "legs"].filter((f) => keys.some((k) => k.startsWith(f)));
  return fams.length ? fams.join(", ") : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12–18 Oct", "28 Sep – 4 Oct" for a Monday-start week. */
export function weekRangeLabel(dates: ISODate[]): string {
  if (!dates.length) return "";
  const a = new Date(`${dates[0]}T12:00:00Z`);
  const b = new Date(`${dates[dates.length - 1]}T12:00:00Z`);
  const mon = (d: Date) => MONTHS[d.getUTCMonth()];
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${mon(b)}` : `${a.getUTCDate()} ${mon(a)} – ${b.getUTCDate()} ${mon(b)}`;
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * @deprecated removed in P2 (no volleyball UI). "Tue · Thu" for this week's volleyball, one name per day in date order and "Mon ×2" when a day
 * had more than one session (a practice and a game), never "Mon · Mon".
 */
export function volleyballDaysLabel(dates: ISODate[]): string {
  const perDay = new Map<ISODate, number>();
  for (const d of [...dates].sort()) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  return [...perDay].map(([d, n]) => `${SHORT_DAYS[weekday(d)]}${n > 1 ? ` ×${n}` : ""}`).join(" · ");
}
