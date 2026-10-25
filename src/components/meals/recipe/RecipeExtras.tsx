import { relativeDay } from "@/lib/dates";

/** "Logged today · 1,155 kcal" / "Logged on Oct 14 · 900 kcal". */
export function loggedText(date: string, today: string, kcal: number): string {
  const rd = relativeDay(date, today);
  const when = /^(Today|Yesterday|Tomorrow)$/.test(rd) ? rd.toLowerCase() : `on ${rd}`;
  return `Logged ${when} · ${Math.round(Number.isFinite(kcal) ? kcal : 0).toLocaleString("en-US")} kcal`;
}
