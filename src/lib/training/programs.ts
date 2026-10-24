// The active program and the one plan resolver every reader uses (docs/PROGRAM-ARNOLD.md §2).
// Pure: no React, no Supabase. Screens import program data from here only.

import { weekday, type ISODate } from "@/lib/dates";
import type { ReadinessLevel } from "@/lib/recovery/guidance";
import { getExercise, LIBRARY } from "./library";
import { ARNOLD_RULES, ARNOLD_SCHEDULE, ARNOLD_TEMPLATES } from "./program-arnold";
import { PPL_RULES, PPL_SCHEDULE, PPL_TEMPLATES } from "./program-ppl";
import type { Mode } from "./progression";
import type { ArnoldKey, DayFamily, DayTemplate, LibraryExercise, PplKey, ProgramId, TemplateExercise, TemplateKey, WarmupStep } from "./types";

export { ARNOLD_RULES, ARNOLD_SCHEDULE, ARNOLD_TEMPLATES, PPL_RULES, PPL_SCHEDULE, PPL_TEMPLATES };

export const DEFAULT_PROGRAM: ProgramId = "arnold";

export interface ProgramDef {
  id: ProgramId;
  /** "Arnold split" | "Push/Pull/Legs" — the one spelling every screen shows. */
  name: string;
  /** In weekday order; slot i of one program ↔ slot i of the other. */
  keys: TemplateKey[];
  templates: DayTemplate[];
  schedule: Record<string, TemplateKey | "rest">;
  rules: string[];
}

export const ARNOLD_KEYS = ARNOLD_TEMPLATES.map((t) => t.key) as ArnoldKey[];
export const PPL_KEYS = PPL_TEMPLATES.map((t) => t.key) as PplKey[];

export const PROGRAMS: Record<ProgramId, ProgramDef> = {
  arnold: { id: "arnold", name: "Arnold split", keys: ARNOLD_KEYS, templates: ARNOLD_TEMPLATES, schedule: ARNOLD_SCHEDULE, rules: ARNOLD_RULES },
  ppl: { id: "ppl", name: "Push/Pull/Legs", keys: PPL_KEYS, templates: PPL_TEMPLATES, schedule: PPL_SCHEDULE, rules: PPL_RULES },
};

export const PROGRAM_IDS: ProgramId[] = ["arnold", "ppl"];

/** Both programs' built-in templates by key. */
export const TEMPLATE_DEFS = Object.fromEntries([...ARNOLD_TEMPLATES, ...PPL_TEMPLATES].map((t) => [t.key, t])) as Record<TemplateKey, DayTemplate>;

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export function templateDef(key: string | null | undefined): DayTemplate | undefined {
  return key && has(TEMPLATE_DEFS, key) ? TEMPLATE_DEFS[key as TemplateKey] : undefined;
}

export function isTemplateKey(key: unknown): key is TemplateKey {
  return typeof key === "string" && has(TEMPLATE_DEFS, key);
}

export function programOfKey(key: string | null | undefined): ProgramId | null {
  return templateDef(key)?.program ?? null;
}

/** The same slot of the other program (Push A ↔ Shoulders, Biceps & Triceps A …). A bijection. */
export function counterpartKey(key: TemplateKey, to: ProgramId): TemplateKey {
  const from = programOfKey(key);
  if (!from || from === to) return key;
  const i = PROGRAMS[from].keys.indexOf(key);
  return PROGRAMS[to].keys[i] ?? key;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

type ProfileLike = { prefs?: unknown; weekly_schedule?: unknown } | null | undefined;

/**
 * Which program a profile follows. Mirrors SQL public.program_of() exactly:
 * prefs.program when valid, else Arnold when the week holds an Arnold key, else PPL when it
 * holds a PPL key, else DEFAULT_PROGRAM.
 */
export function activeProgram(p: ProfileLike): ProgramId {
  const prefs = isObj(p?.prefs) ? p!.prefs : {};
  if (prefs.program === "arnold" || prefs.program === "ppl") return prefs.program;
  const week = isObj(p?.weekly_schedule) ? Object.values(p!.weekly_schedule) : [];
  if (week.some((v) => typeof v === "string" && (ARNOLD_KEYS as string[]).includes(v))) return "arnold";
  if (week.some((v) => typeof v === "string" && (PPL_KEYS as string[]).includes(v))) return "ppl";
  return DEFAULT_PROGRAM;
}

/** The date the active program started (the switch that set it), else null. */
export function programSince(prefs: unknown, active?: ProgramId): ISODate | null {
  const o = isObj(prefs) ? prefs : {};
  const sw = isObj(o.programSwitch) ? o.programSwitch : null;
  const program = active ?? activeProgram({ prefs: o });
  if (!sw || sw.to !== program) return null;
  return typeof sw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sw.date) ? sw.date : null;
}

/** The weekly schedule: profiles.weekly_schedule merged over the active program's default week. */
export function scheduleFor(p: ProfileLike): Record<string, string> {
  const out: Record<string, string> = { ...PROGRAMS[activeProgram(p)].schedule };
  const week = p?.weekly_schedule;
  if (isObj(week)) {
    for (const [k, v] of Object.entries(week)) if (/^[0-6]$/.test(k) && typeof v === "string" && v) out[k] = v;
  }
  return out;
}

/**
 * The plan key for a date. The day_plans override wins — except a key of the other program on
 * or after the switch date, on a row the switch itself did not write, which is mapped to the
 * same slot of the active program (a stale device writing an old key). Else the weekly
 * schedule, else rest.
 */
export function resolvePlanKey(
  date: ISODate,
  schedule: Record<string, string>,
  override: { template_key: string; note?: string | null } | null | undefined,
  ctx: { program: ProgramId; since: ISODate | null },
): string {
  if (override) {
    const k = override.template_key;
    const owner = programOfKey(k);
    if (owner && owner !== ctx.program && ctx.since && date >= ctx.since && override.note !== "program-switch") return counterpartKey(k as TemplateKey, ctx.program);
    return k;
  }
  return schedule[String(weekday(date))] ?? "rest";
}

/* ----------------------------------------------------------- stored rows */

/** Exercises that may show or start: retired library entries (jumps) are dropped. */
export function visibleExercises(xs: TemplateExercise[]): TemplateExercise[] {
  return (Array.isArray(xs) ? xs : []).filter((e) => !getExercise(e.slug)?.retired);
}

const JUMP_PREP = "Jump prep";
const AFTER_JUMPS = "After the jumps: ";

/** Warm-up as shown: the old "Jump prep" step is dropped and "After the jumps: " is stripped. */
export function visibleWarmup(xs: WarmupStep[]): WarmupStep[] {
  return (Array.isArray(xs) ? xs : [])
    .filter((w) => w.label !== JUMP_PREP)
    .map((w) => (typeof w.detail === "string" && w.detail.startsWith(AFTER_JUMPS) ? { ...w, detail: cap(w.detail.slice(AFTER_JUMPS.length)) } : w));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The three names a template shows: `name` (hero, titles), `short` (top bar, cards), `abbr`
 * (week strips). A renamed template uses its own name for `short` and its first word, cut to
 * 5 characters, for `abbr`. `family` always comes from the key.
 */
export function templateLabels(t: { key: string; name: string }): { name: string; short: string; abbr: string; family: DayFamily | null } {
  const def = templateDef(t.key);
  const family = def?.family ?? null;
  if (def && t.name === def.name) return { name: t.name, short: def.short, abbr: def.abbr, family };
  const first = (t.name.trim().split(/\s+/)[0] ?? "").replace(/[^\p{L}\p{N}&/-]/gu, "");
  return { name: t.name, short: t.name, abbr: first.slice(0, 5) || (def?.abbr ?? ""), family };
}

/* ---------------------------------------------------------- effort (Q§10) */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** RIR and rest for an exercise added or swapped in, by effort class (§1.2). */
export function effortDefaults(lib: LibraryExercise): { rir: string; rest: number } {
  switch (lib.category) {
    case "compound":
      return { rir: "1–3", rest: clamp(lib.rest, 120, 180) };
    case "carry":
      return { rir: "1–2", rest: 90 };
    case "explosive":
      return { rir: "Fresh", rest: lib.rest };
    default:
      return { rir: "0–2", rest: clamp(lib.rest, 60, 120) };
  }
}

/** "1–3" → [1, 3], "0–2" → [0, 2], "3" → [3, 3], "Fresh" / junk → null. */
export function rirRange(text: string | null | undefined): [number, number] | null {
  if (!text) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:[–—-]\s*(\d+(?:\.\d+)?))?\s*$/.exec(text);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = m[2] == null ? lo : Number(m[2]);
  return lo <= hi ? [lo, hi] : [hi, lo];
}

/** An exercise's title: the active program's template name for the slug, else the library name. */
export function exerciseDisplayName(slug: string, active: { exercises: TemplateExercise[] }[]): string {
  for (const t of active) for (const e of t.exercises ?? []) if (e.slug === slug && e.name) return e.name;
  return getExercise(slug)?.name ?? slug;
}

/** Rough session length in minutes, rounded to the nearest 5. Optional exercises are not counted. */
export function estimateDurationMin(t: Pick<DayTemplate, "exercises">): number {
  const WARMUP_MIN = 10;
  const TRANSITION_MIN = 1;
  const planned = t.exercises.filter((e) => !e.optional);
  let seconds = 0;
  for (const ex of planned) {
    let work: number;
    if (getExercise(ex.slug)?.category === "explosive") work = 15;
    else if (ex.unit === "sec") work = ex.repHigh;
    else if (ex.unit === "each") work = 40 * 2; // both sides
    else work = 40;
    seconds += ex.sets * work + Math.max(0, ex.sets - 1) * ex.rest;
  }
  const minutes = seconds / 60 + WARMUP_MIN + TRANSITION_MIN * planned.length;
  return Math.round(minutes / 5) * 5;
}

/** Offer the optional lift (Thursday's reverse curls) after the last planned set (§1.4). */
export function suggestOptional(mode: Mode, level: ReadinessLevel | null | undefined): boolean {
  return mode === "standard" && (level == null || level === "go" || level === "unknown");
}

/* --------------------------------------------------- carried swaps (§3.7) */

type TemplateLike = { key: string; exercises: TemplateExercise[] };

/**
 * Exercise swaps he made in Push/Pull/Legs that Arnold could reuse: a built-in slug S missing
 * from his stored PPL row and a stored slug T not in the built-in, related through the
 * library's substitutes, kept when S is still in one of his Arnold templates.
 */
export function carriedSwaps(storedPpl: TemplateLike[], arnold: TemplateLike[]): { from: string; to: string; keys: ArnoldKey[] }[] {
  const out = new Map<string, { from: string; to: string; keys: ArnoldKey[] }>();
  for (const row of storedPpl) {
    const def = templateDef(row.key);
    if (!def || def.program !== "ppl") continue;
    const builtIn = new Set(def.exercises.map((e) => e.slug));
    const stored = visibleExercises(row.exercises).map((e) => e.slug);
    const storedSet = new Set(stored);
    const missing = [...builtIn].filter((s) => !storedSet.has(s));
    const added = stored.filter((s) => !builtIn.has(s));
    const used = new Set<string>();
    for (const s of missing) {
      const ls = getExercise(s);
      const t = added.find((x) => !used.has(x) && (ls?.substitutes.includes(x) || getExercise(x)?.substitutes.includes(s)));
      if (!t) continue;
      used.add(t);
      const keys = arnold.filter((a) => programOfKey(a.key) === "arnold" && a.exercises.some((e) => e.slug === s)).map((a) => a.key as ArnoldKey);
      if (!keys.length) continue;
      const id = `${s}>${t}`;
      const prev = out.get(id);
      out.set(id, { from: s, to: t, keys: [...new Set([...(prev?.keys ?? []), ...keys])] });
    }
  }
  return [...out.values()];
}

/** The library as offered in pickers, substitutes and new templates: retired entries left out. */
export function pickableLibrary(): LibraryExercise[] {
  return LIBRARY.filter((e) => !e.retired);
}

/* ------------------------------------------------------ Sunday (Q§8, §1.5) */

export const SUNDAY_RECOVERY: { title: string; items: { label: string; detail: string }[] } = {
  title: "Rest and recovery",
  items: [
    { label: "Easy walk (optional)", detail: "20–40 min at a conversational pace, outside if you can." },
    { label: "Mobility flow (optional)", detail: "10–15 min for hips, ankles, upper back and shoulders. Gentle, never forced." },
    { label: "Sleep", detail: "Aim for 8–9 hours in bed. Growth and recovery happen here." },
    { label: "Food and water", detail: "Hit your calorie and protein targets and drink plenty. Rest days count for the gain." },
    { label: "Look back at the week", detail: "Check your lifts, bodyweight trend and how you felt, then plan next week's loads." },
    { label: "Sauna or stretching (optional)", detail: "15–20 min if it helps you unwind. Skip it if it leaves you drained." },
  ],
};
