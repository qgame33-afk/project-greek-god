// Habit customisation rules. Built-in tracker habits (protein, water, sleep…) can be hidden
// but never turned into something they aren't; custom habits are fully editable.

export type HabitKind = "auto" | "value" | "check";

export interface HabitDefEdit {
  key: string;
  label: string;
  kind: HabitKind;
  target: number | null;
  unit: string | null;
  active: boolean;
  sort: number;
}

export interface Editability {
  rename: boolean;
  /** Edit the target / unit of a value habit. */
  target: boolean;
  hide: boolean;
  remove: boolean;
  /** Goal lives on the profile (steps) rather than the habit row. */
  profileGoal: boolean;
}

export const LABEL_MAX = 60;
export const UNIT_MAX = 12;

/** Habits the app seeds for everyone, keyed as in DEFAULT_HABITS. */
export const BUILT_IN_KEYS = [
  "workout",
  "protein",
  "calories",
  "water",
  "weighin",
  "sleep",
  "steps",
  "mobility",
] as const;

export function isBuiltIn(key: string) {
  return (BUILT_IN_KEYS as readonly string[]).includes(key);
}

export function editability(
  def: Pick<HabitDefEdit, "key" | "kind">,
): Editability {
  if (def.kind === "auto")
    return {
      rename: false,
      target: false,
      hide: true,
      remove: false,
      profileGoal: false,
    };
  if (def.key === "steps")
    return {
      rename: false,
      target: false,
      hide: true,
      remove: false,
      profileGoal: true,
    };
  if (isBuiltIn(def.key))
    return {
      rename: true,
      target: def.kind === "value",
      hide: true,
      remove: false,
      profileGoal: false,
    };
  return {
    rename: true,
    target: def.kind === "value",
    hide: true,
    remove: true,
    profileGoal: false,
  };
}

/** Stable, unique key for a new custom habit: "c-creatine-5-g", "c-creatine-5-g-2", … */
export function habitKeyFor(label: string, existing: Iterable<string>) {
  const taken = new Set(existing);
  const slug =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "habit";
  const base = `c-${slug}`;
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export interface HabitDraft {
  label: string;
  kind: "check" | "value";
  target: string;
  unit: string;
}

export interface DraftErrors {
  label?: string;
  target?: string;
  unit?: string;
}

/** Validate a custom-habit form; returns the cleaned values or field errors. */
export function validateDraft(
  d: HabitDraft,
  otherLabels: string[] = [],
):
  | {
      ok: true;
      value: {
        label: string;
        kind: "check" | "value";
        target: number | null;
        unit: string | null;
      };
    }
  | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const label = d.label.trim().replace(/\s+/g, " ");
  if (!label) errors.label = "Name the habit.";
  else if (label.length > LABEL_MAX)
    errors.label = `Keep it under ${LABEL_MAX} characters.`;
  else if (
    otherLabels.some(
      (l) =>
        habitDisplayLabel(l.trim()).toLowerCase() ===
        habitDisplayLabel(label).toLowerCase(),
    )
  )
    // compared by display name: "Mobility" duplicates the built-in "Mobility (optional)"
    errors.label = "You already have a habit with that name.";
  let target: number | null = null;
  let unit: string | null = null;
  if (d.kind === "value") {
    const t = Number(d.target.trim().replace(",", "."));
    if (!d.target.trim() || !Number.isFinite(t) || t <= 0)
      errors.target = "Enter a daily target above 0.";
    else if (t > 1_000_000) errors.target = "That target is too large.";
    else target = Math.round(t * 100) / 100;
    unit = d.unit.trim().slice(0, UNIT_MAX) || null;
    if (d.unit.trim().length > UNIT_MAX)
      errors.unit = `Keep the unit under ${UNIT_MAX} characters.`;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { label, kind: d.kind, target, unit } };
}

/**
 * Move one habit up or down. Returns the full list with sort values rewritten 0…n−1
 * (so gaps and duplicate sorts from older data are healed) and the keys whose sort changed.
 */
export function moveHabit<T extends HabitDefEdit>(
  defs: T[],
  key: string,
  dir: -1 | 1,
): { list: T[]; changed: T[] } {
  const list = [...defs].sort(
    (a, b) => a.sort - b.sort || a.key.localeCompare(b.key),
  );
  const i = list.findIndex((d) => d.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return { list, changed: [] };
  [list[i], list[j]] = [list[j], list[i]];
  const next = list.map((d, idx) => ({ ...d, sort: idx }));
  const before = new Map(defs.map((d) => [d.key, d.sort]));
  return {
    list: next,
    changed: next.filter((d) => before.get(d.key) !== d.sort),
  };
}

/**
 * Move one visible (active) habit up or down among the visible habits only — hidden habits
 * never swallow a move. Active habits get sort 0…n−1 in their new order and hidden ones
 * follow, so the stored order always matches what the list shows.
 */
export function moveVisible<T extends HabitDefEdit>(
  defs: T[],
  key: string,
  dir: -1 | 1,
): { list: T[]; changed: T[] } {
  const byOrder = (a: T, b: T) => a.sort - b.sort || a.key.localeCompare(b.key);
  const active = defs.filter((d) => d.active).sort(byOrder);
  const hidden = defs.filter((d) => !d.active).sort(byOrder);
  const i = active.findIndex((d) => d.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= active.length) return { list: [...active, ...hidden], changed: [] };
  [active[i], active[j]] = [active[j], active[i]];
  const next = [...active, ...hidden].map((d, idx) => ({ ...d, sort: idx }));
  const before = new Map(defs.map((d) => [d.key, d.sort]));
  return {
    list: next,
    changed: next.filter((d) => before.get(d.key) !== d.sort),
  };
}

/** Whether a habit is marked optional (built-in mobility, or "(optional)" in its name). */
export function isOptionalHabit(key: string, label: string) {
  return key === "mobility" || /\(optional\)/i.test(label);
}

/** One display name everywhere: "Mobility (optional)" → "Mobility" (the OPTIONAL badge says the rest). */
export function habitDisplayLabel(label: string) {
  return label.replace(/\s*\(optional\)\s*/gi, " ").trim() || label;
}

export interface HabitPreset {
  id: string;
  group: "Mobility" | "Supplements" | "Sleep" | "Movement";
  label: string;
  kind: "check" | "value";
  target?: number;
  unit?: string;
  /** Reactivate this built-in instead of creating a copy. */
  builtIn?: string;
}

/** Optional reminders the spec calls out: mobility and supplements, plus a sleep routine. */
export const HABIT_PRESETS: HabitPreset[] = [
  {
    id: "mobility",
    group: "Mobility",
    label: "Mobility",
    kind: "check",
    builtIn: "mobility",
  },
  {
    id: "foam-roll",
    group: "Mobility",
    label: "Foam roll legs",
    kind: "check",
  },
  {
    id: "creatine",
    group: "Supplements",
    label: "Creatine 5 g",
    kind: "check",
  },
  { id: "vitamin-d", group: "Supplements", label: "Vitamin D", kind: "check" },
  { id: "omega-3", group: "Supplements", label: "Omega-3", kind: "check" },
  {
    id: "screens-off",
    group: "Sleep",
    label: "Screens off 30 min before bed",
    kind: "check",
  },
  {
    id: "walk",
    group: "Movement",
    label: "Walk",
    kind: "value",
    target: 20,
    unit: "min",
  },
];

/** Whether a preset is already present (active or hidden) in the user's list. */
export function presetState(
  p: HabitPreset,
  defs: Pick<HabitDefEdit, "key" | "label" | "active">[],
): "active" | "hidden" | "absent" {
  const match = defs.find((d) =>
    p.builtIn
      ? d.key === p.builtIn
      : d.label.trim().toLowerCase() === p.label.toLowerCase(),
  );
  if (!match) return "absent";
  return match.active ? "active" : "hidden";
}

/** Next sort value at the end of the list. */
export function nextSort(defs: Pick<HabitDefEdit, "sort">[]) {
  return defs.reduce((m, d) => Math.max(m, d.sort), -1) + 1;
}

/** Format a value-habit target: "10 min", "8,000 steps", "2.5 L". */
export function formatTarget(target: number | null, unit: string | null) {
  if (target == null) return "";
  const n = Number.isInteger(target)
    ? target.toLocaleString("en-US")
    : String(target);
  return unit ? `${n} ${unit}` : n;
}
