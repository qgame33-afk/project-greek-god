// Calendar-day helpers. The app stores explicit local dates ("YYYY-MM-DD") written in the
// user's own timezone, so all day arithmetic happens on those strings at local noon to
// stay clear of DST edges.

export type ISODate = string; // YYYY-MM-DD

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's calendar date in the device's timezone. */
export function today(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function parseISODate(d: ISODate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day, 12, 0, 0, 0);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseISODate(d);
  x.setDate(x.getDate() + n);
  return toISODate(x);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(d: ISODate): number {
  return parseISODate(d).getDay();
}

/** Monday of the week containing d. */
export function weekStart(d: ISODate): ISODate {
  const wd = weekday(d);
  return addDays(d, wd === 0 ? -6 : 1 - wd);
}

export function weekDates(d: ISODate): ISODate[] {
  const s = weekStart(d);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export function monthStart(d: ISODate): ISODate {
  return d.slice(0, 8) + "01";
}

export function monthEnd(d: ISODate): ISODate {
  const x = parseISODate(monthStart(d));
  x.setMonth(x.getMonth() + 1);
  x.setDate(0);
  return toISODate(x);
}

export function addMonths(d: ISODate, n: number): ISODate {
  const x = parseISODate(monthStart(d));
  x.setMonth(x.getMonth() + n);
  return toISODate(x);
}

export function monthDates(d: ISODate): ISODate[] {
  const s = monthStart(d);
  const n = daysBetween(s, monthEnd(d)) + 1;
  return Array.from({ length: n }, (_, i) => addDays(s, i));
}

/** Inclusive range of dates from a to b. */
export function dateRange(a: ISODate, b: ISODate): ISODate[] {
  const n = daysBetween(a, b);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDays(a, i));
}

/** The local calendar date of a timestamp (for timestamptz values from the database). */
export function localDateOf(ts: string | Date): ISODate {
  return toISODate(typeof ts === "string" ? new Date(ts) : ts);
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function dayName(d: ISODate, short = false) {
  const n = DAY_NAMES[weekday(d)];
  return short ? n.slice(0, 3) : n;
}

export function monthName(d: ISODate, short = false) {
  const n = MONTHS[parseISODate(d).getMonth()];
  return short ? n.slice(0, 3) : n;
}

/** "Thursday 16 October" */
export function longDate(d: ISODate) {
  const x = parseISODate(d);
  return `${dayName(d)} ${x.getDate()} ${MONTHS[x.getMonth()]}`;
}

/** "16 Oct", or "16 Oct 2025" when the year differs from the reference */
export function shortDate(d: ISODate, ref: ISODate = today()) {
  const x = parseISODate(d);
  // day before month, as every screen writes dates ("Tue 27 Oct", "12–18 Oct")
  const base = `${x.getDate()} ${MONTHS[x.getMonth()].slice(0, 3)}`;
  return d.slice(0, 4) === ref.slice(0, 4) ? base : `${base} ${x.getFullYear()}`;
}

/** "October 2026" */
export function monthLabel(d: ISODate) {
  return `${monthName(d)} ${d.slice(0, 4)}`;
}

/** "Today", "Yesterday", "Tomorrow", else a short date. */
export function relativeDay(d: ISODate, ref: ISODate = today()) {
  const diff = daysBetween(ref, d);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return shortDate(d, ref);
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** "1:05:09" / "4:09" */
export function formatDuration(totalSec: number) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "1 h 5 min" / "42 min" */
export function formatMinutes(totalMin: number) {
  const m = Math.round(totalMin);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
}
