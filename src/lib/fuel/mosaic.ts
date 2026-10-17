// Fuel → Week: the week's table as a coin mosaic (docs/DESIGN-V2.md §3.5.2). Pure.
//
// Rows are the plan's meal places (breakfast, the snacks, lunch, dinner) in time order; columns
// are Mon–Sun. Each coin's state comes from the food log's links to the plan, so "eaten" always
// means a linked food entry exists, never a guess.

import type { ISODate } from "@/lib/dates";
import type { Slot } from "@/lib/meals/types";
import { compareMealTimes, plannedTime, snackCount, type MealTimeContext } from "@/lib/now/meal-times";
import type { DaySchedule, Min } from "@/lib/prefs";
import { DUE_LOOKBACK_MIN, MISSED_AFTER_MIN } from "./timeline";

export type CoinStatus = "eaten" | "changed" | "planned" | "missed" | "next";

export interface MosaicRow {
  key: string; // "breakfast:0", "snack:1"
  slot: Slot;
  position: number;
  /** Short label for the row ("BRK", "SNK 2"). */
  short: string;
  /** Spoken label ("breakfast", "snack 2"). */
  spoken: string;
}

const MAIN_SHORT: Record<Exclude<Slot, "snack">, string> = { breakfast: "Brk", lunch: "Lun", dinner: "Din" };

export const placeKey = (slot: Slot, position: number) => `${slot}:${slot === "snack" ? position : 0}`;

/**
 * The mosaic's rows: every (slot, position) any day of the plan uses, in the day's time order
 * (his schedule, a rest day). With no plan: breakfast, lunch, dinner and the planner's snacks.
 */
export function mosaicRows(meals: readonly { slot: Slot; position: number }[], schedule: DaySchedule, snacksPerDay: number): MosaicRow[] {
  const seen = new Map<string, { slot: Slot; position: number }>();
  const src = meals.length
    ? meals
    : [
        { slot: "breakfast" as Slot, position: 0 },
        { slot: "lunch" as Slot, position: 0 },
        { slot: "dinner" as Slot, position: 0 },
        ...Array.from({ length: snackCount(snacksPerDay) }, (_, i) => ({ slot: "snack" as Slot, position: i })),
      ];
  for (const m of src) {
    const key = placeKey(m.slot, m.position);
    if (!seen.has(key)) seen.set(key, { slot: m.slot, position: m.slot === "snack" ? m.position : 0 });
  }
  const ctx: MealTimeContext = { schedule, snacksPerDay, train: null };
  const snacks = [...seen.values()].filter((p) => p.slot === "snack").length;
  return [...seen.values()]
    .map((p) => ({ ...p, at: plannedTime(p, ctx).at }))
    .sort((a, b) => compareMealTimes(a, b))
    .map((p) => {
      const n = p.position + 1;
      return {
        key: placeKey(p.slot, p.position),
        slot: p.slot,
        position: p.position,
        short: p.slot === "snack" ? (snacks > 1 ? `Snk ${n}` : "Snk") : MAIN_SHORT[p.slot],
        spoken: p.slot === "snack" ? (snacks > 1 ? `snack ${n}` : "snack") : p.slot,
      };
    });
}

export interface CoinInput {
  id: string;
  local_date: ISODate;
  at: Min;
  servings: number;
  /** Portions logged from this planned meal (any day). */
  logged: { amount: number; unit: string }[];
}

/** eaten / changed from the links; else missed when its time is 2 h gone; else planned. */
export function coinStatus(m: CoinInput, today: ISODate, now: Min): Exclude<CoinStatus, "next"> {
  if (m.logged.length) return m.logged.some((l) => l.unit !== "serving" || Math.abs(l.amount - m.servings) > 0.01) ? "changed" : "eaten";
  if (m.local_date < today) return "missed";
  if (m.local_date === today && now > m.at + MISSED_AFTER_MIN) return "missed";
  return "planned";
}

/** Today's next meal: the earliest not eaten from an hour ago on, else the earliest not eaten (the timeline's rule). */
export function nextMealId(todays: readonly { id: string; at: Min; eaten: boolean }[], now: Min): string | null {
  const open = [...todays].filter((m) => !m.eaten).sort((a, b) => a.at - b.at);
  if (!open.length) return null;
  return (open.find((m) => m.at >= now - DUE_LOOKBACK_MIN) ?? open[0]).id;
}

/** The plan's average a day over the days that have planned meals ("PLAN avg 3,290 kcal · 186 g a day"). */
export function planAverage(byDay: Record<ISODate, { kcal: number; protein: number } | undefined>): { kcal: number; protein: number; days: number } | null {
  const days = Object.values(byDay).filter((d): d is { kcal: number; protein: number } => !!d && d.kcal > 0);
  if (!days.length) return null;
  return {
    kcal: Math.round(days.reduce((a, d) => a + d.kcal, 0) / days.length),
    protein: Math.round(days.reduce((a, d) => a + d.protein, 0) / days.length),
    days: days.length,
  };
}

/** A day's planned kcal as a share of the target, as a whole percent (null without a target). */
export function planPercent(kcal: number | undefined, target: number): number | null {
  if (!target || target <= 0 || !kcal) return null;
  return Math.round((kcal / target) * 100);
}
