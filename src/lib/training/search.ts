// Finding a lift in the library (the exercise picker, docs/DESIGN-V3-SIMPLE.md §4.2.6, §4.3.12).
// Pure: a typo-tolerant word and prefix match over names, muscles, equipment and a few gym
// words ("db", "rdl", "tris"), plus the picker's filters and its "Similar" list.

import { getExercise } from "./library";
import { pickableLibrary } from "./programs";
import type { Equipment, LibraryExercise, MuscleGroup } from "./types";
import { MUSCLE_LABEL } from "./volume";

/* ---------------------------------------------------------------- labels */

const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  cable: "Cable",
  machine: "Machine",
  smith: "Smith machine",
  bodyweight: "Bodyweight",
  ez_bar: "EZ bar",
  plate_loaded: "Plate-loaded",
  band: "Band",
  kettlebell: "Kettlebell",
  box: "Box",
  other: "Other",
};
export const equipmentLabel = (e: string) => EQUIPMENT_LABEL[e as Equipment] ?? e;

/** "Upper chest, front delts · Dumbbell": a picker row's subtitle (primary muscles, then equipment). */
export function exerciseLine(e: Pick<LibraryExercise, "primary" | "equipment">): string {
  const muscles = e.primary.map((m, i) => (i === 0 ? MUSCLE_LABEL[m] : MUSCLE_LABEL[m].toLowerCase())).join(", ");
  return `${muscles} · ${equipmentLabel(e.equipment)}`;
}

/* --------------------------------------------------------------- filters */

export interface MuscleFilter {
  id: string;
  label: string;
  muscles: MuscleGroup[];
}

/** The muscle chips, top of the body to the bottom. A chip matches a lift by its primary muscles. */
export const MUSCLE_FILTERS: MuscleFilter[] = [
  { id: "chest", label: "Chest", muscles: ["chest"] },
  { id: "upper_chest", label: "Upper chest", muscles: ["upper_chest"] },
  { id: "front_delts", label: "Front delts", muscles: ["front_delts"] },
  { id: "side_delts", label: "Side delts", muscles: ["side_delts"] },
  { id: "rear_delts", label: "Rear delts", muscles: ["rear_delts"] },
  { id: "lats", label: "Lats", muscles: ["lats"] },
  { id: "upper_back", label: "Upper back", muscles: ["upper_back"] },
  { id: "traps", label: "Traps", muscles: ["traps"] },
  { id: "lower_back", label: "Lower back", muscles: ["lower_back"] },
  { id: "biceps", label: "Biceps", muscles: ["biceps", "brachialis"] },
  { id: "triceps", label: "Triceps", muscles: ["triceps"] },
  { id: "forearms", label: "Forearms", muscles: ["forearms", "grip"] },
  { id: "quads", label: "Quads", muscles: ["quads"] },
  { id: "hamstrings", label: "Hamstrings", muscles: ["hamstrings"] },
  { id: "glutes", label: "Glutes", muscles: ["glutes"] },
  { id: "adductors", label: "Adductors", muscles: ["adductors"] },
  { id: "calves", label: "Calves", muscles: ["calves"] },
  { id: "abs", label: "Abs", muscles: ["abs"] },
  { id: "obliques", label: "Obliques", muscles: ["obliques"] },
];

/** The equipment chips (the box is only in retired jumps). */
export const EQUIPMENT_FILTERS: { id: Equipment; label: string }[] = (
  ["barbell", "dumbbell", "cable", "machine", "smith", "bodyweight", "ez_bar", "plate_loaded", "band", "kettlebell", "other"] as Equipment[]
).map((id) => ({ id, label: equipmentLabel(id) }));

export interface Filters {
  muscle?: string | null;
  equipment?: Equipment | null;
}

export function passesFilters(e: LibraryExercise, f: Filters): boolean {
  if (f.equipment && e.equipment !== f.equipment) return false;
  if (f.muscle) {
    const m = MUSCLE_FILTERS.find((x) => x.id === f.muscle);
    if (m && !e.primary.some((p) => m.muscles.includes(p))) return false;
  }
  return true;
}

/* ---------------------------------------------------------------- search */

/** Gym shorthand → the words the library uses. */
const ALIASES: Record<string, string[]> = {
  db: ["dumbbell"],
  dbs: ["dumbbell"],
  bb: ["barbell"],
  kb: ["kettlebell"],
  ez: ["ez"],
  rdl: ["romanian", "deadlift"],
  sldl: ["stiff", "leg", "deadlift"],
  ohp: ["overhead", "press"],
  bench: ["bench"],
  pullup: ["pull", "up"],
  pullups: ["pull", "up"],
  chinup: ["chin", "up"],
  chinups: ["chin", "up"],
  pushup: ["push", "up"],
  pushups: ["push", "up"],
  pulldown: ["pulldown"],
  tri: ["triceps"],
  tris: ["triceps"],
  tricep: ["triceps"],
  bi: ["biceps"],
  bis: ["biceps"],
  bicep: ["biceps"],
  delt: ["delts"],
  shoulder: ["delts"],
  shoulders: ["delts"],
  pec: ["chest"],
  pecs: ["chest"],
  quad: ["quads"],
  ham: ["hamstrings"],
  hams: ["hamstrings"],
  hammies: ["hamstrings"],
  glute: ["glutes"],
  butt: ["glutes"],
  calf: ["calves"],
  trap: ["traps"],
  forearm: ["forearms"],
  ab: ["abs"],
  core: ["abs"],
  oblique: ["obliques"],
  lat: ["lats"],
  smith: ["smith"],
  cables: ["cable"],
  machines: ["machine"],
  bands: ["band"],
  bw: ["bodyweight"],
};

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

interface Indexed {
  e: LibraryExercise;
  name: string[];
  /** The name without spaces ("widegrippullup"), so "pullup" finds "Pull-Up". */
  compact: string;
  primary: string[];
  other: string[];
}

const BACK: MuscleGroup[] = ["lats", "upper_back", "traps", "lower_back"];
const LEGS: MuscleGroup[] = ["quads", "hamstrings", "glutes", "adductors", "calves"];

function index(e: LibraryExercise): Indexed {
  const primary = e.primary.flatMap((m) => words(MUSCLE_LABEL[m]));
  // region words, so "shoulders", "back" and "legs" find their lifts
  if (e.primary.some((m) => m.endsWith("delts"))) primary.push("delts", "shoulders");
  if (e.primary.some((m) => BACK.includes(m))) primary.push("back");
  if (e.primary.some((m) => LEGS.includes(m))) primary.push("legs");
  const secondary = e.secondary.flatMap((m) => words(MUSCLE_LABEL[m]));
  return { e, name: words(e.name), compact: words(e.name).join(""), primary, other: [...secondary, ...words(equipmentLabel(e.equipment))] };
}

/** Optimal string alignment distance (a swap of two letters counts as one edit), capped at `max + 1`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** How far off a typed word may be: none under 4 letters, one up to 6, two from 7. */
const allowed = (t: string) => (t.length < 4 ? 0 : t.length < 7 ? 1 : 2);

/**
 * How well one typed word matches a list of words: 3 exact or prefix, 2 a typo of a word or its
 * start (the first letter must be right: "laterl" is lateral, "tris" is never wrist), 0 no match.
 */
function wordScore(t: string, list: string[]): number {
  let best = 0;
  for (const w of list) {
    if (w === t || w.startsWith(t)) return 3;
    const k = allowed(t);
    if (k && w[0] === t[0] && (editDistance(t, w, k) <= k || (w.length > t.length && editDistance(t, w.slice(0, t.length), k) <= k))) best = 2;
  }
  return best;
}

/** One typed word against an exercise: the name counts most, then the main muscles, then helpers and equipment. */
function termScore(t: string, x: Indexed): number {
  const n = wordScore(t, x.name) * 3 || (t.length >= 4 && x.compact.includes(t) ? 7 : 0);
  return n + wordScore(t, x.primary) * 2 + (n ? 0 : wordScore(t, x.other));
}

let INDEX: Indexed[] | null = null;
const allIndexed = () => (INDEX ??= pickableLibrary().map(index));

/**
 * The library's lifts that match a typed query, best first. Every typed word must match (a word
 * of the name, a muscle or the equipment, by prefix or with a small typo); gym shorthand counts
 * ("db" is dumbbell). An empty query returns nothing — the picker shows its sections then.
 */
export function searchLibrary(query: string, f: Filters = {}, pool?: LibraryExercise[]): LibraryExercise[] {
  const terms = words(query);
  if (!terms.length) return [];
  const indexed = pool ? pool.map(index) : allIndexed();
  const scored: { e: LibraryExercise; s: number }[] = [];
  for (const x of indexed) {
    if (!passesFilters(x.e, f)) continue;
    let total = 0;
    for (const t of terms) {
      const alias = ALIASES[t];
      let s = termScore(t, x);
      if (alias) s = Math.max(s, Math.min(...alias.map((a) => termScore(a, x))));
      if (!s) {
        total = 0;
        break;
      }
      total += s;
    }
    if (!total) continue;
    // a name that starts with what he typed goes first
    if (x.name.join(" ").startsWith(terms.join(" "))) total += 4;
    scored.push({ e: x.e, s: total });
  }
  return scored.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name)).map((x) => x.e);
}

/* --------------------------------------------------------------- similar */

const kind = (e: LibraryExercise) => (e.tracking === "weight_time" ? "timed" : "reps");

/**
 * "Similar" for a lift: its own substitutes first (same movement), then other lifts whose first
 * primary muscle is the same, compounds before isolation when the lift is a compound (and the
 * reverse), timed carries only for timed lifts. Retired and excluded lifts never show.
 */
export function similarTo(slug: string, limit = 8, exclude: string[] = []): LibraryExercise[] {
  const base = getExercise(slug);
  if (!base) return [];
  const pickable = pickableLibrary();
  const ok = new Set(pickable.map((e) => e.slug));
  const skip = new Set([slug, ...exclude]);
  const out: LibraryExercise[] = [];
  for (const s of base.substitutes) {
    const e = getExercise(s);
    if (e && ok.has(s) && !skip.has(s)) {
      out.push(e);
      skip.add(s);
    }
  }
  const main = base.primary[0];
  const rest = pickable
    .filter((e) => !skip.has(e.slug) && e.primary[0] === main && kind(e) === kind(base))
    .sort((a, b) => Number(b.category === base.category) - Number(a.category === base.category) || Number(b.equipment === base.equipment) - Number(a.equipment === base.equipment) || a.name.localeCompare(b.name));
  return [...out, ...rest].slice(0, limit);
}

/** The pickable library A–Z, filtered, grouped by first letter ("A", "B", …). */
export function alphabetical(f: Filters = {}, exclude: string[] = []): { letter: string; items: LibraryExercise[] }[] {
  const skip = new Set(exclude);
  const list = pickableLibrary()
    .filter((e) => !skip.has(e.slug) && passesFilters(e, f))
    .sort((a, b) => a.name.localeCompare(b.name));
  const out: { letter: string; items: LibraryExercise[] }[] = [];
  for (const e of list) {
    const letter = /[a-z]/i.test(e.name[0]) ? e.name[0].toUpperCase() : "#";
    if (out.at(-1)?.letter !== letter) out.push({ letter, items: [] });
    out.at(-1)!.items.push(e);
  }
  return out;
}
