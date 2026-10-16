// Display + time helpers for the Fuel screen. Pure functions only (unit-tested).

import type { Macros } from "@/lib/nutrition";
import { addDays, daysBetween, parseISODate, shortDate, toISODate, type ISODate } from "@/lib/dates";
import { formatInt, round } from "@/lib/units";

const PLURAL: Record<string, string> = {
  serving: "servings",
  piece: "pieces",
  slice: "slices",
  scoop: "scoops",
  cup: "cups",
  bowl: "bowls",
  plate: "plates",
};

/** "250 g" · "1.5 servings" · "1 cup" · "330 mL". Amounts keep up to 2 decimals. */
export function formatAmount(amount: number, unit: string): string {
  const a = Number(amount);
  if (!Number.isFinite(a)) return "—";
  const n = Number.isInteger(a) ? String(a) : String(round(a, 2));
  const u = unit.trim();
  if (u === "g" || u === "oz") return `${n} ${u}`;
  if (u.toLowerCase() === "ml") return `${n} mL`;
  return `${n} ${a === 1 ? u : (PLURAL[u] ?? u)}`;
}

/** Unit name as shown next to a stepper ("servings", "g", "mL"). */
export function unitLabel(unit: string, amount = 2): string {
  if (unit.toLowerCase() === "ml") return "mL";
  if (unit === "g" || unit === "oz") return unit;
  return amount === 1 ? unit : (PLURAL[unit] ?? unit);
}

/** Integer grams for display ("142"). */
export function g(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatInt(n);
}

/** "P 42 · C 92 · F 11" */
export function macroLine(m: Pick<Macros, "protein" | "carbs" | "fat">): string {
  return `P ${g(m.protein)} · C ${g(m.carbs)} · F ${g(m.fat)}`;
}

/**
 * Remaining vs a goal, never judgemental: "43 left", "+12 over", "Goal met".
 * Returns null when there is no goal to compare against.
 */
export function leftLabel(goal: number | null | undefined, eaten: number, unit = ""): { text: string; state: "left" | "met" | "over" } | null {
  if (!goal || goal <= 0) return null;
  const diff = goal - eaten;
  const u = unit ? ` ${unit}` : "";
  if (Math.round(diff) > 0) return { text: `${formatInt(diff)}${u} left`, state: "left" };
  if (Math.round(diff) === 0) return { text: "Goal met", state: "met" };
  return { text: `+${formatInt(-diff)}${u} over`, state: "over" };
}

/* ------------------------------------------------------------------ time */

const pad = (n: number) => String(n).padStart(2, "0");

/** "8:14 AM" in the device's timezone. */
export function formatClock(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "";
  let h = d.getHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${pad(d.getMinutes())} ${ap}`;
}

/** "08:14" for <input type="time">. */
export function timeValue(ts: string | Date): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "12:00";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** True for a valid 24h "HH:MM" string. */
export function isTime(s: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return false;
  return Number(m[1]) < 24 && Number(m[2]) < 60;
}

/** ISO timestamp for a local calendar date + "HH:MM" local time. */
export function composeEatenAt(date: ISODate, time: string): string {
  const d = parseISODate(date);
  const [h, m] = isTime(time) ? time.split(":").map(Number) : [12, 0];
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** Short day label for the switcher: "Today", "Yesterday", else "Mon, Oct 12". */
export function dayLabel(d: ISODate, today: ISODate): string {
  const diff = daysBetween(today, d);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][parseISODate(d).getDay()];
  return `${wd}, ${shortDate(d, today)}`;
}

/** Never let the viewed day run into the future. */
export function clampDay(d: ISODate | null | undefined, today: ISODate): ISODate {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return today;
  // "2026-02-31" or "2026-13-01" would roll over into another day; treat it as no date.
  if (toISODate(parseISODate(d)) !== d || d < "1900-01-01") return today;
  return d > today ? today : d;
}

/** Monday-first month grid (6 rows max) for the day picker. `null` = padding cell. */
export function monthGrid(monthStartDate: ISODate): (ISODate | null)[][] {
  const first = parseISODate(monthStartDate);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (ISODate | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let i = 0; i < daysInMonth; i++) cells.push(addDays(monthStartDate, i));
  while (cells.length % 7) cells.push(null);
  const rows: (ISODate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}
