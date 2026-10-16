// Which habits a past day is judged against. Adding a custom habit today must not turn
// every earlier day into a "miss" (SPEC §17: no punitive messaging), so a custom habit
// only counts from the local day it was created. Built-in habits are seeded for every
// account (their rows can be created long after the user started), so they always apply.
//
// For src/lib/data/daily.ts (useMissionDays): evaluate each date with
// `habitsOn(defs, date)` instead of the full list so Today, Recovery and the calendar agree.

import { localDateOf, type ISODate } from "@/lib/dates";
import { isBuiltIn } from "./habits-edit";

export function habitsOn<T extends { key: string; created_at?: string | null }>(
  defs: T[],
  date: ISODate,
): T[] {
  return defs.filter(
    (d) => isBuiltIn(d.key) || !d.created_at || localDateOf(d.created_at) <= date,
  );
}
