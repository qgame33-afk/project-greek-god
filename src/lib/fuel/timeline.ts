// Fuel → Today: the plan and the diary as one timeline (docs/DESIGN-V2.md §3.5.1). Pure.
//
// Every planned meal of the day is placed at his time with plannedTime() (§4.4) and every food
// entry sits at its eaten_at. A planned meal and the entry logged from it (planned_meal_id) are
// ONE eaten row, so nothing is counted twice. Rows sharing a meal_group_id (a scan, a Food Coach
// meal, a saved meal) fold into one group row. On today a NOW line sits between the past and the
// rest, and exactly one planned row is "due" (it carries the screen's gold Eaten).

import type { ISODate } from "@/lib/dates";
import { compareMealTimes, plannedTime, type MealRole, type MealTimeContext } from "@/lib/now/meal-times";
import type { Min } from "@/lib/prefs";
import type { Slot } from "@/lib/meals/types";

/** A planned meal past its time by more than this is "not logged" (stone), never red. */
export const MISSED_AFTER_MIN = 120;
/** The due meal is the earliest uneaten one from an hour ago on (the Day Engine's rule). */
export const DUE_LOOKBACK_MIN = 60;

export interface TimelinePlanned {
  id: string;
  slot: Slot;
  position: number;
  /** Planned servings (a linked entry with a different amount is "changed"). */
  servings: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface TimelineEntry {
  id: string;
  eaten_at: string;
  meal_group_id: string | null;
  planned_meal_id: string | null;
  amount: number | string;
  unit: string;
  calories: number | string;
  protein_g: number | string;
  carbs_g: number | string;
  fat_g: number | string;
}

export interface MacroTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type PlannedState = "upcoming" | "missed";

export type TimelineRow<E extends TimelineEntry, P extends TimelinePlanned> =
  /** A logged entry. `planned` is the planned meal it was logged from (merged into this row). */
  | { kind: "eaten"; key: string; at: Min; entry: E; planned: P | null; changed: boolean }
  /** 2+ entries sharing a meal_group_id, at the first one's time. */
  | { kind: "group"; key: string; at: Min; entries: E[]; totals: MacroTotals }
  /** A planned meal with nothing logged from it yet. */
  | { kind: "planned"; key: string; at: Min; role: MealRole; planned: P; state: PlannedState; due: boolean }
  /** A planned meal of this day that was logged on another day: no Eaten, not counted here. */
  | { kind: "elsewhere"; key: string; at: Min; role: MealRole; planned: P; loggedOn: ISODate }
  /** Today's session at its time. */
  | { kind: "session"; key: string; at: Min; name: string; durationMin: number | null; done: boolean }
  /** The NOW hairline (today only). */
  | { kind: "now"; key: string; at: Min };

export interface TimelineInput<E extends TimelineEntry, P extends TimelinePlanned> {
  date: ISODate;
  today: ISODate;
  /** Minutes since midnight now (only used when date === today). */
  now: Min;
  planned: P[];
  entries: E[];
  times: MealTimeContext;
  /** Minutes since midnight of a timestamp on `date` (device timezone in the app). */
  minuteOf: (iso: string) => Min;
  /** planned meal id → dates it was logged on (any day; the week's link map). */
  loggedOn?: Record<string, ISODate[]>;
  session?: { name: string; at: Min; durationMin: number | null; done: boolean } | null;
}

export interface Timeline<E extends TimelineEntry, P extends TimelinePlanned> {
  rows: TimelineRow<E, P>[];
  /** Logged on this day (every entry, once). */
  eaten: MacroTotals;
  /** Planned meals still ahead (uneaten and not missed): the hatched part of the meters. */
  remaining: MacroTotals;
  remainingCount: number;
  /** Uneaten planned meals whose time passed (today) or any uneaten one (a past day). */
  missedCount: number;
  /** The planned row that carries the gold Eaten (today only). */
  dueId: string | null;
  plannedCount: number;
}

const num = (v: number | string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const ZERO_TOTALS: MacroTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function entryTotals(rows: readonly Pick<TimelineEntry, "calories" | "protein_g" | "carbs_g" | "fat_g">[]): MacroTotals {
  return rows.reduce((a, e) => ({ kcal: a.kcal + num(e.calories), protein: a.protein + num(e.protein_g), carbs: a.carbs + num(e.carbs_g), fat: a.fat + num(e.fat_g) }), ZERO_TOTALS);
}

export function plannedTotals(rows: readonly Pick<TimelinePlanned, "kcal" | "protein" | "carbs" | "fat">[]): MacroTotals {
  return rows.reduce((a, p) => ({ kcal: a.kcal + num(p.kcal), protein: a.protein + num(p.protein), carbs: a.carbs + num(p.carbs), fat: a.fat + num(p.fat) }), ZERO_TOTALS);
}

/** A linked entry whose amount differs from the planned servings (more than rounding). */
export function portionChanged(entry: Pick<TimelineEntry, "amount" | "unit">, planned: Pick<TimelinePlanned, "servings">): boolean {
  if (entry.unit !== "serving") return true;
  return Math.abs(num(entry.amount) - num(planned.servings)) > 0.01;
}

// same-minute order: what was eaten, then a group, the session, then what is still planned
const KIND_RANK: Record<TimelineRow<TimelineEntry, TimelinePlanned>["kind"], number> = { eaten: 0, group: 0, elsewhere: 1, session: 2, planned: 3, now: 4 };

export function buildTimeline<E extends TimelineEntry, P extends TimelinePlanned>(i: TimelineInput<E, P>): Timeline<E, P> {
  const isToday = i.date === i.today;
  const isPast = i.date < i.today;
  const rows: TimelineRow<E, P>[] = [];

  // planned meals at his times
  const placed = i.planned
    .map((p) => ({ p, ...plannedTime({ slot: p.slot, position: p.position }, i.times) }))
    .sort((a, b) => compareMealTimes({ at: a.at, slot: a.p.slot, position: a.p.position }, { at: b.at, slot: b.p.slot, position: b.p.position }));
  const plannedById = new Map(placed.map((x) => [x.p.id, x]));

  // entries: link each planned meal to the FIRST entry logged from it this day
  const sortedEntries = [...i.entries].sort((a, b) => a.eaten_at.localeCompare(b.eaten_at) || a.id.localeCompare(b.id));
  const linked = new Map<string, E>();
  for (const e of sortedEntries) if (e.planned_meal_id && plannedById.has(e.planned_meal_id) && !linked.has(e.planned_meal_id)) linked.set(e.planned_meal_id, e);

  const groupCounts = new Map<string, number>();
  for (const e of sortedEntries) if (e.meal_group_id) groupCounts.set(e.meal_group_id, (groupCounts.get(e.meal_group_id) ?? 0) + 1);
  const groups = new Map<string, E[]>();
  for (const e of sortedEntries) {
    const gid = e.meal_group_id;
    if (gid && (groupCounts.get(gid) ?? 0) > 1) {
      const list = groups.get(gid);
      if (list) list.push(e);
      else groups.set(gid, [e]);
      continue;
    }
    const pm = e.planned_meal_id ? plannedById.get(e.planned_meal_id) : undefined;
    const merged = pm && linked.get(pm.p.id) === e ? pm.p : null;
    rows.push({ kind: "eaten", key: `e:${e.id}`, at: i.minuteOf(e.eaten_at), entry: e, planned: merged, changed: merged ? portionChanged(e, merged) : false });
  }
  for (const [gid, list] of groups) rows.push({ kind: "group", key: `g:${gid}`, at: i.minuteOf(list[0].eaten_at), entries: list, totals: entryTotals(list) });

  // planned meals with nothing logged from them on this day
  const open: { p: P; at: Min; role: MealRole; missed: boolean }[] = [];
  for (const { p, at, role } of placed) {
    if (linked.has(p.id)) continue;
    const elsewhere = (i.loggedOn?.[p.id] ?? []).filter((d) => d !== i.date).sort()[0];
    if (elsewhere) {
      rows.push({ kind: "elsewhere", key: `x:${p.id}`, at, role, planned: p, loggedOn: elsewhere });
      continue;
    }
    const missed = isPast || (isToday && i.now > at + MISSED_AFTER_MIN);
    open.push({ p, at, role, missed });
  }

  // the due meal: earliest uneaten from an hour ago on, else the earliest uneaten (today only)
  let dueId: string | null = null;
  if (isToday && open.length) dueId = (open.find((o) => o.at >= i.now - DUE_LOOKBACK_MIN) ?? open[0]).p.id;
  for (const o of open) rows.push({ kind: "planned", key: `p:${o.p.id}`, at: o.at, role: o.role, planned: o.p, state: o.missed ? "missed" : "upcoming", due: o.p.id === dueId });

  if (i.session) rows.push({ kind: "session", key: "session", at: i.session.at, name: i.session.name, durationMin: i.session.durationMin, done: i.session.done });

  rows.sort((a, b) => a.at - b.at || KIND_RANK[a.kind] - KIND_RANK[b.kind]);

  // NOW goes after everything at or before this minute
  if (isToday) {
    const idx = rows.findIndex((r) => r.at > i.now);
    rows.splice(idx === -1 ? rows.length : idx, 0, { kind: "now", key: "now", at: i.now });
  }

  const ahead = open.filter((o) => !o.missed).map((o) => o.p);
  return {
    rows,
    eaten: entryTotals(i.entries),
    remaining: plannedTotals(ahead),
    remainingCount: ahead.length,
    missedCount: open.filter((o) => o.missed).length,
    dueId,
    plannedCount: placed.length,
  };
}
