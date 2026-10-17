// Hard sets per muscle against a target zone (DESIGN-V2 §4.7, §3.4.1 item 7). Pure.
//
// The library tags exercises with fine muscle groups (upper chest, side delts, lats, upper back
// …). The zones are set per coarse group, the way hard-set guidelines are written. A set counts
// ONCE per zone, even when two of its primary muscles fall in the same zone: a row (primary lats
// + upper back) is one back set, not two. Secondary muscles never count, exactly as in
// weeklySetsByMuscle. Muscles without a zone (forearms, grip, adductors, full body, exercises not
// in the library) are summed as "other" and get no bar.

import { getExercise } from "./library";
import { plannedSetCount, type Mode } from "./progression";
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
