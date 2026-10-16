// Split a day's entries into the four meals, keeping AI/saved meal groups together.

import { MEALS, sumMacros, type Macros, type Meal } from "@/lib/nutrition";

export interface EntryLike {
  id: string;
  meal: string;
  eaten_at: string;
  meal_group_id: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export type MealItem<T> = { kind: "entry"; entry: T } | { kind: "group"; id: string; entries: T[]; totals: Macros };

export interface MealSection<T> {
  meal: Meal;
  label: string;
  entries: T[];
  totals: Macros;
  items: MealItem<T>[];
}

const MEAL_KEYS = new Set<string>(MEALS.map((m) => m.key));

export function asMeal(m: string | null | undefined): Meal {
  return m && MEAL_KEYS.has(m) ? (m as Meal) : "snacks";
}

/** Entries in a meal, with rows sharing a meal_group_id (2+) folded into one group at the first row's position. */
export function mealItems<T extends EntryLike>(entries: T[]): MealItem<T>[] {
  const counts = new Map<string, number>();
  for (const e of entries) if (e.meal_group_id) counts.set(e.meal_group_id, (counts.get(e.meal_group_id) ?? 0) + 1);
  const out: MealItem<T>[] = [];
  const groups = new Map<string, { kind: "group"; id: string; entries: T[]; totals: Macros }>();
  for (const e of entries) {
    const gid = e.meal_group_id;
    if (gid && (counts.get(gid) ?? 0) > 1) {
      let grp = groups.get(gid);
      if (!grp) {
        grp = { kind: "group", id: gid, entries: [], totals: sumMacros([]) };
        groups.set(gid, grp);
        out.push(grp);
      }
      grp.entries.push(e);
    } else {
      out.push({ kind: "entry", entry: e });
    }
  }
  for (const grp of groups.values()) grp.totals = sumMacros(grp.entries);
  return out;
}

export function mealSections<T extends EntryLike>(entries: T[]): MealSection<T>[] {
  const sorted = [...entries].sort((a, b) => a.eaten_at.localeCompare(b.eaten_at));
  return MEALS.map(({ key, label }) => {
    const list = sorted.filter((e) => asMeal(e.meal) === key);
    return { meal: key, label, entries: list, totals: sumMacros(list), items: mealItems(list) };
  });
}

/** All rows of a group (or just the row) for grouped delete. */
export function groupMates<T extends EntryLike>(entries: T[], e: T): T[] {
  if (!e.meal_group_id) return [e];
  return entries.filter((x) => x.meal_group_id === e.meal_group_id);
}
