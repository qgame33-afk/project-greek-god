// Small pure helpers for Train → Week. No React, no Supabase.

import type { ISODate } from "@/lib/dates";
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


const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12–18 Oct", "28 Sep – 4 Oct" for a Monday-start week. */
export function weekRangeLabel(dates: ISODate[]): string {
  if (!dates.length) return "";
  const a = new Date(`${dates[0]}T12:00:00Z`);
  const b = new Date(`${dates[dates.length - 1]}T12:00:00Z`);
  const mon = (d: Date) => MONTHS[d.getUTCMonth()];
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${mon(b)}` : `${a.getUTCDate()} ${mon(a)} – ${b.getUTCDate()} ${mon(b)}`;
}


