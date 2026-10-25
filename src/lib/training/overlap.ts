// Fatigue overlap: Monday/Thursday arm work → Tuesday/Friday chest and back
// (docs/PROGRAM-ARNOLD.md §4.6, Q§1, Q§3). Pure. Three entry points:
//   overlapPreStart   — before the session: arms still sore after an arm day → one set fewer
//   overlapInSession  — during it: the first two sets of a watched lift dropped → reorder / trim
//   overlapNextArmDay — prevention: pressing or pulling dipped after 2 of the last 3 arm days
// Every rule reads what was ACTUALLY trained the day before, so it stays right after the days
// are rearranged. Suggestions only: nothing here edits a template or a logged set.

import { addDays, dayName, type ISODate } from "@/lib/dates";
import { getExercise } from "./library";
import { templateDef } from "./programs";
import { e1rm, groupSessions, type PastSet } from "./progression";
import type { DayFamily, MuscleGroup, TemplateExercise } from "./types";

export const OVERLAP = { repDrop: 2, e1rmDropPct: 0.03, soreness: 4, restShorterSec: 45, window: 3, hits: 2 } as const;

export type OverlapAction = { kind: "drop"; slug: string; sets: number } | { kind: "reorder"; move: string; before: string } | { kind: "rir"; slug: string; rir: string };

export interface OverlapAdvice {
  muscle: "triceps" | "biceps" | "both";
  trigger: "soreness" | "press_dip" | "pull_dip" | "pattern";
  actions: OverlapAction[];
  /** One sentence, numbers first, no exclamation marks. */
  text: string;
  evidence: { slug: string; name: string; weightLb: number; reps: number; refReps: number }[];
}

export interface OverlapTemplate {
  key: string;
  name: string;
  family?: DayFamily | null;
  exercises: TemplateExercise[];
}

/** A logged set (exercise_sets or set_history row). */
export interface OverlapSet {
  id?: string | null;
  session_id: string;
  exercise_slug: string;
  set_index: number;
  weight_lb: number | string | null;
  reps: number | null;
  kind?: string | null;
  completed?: boolean | null;
  completed_at?: string | null;
}

export interface OverlapSession {
  id: string;
  local_date: ISODate;
  status: string;
  name?: string | null;
  template_key: string | null;
  mode?: string | null;
}

const ARM: MuscleGroup[] = ["biceps", "brachialis", "triceps"];
const PRESS: MuscleGroup[] = ["chest", "upper_chest"];
const PULL: MuscleGroup[] = ["lats", "upper_back"];

const familyOf = (t: { key: string | null; family?: DayFamily | null }) => t.family ?? templateDef(t.key)?.family ?? null;
const isWork = (s: OverlapSet) => s.completed !== false && s.kind !== "warmup";
const num = (v: number | string | null | undefined) => (v == null || v === "" ? 0 : Number(v));

const has = (slug: string, muscles: MuscleGroup[], category?: "compound" | "isolation") => {
  const lib = getExercise(slug);
  return !!lib && (!category || lib.category === category) && lib.primary.some((m) => muscles.includes(m));
};

/** A done session that trained arms: an arm-day template, or 6+ completed working arm sets (rearranged or edited weeks). */
export function isArmSession(session: Pick<OverlapSession, "template_key" | "status">, sets: OverlapSet[]): boolean {
  if (session.status !== "done") return false;
  if (familyOf({ key: session.template_key }) === "shoulders_arms") return true;
  return sets.filter((s) => isWork(s) && has(s.exercise_slug, ARM)).length >= 6;
}

/** The lifts the rules watch and trim on a chest-and-back day. */
export function overlapLifts(t: Pick<OverlapTemplate, "exercises">) {
  const xs = t.exercises.filter((e) => !e.optional);
  const presses = xs.filter((e) => has(e.slug, PRESS, "compound"));
  const pulls = xs.filter((e) => has(e.slug, PULL, "compound"));
  return {
    press: presses[0] ?? null,
    pull: pulls[0] ?? null,
    /** The last pressing compound after the first one (Machine Chest Press, Flat DB Bench). */
    pressAccessory: presses.length > 1 ? presses[presses.length - 1] : null,
    /** The last pulling compound after the first two (Single-Arm Cable Lat Pulldown, Single-Arm Cable Row). */
    pullAccessory: pulls.length > 2 ? pulls[pulls.length - 1] : null,
    /** The day's chest isolation (Low-to-High Cable Fly, Pec Deck). */
    chestIsolation: xs.find((e) => has(e.slug, PRESS, "isolation")) ?? null,
  };
}

/** Chest and back today, after an arm day yesterday. PPL days never qualify. */
export function overlapApplies(template: Pick<OverlapTemplate, "key" | "family"> | null, yesterday: { session: Pick<OverlapSession, "template_key" | "status">; sets: OverlapSet[] } | null): boolean {
  if (!template || familyOf(template) !== "chest_back") return false;
  return !!yesterday && isArmSession(yesterday.session, yesterday.sets);
}

const join = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/* -------------------------------------------------------------- 1. pre-start */

export function overlapPreStart({
  today,
  template,
  yesterday,
  checkin,
}: {
  today: ISODate;
  template: OverlapTemplate | null;
  yesterday: { session: OverlapSession; sets: OverlapSet[] } | null;
  checkin: { local_date: ISODate; soreness: number | null } | null;
}): OverlapAdvice | null {
  if (!template || !overlapApplies(template, yesterday)) return null;
  if (!checkin || checkin.local_date !== today || (checkin.soreness ?? 0) < OVERLAP.soreness) return null;
  const l = overlapLifts(template);
  const trim = [l.pressAccessory, l.pullAccessory].filter((e): e is TemplateExercise => !!e && e.sets > 1);
  if (!trim.length) return null;
  return {
    muscle: "both",
    trigger: "soreness",
    actions: trim.map((e) => ({ kind: "drop", slug: e.slug, sets: 1 })),
    text: `Arms still sore from ${yesterday!.session.name ?? "yesterday's session"}. Today: one set fewer on ${join(trim.map((e) => e.name))}.`,
    evidence: [],
  };
}

/* ------------------------------------------------------------ 2. in session */

/** Seconds since the previous logged set of the same session, for each set (null for the first or after a break). */
function restBefore(sets: OverlapSet[]): Map<OverlapSet, number | null> {
  const out = new Map<OverlapSet, number | null>();
  const timed = sets.filter((s) => s.completed_at).sort((a, b) => Date.parse(a.completed_at!) - Date.parse(b.completed_at!));
  timed.forEach((s, i) => {
    const prev = timed[i - 1];
    const gap = prev && prev.session_id === s.session_id ? (Date.parse(s.completed_at!) - Date.parse(prev.completed_at!)) / 1000 : null;
    out.set(s, gap != null && gap <= 15 * 60 ? gap : null);
  });
  return out;
}

/** Whether a set dipped against the same set last time (§4.6 rule 2). */
export function setDipped(set: { weight_lb: number | string | null; reps: number | null }, ref: { weight_lb: number | string | null; reps: number | null }): boolean {
  const w = num(set.weight_lb);
  const r = num(set.reps);
  const rw = num(ref.weight_lb);
  const rr = num(ref.reps);
  if (!(rw > 0) || !(rr > 0) || !(r > 0)) return false;
  if (w >= rw - 0.1) return r <= rr - OVERLAP.repDrop;
  const a = e1rm(w, r);
  const b = e1rm(rw, rr);
  return a != null && b != null && a <= b * (1 - OVERLAP.e1rmDropPct);
}

/**
 * Both of the first two working sets of a watched lift dipped against the same sets of its last
 * real session (any program: same slug, same movement). Set 2 is not judged when it followed a
 * rest 45 s or more shorter than last time's.
 */
function liftDipped(sessionSets: OverlapSet[], slug: string, prior: PastSet[], sessionId: string | null): { dipped: boolean; set?: OverlapSet; ref?: PastSet } {
  const mine = sessionSets.filter((s) => s.exercise_slug === slug && isWork(s) && s.completed).sort((a, b) => a.set_index - b.set_index);
  if (mine.length < 2) return { dipped: false };
  const refSession = groupSessions(prior.filter((p) => p.session_id !== sessionId)).find((s) => s[0]?.mode !== "deload");
  if (!refSession) return { dipped: false };
  const [s1, s2] = mine;
  const r1 = refSession.find((p) => p.set_index === s1.set_index);
  const r2 = refSession.find((p) => p.set_index === s2.set_index);
  if (!r1 || !r2) return { dipped: false };
  const restNow = restBefore(sessionSets).get(s2) ?? null;
  const refRest = r2.completed_at && r1.completed_at ? (Date.parse(r2.completed_at) - Date.parse(r1.completed_at)) / 1000 : null;
  if (restNow != null && refRest != null && refRest - restNow >= OVERLAP.restShorterSec) return { dipped: false };
  return { dipped: setDipped(s1, r1) && setDipped(s2, r2), set: s2, ref: r2 };
}

export function overlapInSession({
  template,
  sets,
  prior,
  yesterday,
  sessionId = null,
  fired = [],
}: {
  template: OverlapTemplate | null;
  /** This session's sets (exercise_sets rows). */
  sets: OverlapSet[];
  /** Recent history per slug (usePriorHistory / fetchRecentHistory). */
  prior: Record<string, PastSet[]>;
  yesterday: { session: OverlapSession; sets: OverlapSet[] } | null;
  sessionId?: string | null;
  /** Muscles already advised this session (each fires at most once). */
  fired?: ("triceps" | "biceps")[];
}): OverlapAdvice | null {
  if (!template || !overlapApplies(template, yesterday)) return null;
  const l = overlapLifts(template);
  const when = yesterday ? dayName(yesterday.session.local_date) : "yesterday";
  const open = (slug: string) => sets.filter((s) => s.exercise_slug === slug && isWork(s) && !s.completed).length;
  const total = (slug: string) => sets.filter((s) => s.exercise_slug === slug && isWork(s)).length;
  const canDrop = (slug: string) => open(slug) > 0 && total(slug) > 1;
  const started = (slug: string) => sets.some((s) => s.exercise_slug === slug && isWork(s) && s.completed);

  const checks: { muscle: "triceps" | "biceps"; lift: TemplateExercise | null; acc: TemplateExercise | null }[] = [
    { muscle: "triceps", lift: l.press, acc: l.pressAccessory },
    { muscle: "biceps", lift: l.pull, acc: l.pullAccessory },
  ];
  for (const c of checks) {
    if (!c.lift || !c.acc || fired.includes(c.muscle)) continue;
    if (!canDrop(c.acc.slug)) continue; // the exercises it would change are already done
    const d = liftDipped(sets, c.lift.slug, prior[c.lift.slug] ?? [], sessionId);
    if (!d.dipped || !d.set || !d.ref) continue;
    const down = num(d.ref.reps) - num(d.set.reps);
    const w = num(d.set.weight_lb);
    const evidence = [{ slug: c.lift.slug, name: c.lift.name, weightLb: w, reps: num(d.set.reps), refReps: num(d.ref.reps) }];
    const drop: OverlapAction = { kind: "drop", slug: c.acc.slug, sets: 1 };
    const downText = down > 0 ? `down ${down} ${down === 1 ? "rep" : "reps"} at ${w} lb` : `down at ${w} lb`;
    if (c.muscle === "triceps") {
      const fly = l.chestIsolation;
      const order = template.exercises.map((e) => e.slug);
      const reorder = fly && !started(fly.slug) && order.indexOf(fly.slug) > order.indexOf(c.acc.slug) ? [{ kind: "reorder" as const, move: fly.slug, before: c.acc.slug }] : [];
      return {
        muscle: "triceps",
        trigger: "press_dip",
        actions: [...reorder, drop],
        text: `Triceps look tired from ${when}: ${c.lift.name} is ${downText}. ${reorder.length ? "Try the fly next and one" : "One"} set fewer on ${c.acc.name}.`,
        evidence,
      };
    }
    return {
      muscle: "biceps",
      trigger: "pull_dip",
      actions: [drop],
      text: `Biceps look tired from ${when}: ${c.lift.name} is ${downText}. One set fewer on ${c.acc.name}.`,
      evidence,
    };
  }
  return null;
}

/* ------------------------------------------------------------ 3. prevention */

export function overlapNextArmDay({
  sessions,
  sets,
  template,
}: {
  /** Done sessions, any order (8 weeks is plenty). */
  sessions: OverlapSession[];
  /** Their completed working sets (set_history rows). */
  sets: OverlapSet[];
  /** Today's template. */
  template: OverlapTemplate | null;
}): OverlapAdvice | null {
  if (!template || familyOf(template) !== "shoulders_arms") return null;
  const done = sessions.filter((s) => s.status === "done").sort((a, b) => b.local_date.localeCompare(a.local_date));
  const setsOf = new Map<string, OverlapSet[]>();
  for (const s of sets) setsOf.set(s.session_id, [...(setsOf.get(s.session_id) ?? []), s]);
  const modeOf = new Map(done.map((s) => [s.id, s.mode ?? "standard"]));
  const dateOf = new Map(done.map((s) => [s.id, s.local_date]));

  // the last chest-and-back sessions that followed an arm day
  const followed = done.filter((s) => {
    if (familyOf({ key: s.template_key }) !== "chest_back") return false;
    const y = addDays(s.local_date, -1);
    return done.some((p) => p.local_date === y && isArmSession(p, setsOf.get(p.id) ?? []));
  });
  const recent = followed.slice(0, OVERLAP.window);
  if (recent.length < OVERLAP.hits) return null;

  const history = (slug: string, before: ISODate): PastSet[] =>
    sets
      .filter((x) => x.exercise_slug === slug && isWork(x) && (dateOf.get(x.session_id) ?? "9999") < before)
      .map((x) => ({ local_date: dateOf.get(x.session_id)!, session_id: x.session_id, set_index: x.set_index, weight_lb: num(x.weight_lb), reps: x.reps, duration_sec: null, rir: null, mode: (modeOf.get(x.session_id) ?? "standard") as PastSet["mode"], completed_at: x.completed_at ?? null }));

  let pressHits = 0;
  let pullHits = 0;
  for (const s of recent) {
    const def = templateDef(s.template_key);
    if (!def) continue;
    const l = overlapLifts(def);
    const mine = (setsOf.get(s.id) ?? []).map((x) => ({ ...x, completed: true }));
    if (l.press && liftDipped(mine, l.press.slug, history(l.press.slug, s.local_date), s.id).dipped) pressHits++;
    if (l.pull && liftDipped(mine, l.pull.slug, history(l.pull.slug, s.local_date), s.id).dipped) pullHits++;
  }

  const xs = template.exercises.filter((e) => !e.optional);
  const press = xs.find((e) => has(e.slug, ["front_delts"], "compound")) ?? null;
  const curl = xs.find((e) => has(e.slug, ["biceps"], "isolation")) ?? null;
  const actions: OverlapAction[] = [];
  const parts: string[] = [];
  const of = recent.length;
  if (pressHits >= OVERLAP.hits && press && press.sets > 1) {
    actions.push({ kind: "drop", slug: press.slug, sets: 1 }, { kind: "rir", slug: press.slug, rir: "2–3" });
    parts.push(`one set fewer on ${press.name} and stop with 2–3 reps left`);
  }
  if (pullHits >= OVERLAP.hits && curl && curl.sets > 1) {
    actions.push({ kind: "drop", slug: curl.slug, sets: 1 });
    parts.push(`one set fewer on ${curl.name}`);
  }
  if (!actions.length) return null;
  const what = pressHits >= OVERLAP.hits && pullHits >= OVERLAP.hits ? "pressing and pulling" : pressHits >= OVERLAP.hits ? "pressing" : "pulling";
  const hits = Math.max(pressHits >= OVERLAP.hits ? pressHits : 0, pullHits >= OVERLAP.hits ? pullHits : 0);
  return {
    muscle: pressHits >= OVERLAP.hits && pullHits >= OVERLAP.hits ? "both" : pressHits >= OVERLAP.hits ? "triceps" : "biceps",
    trigger: "pattern",
    actions,
    text: `Your ${what} dropped the day after arm day ${hits} of the last ${of} times. Today: ${parts.join(", and ")}.`,
    evidence: [],
  };
}

/** The StartOptions.adjust an advice's actions translate to ("Start with this"). */
export function adjustFromAdvice(a: OverlapAdvice | null, exercises: TemplateExercise[]): { dropSets?: Record<string, number>; rir?: Record<string, string>; order?: string[] } | undefined {
  if (!a) return undefined;
  const dropSets: Record<string, number> = {};
  const rir: Record<string, string> = {};
  let order: string[] | undefined;
  for (const x of a.actions) {
    if (x.kind === "drop") dropSets[x.slug] = (dropSets[x.slug] ?? 0) + x.sets;
    else if (x.kind === "rir") rir[x.slug] = x.rir;
    else {
      const slugs = (order ?? exercises.map((e) => e.slug)).filter((s) => s !== x.move);
      const i = slugs.indexOf(x.before);
      slugs.splice(i < 0 ? slugs.length : i, 0, x.move);
      order = slugs;
    }
  }
  return { ...(Object.keys(dropSets).length ? { dropSets } : {}), ...(Object.keys(rir).length ? { rir } : {}), ...(order ? { order } : {}) };
}
