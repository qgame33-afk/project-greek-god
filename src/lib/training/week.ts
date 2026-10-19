// Small pure helpers for Train → Week (DESIGN-V2 §3.4.1). No React, no Supabase.

import { weekday, type ISODate } from "@/lib/dates";

/**
 * The days sessionsSealed() (lib/adherence) counts, built the way Now builds them, so "4/6
 * raised" on Train and "Train 4/6" on Now are one number:
 * - a day with a planned template is `train`, done when a session was completed that day;
 * - a day the weekly schedule trains on but whose plan is rest, with volleyball played, is a
 *   `volleyball` swap (done = played);
 * - anything else is `rest`; days before the programme started were never planned.
 */
export function sealedDays({
  dates,
  planKey,
  schedule,
  sessions,
  volleyballDates,
  programStart,
}: {
  dates: ISODate[];
  /** The resolved plan key for a date ("rest" or a template key). */
  planKey: (d: ISODate) => string;
  schedule: Record<string, string>;
  sessions: { local_date: ISODate; status: string }[];
  volleyballDates: ISODate[];
  programStart?: ISODate | null;
}): { date: ISODate; kind: "train" | "rest" | "volleyball"; done: boolean }[] {
  const played = new Set(volleyballDates);
  return dates.map((d) => {
    const scheduled = schedule[String(weekday(d))] ?? "rest";
    const before = !!programStart && d < programStart;
    const key = planKey(d);
    const kind: "train" | "rest" | "volleyball" = before ? "rest" : key !== "rest" ? "train" : played.has(d) && scheduled !== "rest" ? "volleyball" : "rest";
    const done = kind === "volleyball" ? played.has(d) : sessions.some((s) => s.local_date === d && s.status === "done");
    return { date: d, kind, done };
  });
}

/** "push, pull, legs" from the template keys planned in a week (families in that order), or null. */
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
 * "Tue · Thu" for this week's volleyball, one name per day in date order and "Mon ×2" when a day
 * had more than one session (a practice and a game), never "Mon · Mon".
 */
export function volleyballDaysLabel(dates: ISODate[]): string {
  const perDay = new Map<ISODate, number>();
  for (const d of [...dates].sort()) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  return [...perDay].map(([d, n]) => `${SHORT_DAYS[weekday(d)]}${n > 1 ? ` ×${n}` : ""}`).join(" · ");
}
