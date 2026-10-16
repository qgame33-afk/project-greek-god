// Check-in form state. Blank stays blank: nothing here invents a default value, and
// a cleared scale saves as null rather than a "neutral" 3.

import type { ISODate } from "@/lib/dates";

export interface CheckinDraft {
  sleep: number | null;
  quality: number | null;
  energy: number | null;
  soreness: number | null;
  fatigue: number | null;
  stress: number | null;
  pain: string;
  volleyball: boolean;
}

/** The subset of a recovery_logs row the form reads. */
export interface CheckinRowLite {
  local_date: ISODate;
  sleep_hours: number | string | null;
  sleep_quality: number | null;
  energy: number | null;
  soreness: number | null;
  fatigue: number | null;
  stress: number | null;
  pain_notes: string | null;
  volleyball: boolean;
}

export const EMPTY_DRAFT: CheckinDraft = {
  sleep: null,
  quality: null,
  energy: null,
  soreness: null,
  fatigue: null,
  stress: null,
  pain: "",
  volleyball: false,
};

export const SLEEP_STEP = 0.25;
export const SLEEP_MIN = 0;
export const SLEEP_MAX = 16;
export const PAIN_MAX = 500;

/** Snap typed sleep to the 0.25 h grid the stepper uses (7.1 → 7, 7.4 → 7.5). */
export function snapSleep(
  h: number | string | null | undefined,
): number | null {
  if (h == null || h === "") return null;
  const n = Number(h);
  if (!Number.isFinite(n)) return null;
  const s = Math.round(n / SLEEP_STEP) * SLEEP_STEP;
  return Math.min(SLEEP_MAX, Math.max(SLEEP_MIN, s));
}

/**
 * A stored sleep value exactly as logged (to 0.01 h). The column is numeric(4,2), so a
 * quarter hour round-trips; older values off the 0.25 grid (6.6) are shown and kept as-is
 * rather than silently rewritten when another field of the check-in is edited.
 */
export function storedSleep(
  h: number | string | null | undefined,
): number | null {
  if (h == null || h === "") return null;
  const n = Number(h);
  if (!Number.isFinite(n) || n < 0 || n > 24) return null;
  return Math.round(n * 100) / 100;
}

const scale = (v: number | null | undefined) =>
  v != null && v >= 1 && v <= 5 ? Math.round(v) : null;

export function draftFromRow(
  row: CheckinRowLite | null | undefined,
): CheckinDraft {
  if (!row) return { ...EMPTY_DRAFT };
  return {
    sleep: storedSleep(row.sleep_hours),
    quality: scale(row.sleep_quality),
    energy: scale(row.energy),
    soreness: scale(row.soreness),
    fatigue: scale(row.fatigue),
    stress: scale(row.stress),
    pain: row.pain_notes ?? "",
    volleyball: !!row.volleyball,
  };
}

export function draftToPayload(date: ISODate, d: CheckinDraft) {
  const pain = d.pain.trim().slice(0, PAIN_MAX);
  return {
    local_date: date,
    sleep_hours: storedSleep(d.sleep),
    sleep_quality: scale(d.quality),
    energy: scale(d.energy),
    soreness: scale(d.soreness),
    fatigue: scale(d.fatigue),
    stress: scale(d.stress),
    pain_notes: pain ? pain : null,
    volleyball: d.volleyball,
  };
}

/** A saved row as an upsert payload (used to restore it exactly on Undo). */
export function rowToUpsert<
  T extends CheckinRowLite & { notes?: string | null },
>(row: T) {
  return {
    local_date: row.local_date,
    sleep_hours: row.sleep_hours == null ? null : Number(row.sleep_hours),
    sleep_quality: row.sleep_quality,
    energy: row.energy,
    soreness: row.soreness,
    fatigue: row.fatigue,
    stress: row.stress,
    pain_notes: row.pain_notes,
    volleyball: row.volleyball,
    notes: row.notes ?? null,
  };
}

/** True when nothing has been entered (a brand-new check-in can't be saved like this). */
export function isDraftEmpty(d: CheckinDraft) {
  return (
    d.sleep == null &&
    d.quality == null &&
    d.energy == null &&
    d.soreness == null &&
    d.fatigue == null &&
    d.stress == null &&
    !d.pain.trim() &&
    !d.volleyball
  );
}

export function draftsEqual(a: CheckinDraft, b: CheckinDraft) {
  return (
    a.sleep === b.sleep &&
    a.quality === b.quality &&
    a.energy === b.energy &&
    a.soreness === b.soreness &&
    a.fatigue === b.fatigue &&
    a.stress === b.stress &&
    a.pain.trim() === b.pain.trim() &&
    a.volleyball === b.volleyball
  );
}

/** Number of the eight check-in fields that hold a value (volleyball counts when on). */
export function filledCount(d: CheckinDraft) {
  return (
    [d.sleep, d.quality, d.energy, d.soreness, d.fatigue, d.stress].filter(
      (v) => v != null,
    ).length +
    (d.pain.trim() ? 1 : 0) +
    (d.volleyball ? 1 : 0)
  );
}

/** 7.25 → "7 h 15 min", 8 → "8 h", 0.5 → "30 min" */
export function formatSleep(h: number | null | undefined) {
  if (h == null || !Number.isFinite(h)) return "—";
  const mins = Math.round(h * 60);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  if (!hh) return `${mm} min`;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}

/** 7.25 → "7.25", 8 → "8", 7.5 → "7.5" (quarter-hour precision, no trailing zeros). */
export function formatHours(h: number | null | undefined) {
  if (h == null || !Number.isFinite(h)) return "—";
  return String(Math.round(h * 100) / 100);
}

/** Parse typed sleep ("7.5", "7,25", "7:30", "7h30") into hours on the 0.25 grid. */
export function parseSleepInput(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  const hm = s.match(/^(\d{1,2})\s*(?:h|:)\s*(\d{1,2})?\s*(?:m|min)?$/);
  if (hm) {
    const h = Number(hm[1]);
    const m = hm[2] ? Number(hm[2]) : 0;
    if (m >= 60) return null;
    return snapSleep(h + m / 60);
  }
  if (!/^\d{1,2}(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n > SLEEP_MAX) return null;
  return snapSleep(n);
}

/* ---------------------------------------------------------- draft storage */

const DRAFT_PREFIX = "pgg.checkin.draft.";

export function loadStoredDraft(date: ISODate): CheckinDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + date);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<CheckinDraft>;
    return {
      sleep: storedSleep(v.sleep ?? null),
      quality: scale(v.quality ?? null),
      energy: scale(v.energy ?? null),
      soreness: scale(v.soreness ?? null),
      fatigue: scale(v.fatigue ?? null),
      stress: scale(v.stress ?? null),
      pain: typeof v.pain === "string" ? v.pain.slice(0, PAIN_MAX) : "",
      volleyball: !!v.volleyball,
    };
  } catch {
    return null;
  }
}

export function storeDraft(date: ISODate, d: CheckinDraft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_PREFIX + date, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_PREFIX + date);
  } catch {
    /* storage unavailable (private mode) — the in-memory draft still holds the input */
  }
}
