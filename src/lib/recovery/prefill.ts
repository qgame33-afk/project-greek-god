// Check-in prefill and per-tap merging (DESIGN-V2 §4.5). Dawn asks three questions and
// saves each answer as it is tapped; sleep starts from the median of the last week's
// nights so a usual night is one tap to confirm. Pure.

import { addDays, type ISODate } from "@/lib/dates";
import { draftFromRow, snapSleep, type CheckinDraft, type CheckinRowLite } from "./checkin";

/** Nights a sleep prefill needs before it is offered. */
export const PREFILL_MIN_NIGHTS = 3;
/** How far back the prefill looks (the 7 nights before today). */
export const PREFILL_NIGHTS = 7;

/**
 * The median of the nights logged in [today−7, today−1], snapped to the 0.25 h stepper.
 * Null with fewer than 3 such nights. Today's own row and blank or impossible values are
 * ignored. `nights` is how many nights it used.
 */
export function sleepPrefill(rows: { local_date: ISODate; sleep_hours: number | string | null }[], today: ISODate): { hours: number | null; nights: number } {
  const from = addDays(today, -PREFILL_NIGHTS);
  const byDate = new Map<ISODate, number>();
  for (const r of rows) {
    if (r.local_date < from || r.local_date >= today || r.sleep_hours == null || r.sleep_hours === "") continue;
    const h = Number(r.sleep_hours);
    if (!Number.isFinite(h) || h <= 0 || h > 24) continue;
    byDate.set(r.local_date, h);
  }
  const xs = [...byDate.values()].sort((a, b) => a - b);
  if (xs.length < PREFILL_MIN_NIGHTS) return { hours: null, nights: xs.length };
  const mid = Math.floor(xs.length / 2);
  const median = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  return { hours: snapSleep(median), nights: xs.length };
}

/**
 * The day's check-in after one answer: the stored row with the patch applied. A field the
 * patch leaves out (undefined) is never cleared, so answering on Now keeps what was set on
 * /recovery and vice versa. An explicit null in the patch does clear that field.
 */
export function mergeCheckin(existing: CheckinRowLite | null, patch: Partial<CheckinDraft>): CheckinDraft {
  const base = draftFromRow(existing);
  const out: CheckinDraft = { ...base };
  for (const k of Object.keys(patch) as (keyof CheckinDraft)[]) {
    const v = patch[k];
    if (v === undefined) continue;
    (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** The three Dawn questions are answered: sleep, legs (soreness) and energy. */
export function dawnCheckinDone(row: Pick<CheckinRowLite, "sleep_hours" | "soreness" | "energy"> | null | undefined): boolean {
  return !!row && row.sleep_hours != null && row.sleep_hours !== "" && row.soreness != null && row.energy != null;
}
