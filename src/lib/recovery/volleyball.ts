// Volleyball as every screen counts it. Pure (unit-tested).
//
// It can be logged two ways: a session (Training / Recovery "Log volleyball", with duration
// and intensity) or the check-in's "Volleyball this day" switch alone. Readiness already
// reads both; Training, Progress and the weekly review count from this one list so they
// never disagree.

import type { ISODate } from "@/lib/dates";

export interface VolleyballEntry {
  local_date: ISODate;
  /** A logged session (true) or a day the check-in switch flagged without one (false). */
  logged: boolean;
}

/** Every logged session, plus each day the check-in flagged with no session logged that day. */
export function volleyballEntries(
  sessions: readonly { local_date: ISODate }[],
  checkins: readonly { local_date: ISODate; volleyball?: boolean | null }[],
): VolleyballEntry[] {
  const out: VolleyballEntry[] = sessions.map((s) => ({ local_date: s.local_date, logged: true }));
  const have = new Set(sessions.map((s) => s.local_date));
  for (const c of checkins) {
    if (!c.volleyball || have.has(c.local_date)) continue;
    have.add(c.local_date);
    out.push({ local_date: c.local_date, logged: false });
  }
  return out.sort((a, b) => a.local_date.localeCompare(b.local_date));
}
