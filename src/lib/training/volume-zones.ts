// Hard sets per muscle against a target zone. Pure.
//
// NEW (docs/PROGRAM-ARNOLD.md §5): Quinton's 13 muscle groups with fractional credit (a primary
// muscle counts a set as 1, a secondary as 0.5) and performance-based suggestions — see the
// "groups" section at the end. The older 10-zone API above it is kept for screens until P2.
//
// The library tags exercises with fine muscle groups (upper chest, side delts, lats, upper back
// …). The zones are set per coarse group, the way hard-set guidelines are written. A set counts
// ONCE per zone, even when two of its primary muscles fall in the same zone: a row (primary lats
// + upper back) is one back set, not two. Secondary muscles never count, exactly as in
// weeklySetsByMuscle. Muscles without a zone (forearms, grip, adductors, full body, exercises not
// in the library) are summed as "other" and get no bar.

import { addDays, weekStart, type ISODate } from "@/lib/dates";
import { getExercise } from "./library";
import { plannedSetCount, type Mode, type PastSet } from "./progression";
import type { DayTemplate, MuscleGroup } from "./types";
import type { SetLike } from "./volume";

export type ZoneKey = "chest" | "back" | "shoulders" | "quads" | "hamstrings" | "glutes" | "biceps" | "triceps" | "calves" | "core";
export type MuscleKey = ZoneKey | "other";

/** Hard working sets per week, [low, high]. A RULE: "a common range for hard sets per muscle per week". */
export const SET_ZONES: Record<ZoneKey, [number, number]> = {
  chest: [10, 20],
  back: [10, 20],
  quads: [10, 20],
  hamstrings: [10, 20],
  shoulders: [10, 20],
  biceps: [8, 16],
  triceps: [8, 16],
  glutes: [8, 16],
  calves: [8, 16],
  core: [6, 12],
};

/** The order the rows are shown in: push, pull, legs, then core. */
export const ZONE_ORDER: ZoneKey[] = ["chest", "shoulders", "triceps", "back", "biceps", "quads", "hamstrings", "glutes", "calves", "core"];

export const ZONE_LABEL: Record<MuscleKey, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  biceps: "Biceps",
  triceps: "Triceps",
  calves: "Calves",
  core: "Core",
  other: "Other",
};

export const ZONE_EXPLAIN = "A common range for hard sets per muscle per week";

/** The upper end of every bar (sets). */
export const ZONE_SCALE_MAX = 24;

/** Fine muscle group → zone group (null = no zone, counted as "other"). */
export const ZONE_OF: Record<MuscleGroup, ZoneKey | null> = {
  chest: "chest",
  upper_chest: "chest",
  front_delts: "shoulders",
  side_delts: "shoulders",
  rear_delts: "shoulders",
  lats: "back",
  upper_back: "back",
  traps: "back",
  lower_back: "back",
  biceps: "biceps",
  brachialis: "biceps",
  forearms: null,
  grip: null,
  triceps: "triceps",
  quads: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  adductors: null,
  calves: "calves",
  abs: "core",
  obliques: "core",
  full_body: null,
};

export type ZoneStatus = "under" | "in" | "above";

/** Where a set count sits against a zone: below its low end, inside it (inclusive), or above it. */
export function zoneStatus(sets: number, zone: [number, number]): ZoneStatus {
  if (sets < zone[0]) return "under";
  if (sets > zone[1]) return "above";
  return "in";
}

/** The zones one exercise's set counts toward (each zone once), or ["other"]. */
export function zonesOf(slug: string | null | undefined): MuscleKey[] {
  const lib = slug ? getExercise(slug) : undefined;
  if (!lib) return ["other"];
  const out = new Set<MuscleKey>();
  for (const m of lib.primary) out.add(ZONE_OF[m] ?? "other");
  // a muscle with a zone wins over "other" (brachialis + forearms is one biceps set)
  if (out.size > 1) out.delete("other");
  return [...out];
}

const counts = (s: SetLike) => s.completed !== false && s.kind !== "warmup";

/** Completed working sets per zone (and "other"). Every zone key is present, 0 when untrained. */
export function setsByZone(sets: SetLike[]): Record<MuscleKey, number> {
  const out = emptyZones();
  for (const s of sets) {
    if (!counts(s)) continue;
    for (const z of zonesOf(s.exercise_slug)) out[z] += 1;
  }
  return out;
}

/** Working sets the given templates would add per zone, in the mode they would start in. */
export function plannedSetsByZone(templates: Pick<DayTemplate, "exercises">[], mode: Mode): Record<MuscleKey, number> {
  const out = emptyZones();
  for (const t of templates) {
    for (const e of t.exercises) {
      const n = plannedSetCount(e, getExercise(e.slug), mode);
      for (const z of zonesOf(e.slug)) out[z] += n;
    }
  }
  return out;
}

export interface ZoneRow {
  zone: ZoneKey;
  label: string;
  sets: number;
  planned: number;
  range: [number, number];
  status: ZoneStatus;
  /** Sets still needed to reach the low end of the zone (0 when in or above). */
  toZone: number;
  /** One VoiceOver sentence: "Chest, 8 hard sets, target 10 to 20, under". */
  aria: string;
}

const STATUS_WORD: Record<ZoneStatus, string> = { under: "under", in: "in zone", above: "above" };
export const zoneStatusWord = (s: ZoneStatus) => STATUS_WORD[s];

/** The rows the Week shows, in ZONE_ORDER. */
export function zoneRows(done: Record<MuscleKey, number>, planned: Record<MuscleKey, number> = emptyZones()): ZoneRow[] {
  return ZONE_ORDER.map((zone) => {
    const sets = done[zone] ?? 0;
    const range = SET_ZONES[zone];
    const status = zoneStatus(sets, range);
    const p = planned[zone] ?? 0;
    return {
      zone,
      label: ZONE_LABEL[zone],
      sets,
      planned: p,
      range,
      status,
      toZone: Math.max(0, range[0] - sets),
      aria: `${ZONE_LABEL[zone]}, ${sets} hard ${sets === 1 ? "set" : "sets"}, target ${range[0]} to ${range[1]}, ${STATUS_WORD[status]}${p > 0 ? `, ${p} more planned` : ""}`,
    };
  });
}

function emptyZones(): Record<MuscleKey, number> {
  return { chest: 0, back: 0, shoulders: 0, quads: 0, hamstrings: 0, glutes: 0, biceps: 0, triceps: 0, calves: 0, core: 0, other: 0 };
}

/* ====================================================================== */
/* groups (§5): 13 groups, fractional credit, performance-based advice     */
/* ====================================================================== */

export type GroupKey = "chest" | "side_delts" | "rear_delts" | "front_delts" | "back" | "biceps" | "triceps" | "forearms" | "quads" | "hamstrings" | "glutes" | "calves" | "abs";

/** Quinton's order (Q§12). */
export const GROUPS: GroupKey[] = ["chest", "side_delts", "rear_delts", "front_delts", "back", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "calves", "abs"];

export const GROUP_LABEL: Record<GroupKey, string> = {
  chest: "Upper chest and chest",
  side_delts: "Side delts",
  rear_delts: "Rear delts",
  front_delts: "Front delts",
  back: "Lats and upper back",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quads: "Quadriceps",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  abs: "Abdominals",
};

/** Fractional hard sets per week, [low, high]. A RULE: "a common range". */
export const GROUP_ZONES: Record<GroupKey, [number, number]> = {
  chest: [10, 20],
  side_delts: [8, 20],
  rear_delts: [6, 16],
  front_delts: [4, 12],
  back: [10, 22],
  biceps: [8, 20],
  triceps: [8, 20],
  forearms: [4, 12],
  quads: [10, 20],
  hamstrings: [8, 16],
  glutes: [6, 16],
  calves: [8, 16],
  abs: [4, 12],
};

/** A secondary muscle's share of a set. */
export const SECONDARY_CREDIT = 0.5;

/** Library muscle → group. traps, lower back, adductors and full body are not tracked. */
export const GROUP_OF: Record<MuscleGroup, GroupKey | null> = {
  chest: "chest",
  upper_chest: "chest",
  side_delts: "side_delts",
  rear_delts: "rear_delts",
  front_delts: "front_delts",
  lats: "back",
  upper_back: "back",
  biceps: "biceps",
  brachialis: "biceps",
  triceps: "triceps",
  forearms: "forearms",
  grip: "forearms",
  quads: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  calves: "calves",
  abs: "abs",
  obliques: "abs",
  traps: null,
  lower_back: null,
  adductors: null,
  full_body: null,
};

const emptyGroups = (): Record<GroupKey, number> => Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<GroupKey, number>;
const half = (v: number) => Math.round(v * 2) / 2;

/**
 * What one set of an exercise credits each group: 1 when a primary muscle maps to it, else 0.5
 * when a secondary does; each group once. Retired and unknown slugs credit nothing; a custom
 * exercise credits its primary muscles.
 */
export function groupCredit(slug: string, custom: Record<string, MuscleGroup[]> = {}): Partial<Record<GroupKey, number>> {
  const lib = getExercise(slug);
  const out: Partial<Record<GroupKey, number>> = {};
  if (lib?.retired) return out;
  const primary = lib ? lib.primary : (custom[slug] ?? []);
  const secondary = lib ? lib.secondary : [];
  for (const m of secondary) {
    const g = GROUP_OF[m];
    if (g) out[g] = SECONDARY_CREDIT;
  }
  for (const m of primary) {
    const g = GROUP_OF[m];
    if (g) out[g] = 1;
  }
  return out;
}

const countsAsWork = (s: SetLike) => s.completed !== false && s.kind !== "warmup";

/** Completed working sets per group (fractional), rounded to 0.5. Warm-ups never count. */
export function groupSets(sets: SetLike[], custom?: Record<string, MuscleGroup[]>): Record<GroupKey, number> {
  const out = emptyGroups();
  const cache = new Map<string, Partial<Record<GroupKey, number>>>();
  for (const s of sets) {
    if (!countsAsWork(s) || !s.exercise_slug) continue;
    let c = cache.get(s.exercise_slug);
    if (!c) cache.set(s.exercise_slug, (c = groupCredit(s.exercise_slug, custom)));
    for (const [g, v] of Object.entries(c) as [GroupKey, number][]) out[g] += v;
  }
  for (const g of GROUPS) out[g] = half(out[g]);
  return out;
}

/** The sets the templates would credit per group in a mode (optional exercises left out, as they never start). */
export function plannedGroupSets(templates: Pick<DayTemplate, "exercises">[], mode: Mode, custom?: Record<string, MuscleGroup[]>): Record<GroupKey, number> {
  const out = emptyGroups();
  for (const t of templates) {
    for (const e of t.exercises) {
      if (e.optional) continue;
      const n = plannedSetCount(e, getExercise(e.slug), mode);
      for (const [g, v] of Object.entries(groupCredit(e.slug, custom)) as [GroupKey, number][]) out[g] += n * v;
    }
  }
  for (const g of GROUPS) out[g] = half(out[g]);
  return out;
}

export interface GroupTrend {
  trend: "up" | "flat" | "down" | "unknown";
  /** Median change of the group's lifts, percent (one decimal); null when unknown. */
  changePct: number | null;
  weeks: 6;
  lifts: { slug: string; name: string; changePct: number }[];
}

export interface GroupRow {
  group: GroupKey;
  label: string;
  sets: number;
  planned: number;
  zone: [number, number];
  status: "under" | "in" | "above";
  trend: GroupTrend | null;
  /** One VoiceOver sentence: "Side delts, 10 sets, range 8 to 20, in range". */
  aria: string;
}

const GROUP_STATUS_WORD = { under: "under the range", in: "in range", above: "above the range" } as const;

/** The rows Sets by muscle shows, in GROUPS order. */
export function groupRows(done: Record<GroupKey, number>, planned?: Record<GroupKey, number>, trends?: Partial<Record<GroupKey, GroupTrend>>): GroupRow[] {
  return GROUPS.map((group) => {
    const sets = done[group] ?? 0;
    const zone = GROUP_ZONES[group];
    const status = zoneStatus(sets, zone);
    const p = planned?.[group] ?? 0;
    const trend = trends?.[group] ?? null;
    const word = (n: number) => `${n} ${n === 1 ? "set" : "sets"}`;
    return {
      group,
      label: GROUP_LABEL[group],
      sets,
      planned: p,
      zone,
      status,
      trend,
      aria: `${GROUP_LABEL[group]}, ${word(sets)}, range ${zone[0]} to ${zone[1]}, ${GROUP_STATUS_WORD[status]}${p > 0 ? `, ${p} more planned` : ""}`,
    };
  });
}

/** Epley on the best set of a session, uncapped (above 12 reps it still ranks sessions at similar loads). */
function sessionBest(sets: PastSet[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    const w = Number(s.weight_lb ?? 0);
    const r = Number(s.reps ?? 0);
    if (!(w > 0) || !(r > 0)) continue;
    const v = w * (1 + r / 30);
    if (best == null || v > best) best = v;
  }
  return best;
}

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length / 2;
  return a.length % 2 ? a[Math.floor(m)] : (a[m - 1] + a[m]) / 2;
};

export const TREND_WEEKS = 6;
const TREND_UP = 0.02;

/**
 * Each group's strength trend over the last 6 weeks (§5.4): for every lift that credits the
 * group as a primary and has 3+ real sessions in the window, the mean best of its latest two
 * sessions over the mean of its earliest two, minus 1. The group's trend is the median: up at
 * +2% or more, down at −2% or less, else flat; unknown with fewer than two such lifts (or one
 * with 4+ sessions).
 */
export function groupTrends(history: Record<string, PastSet[]>, today: ISODate, custom?: Record<string, MuscleGroup[]>): Record<GroupKey, GroupTrend> {
  const from = addDays(today, -7 * TREND_WEEKS + 1);
  const per: Record<GroupKey, { slug: string; name: string; change: number; sessions: number }[]> = Object.fromEntries(GROUPS.map((g) => [g, []])) as never;
  for (const [slug, sets] of Object.entries(history)) {
    const credit = groupCredit(slug, custom);
    const primaries = (Object.entries(credit) as [GroupKey, number][]).filter(([, v]) => v === 1).map(([g]) => g);
    if (!primaries.length) continue;
    const bySession = new Map<string, PastSet[]>();
    for (const s of sets) {
      if (s.local_date < from || s.local_date > today || s.mode === "deload") continue;
      const k = `${s.local_date}|${s.session_id}`;
      bySession.set(k, [...(bySession.get(k) ?? []), s]);
    }
    const bests = [...bySession.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => sessionBest(v))
      .filter((v): v is number => v != null);
    if (bests.length < 3) continue;
    const early = (bests[0] + bests[1]) / 2;
    const late = (bests[bests.length - 1] + bests[bests.length - 2]) / 2;
    if (!(early > 0)) continue;
    const change = late / early - 1;
    const name = getExercise(slug)?.name ?? slug;
    for (const g of primaries) per[g].push({ slug, name, change, sessions: bests.length });
  }
  const out = {} as Record<GroupKey, GroupTrend>;
  for (const g of GROUPS) {
    const lifts = per[g];
    const known = lifts.length >= 2 || (lifts.length === 1 && lifts[0].sessions >= 4);
    const m = lifts.length ? median(lifts.map((l) => l.change)) : null;
    out[g] = {
      trend: !known || m == null ? "unknown" : m >= TREND_UP ? "up" : m <= -TREND_UP ? "down" : "flat",
      changePct: known && m != null ? Math.round(m * 1000) / 10 : null,
      weeks: TREND_WEEKS,
      lifts: lifts.map((l) => ({ slug: l.slug, name: l.name, changePct: Math.round(l.change * 1000) / 10 })),
    };
  }
  return out;
}

export interface VolumeSuggestion {
  group: GroupKey;
  kind: "trim" | "hold" | "add";
  /** Sets a week to take off (trim) or add (add); 0 for hold. */
  sets: number;
  exercise: { slug: string; name: string; templateKey: string } | null;
  reason: string;
}

export interface VolumeSuggestionInput {
  today: ISODate;
  /** Completed working sets (set_history) covering at least the last 4 complete weeks. */
  sets: (SetLike & { local_date: ISODate | null; session_id?: string | null })[];
  /** Sessions over the same weeks with their modes. */
  sessions: { id?: string; local_date: ISODate; status: string; mode?: string | null }[];
  /** Check-ins of the last 14 days. */
  checkins: { local_date: ISODate; soreness: number | null; fatigue: number | null }[];
  /** The active program's templates, in weekday order. */
  templates: Pick<DayTemplate, "key" | "name" | "exercises">[];
  /** Strength trend per group (groupTrends). */
  trends: Partial<Record<GroupKey, GroupTrend>>;
  mode: Mode;
  programSince: ISODate | null;
  startDate: ISODate | null;
  custom?: Record<string, MuscleGroup[]>;
}

/** Weeks of the current program needed before volume is judged. */
export const VOLUME_MIN_WEEKS = 3;
const STRAIN = 3.5;

/**
 * Up to two volume suggestions from what actually happened (§5.4): trim a group above its
 * zone that isn't progressing, hold a group that is losing strength while recovery is strained,
 * add to a group below its zone that isn't progressing while recovery is fine. A group that is
 * progressing gets nothing, whatever its sets. Nothing in deload or intro weeks, and nothing
 * before 3 weeks of the current program.
 */
export function volumeSuggestions(input: VolumeSuggestionInput): VolumeSuggestion[] {
  const { today, mode } = input;
  if (mode !== "standard") return [];
  const since = [input.programSince, input.startDate].filter((d): d is ISODate => !!d).sort().at(-1) ?? null;
  if (since && addDays(since, 7 * VOLUME_MIN_WEEKS) > today) return [];

  // the last 3 complete weeks, skipping deload and intro weeks
  const thisWeek = weekStart(today);
  const lightWeeks = new Set(input.sessions.filter((s) => s.status === "done" && (s.mode === "deload" || s.mode === "intro")).map((s) => weekStart(s.local_date)));
  const weeks = [1, 2, 3].map((i) => addDays(thisWeek, -7 * i)).filter((w) => !lightWeeks.has(w));
  if (!weeks.length) return [];
  const sums = weeks.map((w) => groupSets(input.sets.filter((s) => s.local_date && s.local_date >= w && s.local_date < addDays(w, 7)), input.custom));
  const weekly = Object.fromEntries(GROUPS.map((g) => [g, half(sums.reduce((a, x) => a + x[g], 0) / sums.length)])) as Record<GroupKey, number>;

  const recent = [...input.checkins].filter((c) => c.local_date <= today).sort((a, b) => b.local_date.localeCompare(a.local_date)).slice(0, 7);
  const avg = (k: "soreness" | "fatigue") => {
    const xs = recent.map((c) => c[k]).filter((v): v is number => v != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const sore = avg("soreness");
  const tired = avg("fatigue");
  const strained = (sore ?? 0) >= STRAIN || (tired ?? 0) >= STRAIN;

  // the group's last exercise in day order that trains it as a primary (the accessory to change)
  const lastFor = (g: GroupKey) => {
    let hit: VolumeSuggestion["exercise"] = null;
    for (const t of input.templates) for (const e of t.exercises) if (!e.optional && groupCredit(e.slug, input.custom)[g] === 1) hit = { slug: e.slug, name: e.name, templateKey: t.key };
    return hit;
  };

  const out: (VolumeSuggestion & { rank: number; dev: number })[] = [];
  for (const g of GROUPS) {
    const tr = input.trends[g];
    const trend = tr?.trend ?? "unknown";
    if (trend === "up" || trend === "unknown") continue;
    const sets = weekly[g];
    const [lo, hi] = GROUP_ZONES[g];
    const label = GROUP_LABEL[g];
    if (sets > hi) {
      const n = Math.max(1, Math.ceil(sets - hi));
      const ex = lastFor(g);
      out.push({ group: g, kind: "trim", sets: n, exercise: ex, rank: 0, dev: sets - hi, reason: `${label}: about ${n} fewer ${n === 1 ? "set" : "sets"} a week. It hasn't progressed at ${sets} sets.${ex ? ` For example one set fewer of ${ex.name}.` : ""}` });
    } else if (trend === "down" && strained) {
      const pct = Math.abs(tr?.changePct ?? 0);
      const what = (sore ?? 0) >= (tired ?? 0) ? `soreness ${Math.round((sore ?? 0) * 10) / 10}/5` : `tiredness ${Math.round((tired ?? 0) * 10) / 10}/5`;
      out.push({ group: g, kind: "hold", sets: 0, exercise: null, rank: 1, dev: pct, reason: `${label}: keep the sets where they are and recover first. Strength is down ${pct}% with ${what}.` });
    } else if (sets < lo && !strained) {
      const n = Math.min(4, Math.max(1, Math.ceil(lo - sets)));
      const ex = lastFor(g);
      out.push({ group: g, kind: "add", sets: n, exercise: ex, rank: 2, dev: lo - sets, reason: `${label}: add ${n} ${n === 1 ? "set" : "sets"} a week${ex ? `, for example one more set of ${ex.name}` : ""}.` });
    }
  }
  return out
    .sort((a, b) => a.rank - b.rank || b.dev - a.dev)
    .slice(0, 2)
    .map(({ rank: _r, dev: _d, ...v }) => v);
}
