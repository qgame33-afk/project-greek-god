import { describe, expect, it } from "vitest";
import pplFixture from "../../../scripts/dev/fixtures/ppl-rows-2026-10.json";
import { getExercise, LIBRARY } from "./library";
import {
  activeProgram,
  carriedSwaps,
  counterpartKey,
  DEFAULT_PROGRAM,
  effortDefaults,
  estimateDurationMin,
  exerciseDisplayName,
  pickableLibrary,
  PROGRAM_IDS,
  programOfKey,
  programSince,
  PROGRAMS,
  resolvePlanKey,
  rirRange,
  scheduleFor,
  suggestOptional,
  SUNDAY_RECOVERY,
  TEMPLATE_DEFS,
  templateDef,
  templateLabels,
  TWOSET_SCHEDULE,
  visibleExercises,
  visibleWarmup,
} from "./programs";
import type { TemplateExercise, TemplateKey, WarmupStep } from "./types";

/** Quinton's table (S/program-v3.md §2–§4, docs/PROGRAM-V3.md §1), copied literally: his exercises in his order, 2 working sets each. */
const ARMS = [
  { slug: "seated-db-shoulder-press", name: "Seated Dumbbell Shoulder Press", sets: 2, repLow: 6, repHigh: 10, unit: "reps" },
  { slug: "incline-db-curl", name: "Incline Dumbbell Curl", sets: 2, repLow: 8, repHigh: 12, unit: "reps" },
  { slug: "overhead-cable-triceps-extension", name: "Overhead Cable Triceps Extension", sets: 2, repLow: 10, repHigh: 15, unit: "reps" },
  { slug: "db-lateral-raise", name: "Dumbbell Lateral Raise", sets: 2, repLow: 12, repHigh: 20, unit: "reps" },
  { slug: "cable-curl", name: "Cable Biceps Curl", sets: 2, repLow: 10, repHigh: 15, unit: "reps" },
  { slug: "cable-triceps-pushdown", name: "Cable Triceps Pushdown", sets: 2, repLow: 10, repHigh: 15, unit: "reps" },
];
const CHEST_BACK = [
  { slug: "incline-db-press", name: "Incline Dumbbell Press", sets: 2, repLow: 6, repHigh: 10, unit: "reps" },
  { slug: "lat-pulldown", name: "Lat Pulldown", sets: 2, repLow: 8, repHigh: 12, unit: "reps" },
  { slug: "machine-chest-press", name: "Machine Chest Press", sets: 2, repLow: 8, repHigh: 12, unit: "reps" },
  { slug: "seated-cable-row", name: "Seated Cable Row", sets: 2, repLow: 8, repHigh: 12, unit: "reps" },
  { slug: "cable-chest-fly", name: "Cable Chest Fly", sets: 2, repLow: 10, repHigh: 15, unit: "reps" },
  { slug: "straight-arm-pulldown", name: "Straight-Arm Cable Pulldown", sets: 2, repLow: 12, repHigh: 15, unit: "reps" },
];
const LEGS = [
  { slug: "back-squat", name: "Barbell Back Squat", sets: 2, repLow: 6, repHigh: 10, unit: "reps" },
  { slug: "romanian-deadlift", name: "Romanian Deadlift", sets: 2, repLow: 8, repHigh: 12, unit: "reps" },
  // 8–12 per leg; one set covers both legs
  { slug: "walking-lunge", name: "Dumbbell Walking Lunges", sets: 2, repLow: 8, repHigh: 12, unit: "each" },
  { slug: "standing-calf-raise", name: "Standing Calf Raises", sets: 2, repLow: 10, repHigh: 20, unit: "reps" },
];
const DAY = {
  shoulders_arms: { name: "Arms & Shoulders", abbr: "Arms", exercises: ARMS },
  chest_back: { name: "Chest & Back", abbr: "Chest", exercises: CHEST_BACK },
  legs: { name: "Legs", abbr: "Legs", exercises: LEGS },
} as const;
const SPEC = (
  [
    ["arms_a", "shoulders_arms", 1, "Monday"],
    ["chest_a", "chest_back", 2, "Tuesday"],
    ["lower_a", "legs", 3, "Wednesday"],
    ["arms_b", "shoulders_arms", 4, "Thursday"],
    ["chest_b", "chest_back", 5, "Friday"],
    ["lower_b", "legs", 6, "Saturday"],
  ] as const
).map(([key, family, weekday, subtitle]) => ({ key, name: DAY[family].name, short: DAY[family].name, abbr: DAY[family].abbr, family, weekday, subtitle, exercises: DAY[family].exercises }));

/** His effort rules (§5): failure on isolation and stable machine/cable lifts, 1–2 RIR on the squat, RDL and lunges; the dumbbell presses are PROGRAM's "0–1" (flagged). */
const RIR: Record<string, string> = {
  "seated-db-shoulder-press": "0–1",
  "incline-db-press": "0–1",
  "back-squat": "1–2",
  "romanian-deadlift": "1–2",
  "walking-lunge": "1–2",
};

describe("the two-set split (program-v3 §1–§5)", () => {
  it("is the default program, with Quinton's exercises, order, sets and rep ranges on each day", () => {
    const got = PROGRAMS.twoset.templates.map((t) => ({
      key: t.key,
      name: t.name,
      short: t.short,
      abbr: t.abbr,
      family: t.family,
      weekday: t.weekday,
      subtitle: t.subtitle,
      exercises: t.exercises.map((e) => ({ slug: e.slug, name: e.name, sets: e.sets, repLow: e.repLow, repHigh: e.repHigh, unit: e.unit })),
    }));
    expect(got).toEqual(SPEC);
    expect(DEFAULT_PROGRAM).toBe("twoset");
  });

  it("schedules Arms & Shoulders Mon/Thu, Chest & Back Tue/Fri, Legs Wed/Sat and rests on Sunday", () => {
    expect(TWOSET_SCHEDULE).toEqual({ "1": "arms_a", "2": "chest_a", "3": "lower_a", "4": "arms_b", "5": "chest_b", "6": "lower_b", "0": "rest" });
    const names = ["0", "1", "2", "3", "4", "5", "6"].map((d) => (TWOSET_SCHEDULE[d] === "rest" ? "Rest" : TEMPLATE_DEFS[TWOSET_SCHEDULE[d] as TemplateKey].name));
    expect(names).toEqual(["Rest", "Arms & Shoulders", "Chest & Back", "Legs", "Arms & Shoulders", "Chest & Back", "Legs"]);
    expect(PROGRAMS.twoset.name).toBe("Two-set split");
    expect(PROGRAMS.ppl.name).toBe("Push/Pull/Legs");
    expect(PROGRAM_IDS).toEqual(["twoset", "ppl"]);
  });

  it("has the same content in both rotations, with no optional or extra lifts", () => {
    const strip = (k: TemplateKey) => JSON.stringify({ ...TEMPLATE_DEFS[k], key: null, weekday: null, subtitle: null });
    expect(strip("arms_a")).toBe(strip("arms_b"));
    expect(strip("chest_a")).toBe(strip("chest_b"));
    expect(strip("lower_a")).toBe(strip("lower_b"));
    for (const t of PROGRAMS.twoset.templates) for (const e of t.exercises) expect(e.optional, e.slug).toBeFalsy();
  });

  it("totals 12 + 12 + 8 working sets per rotation, 64 a week", () => {
    const perDay = PROGRAMS.twoset.templates.map((t) => t.exercises.reduce((n, e) => n + e.sets, 0));
    expect(perDay).toEqual([12, 12, 8, 12, 12, 8]);
    expect(perDay.reduce((a, b) => a + b, 0)).toBe(64);
    for (const t of PROGRAMS.twoset.templates) expect(estimateDurationMin(t)).toBeLessThanOrEqual(50);
  });

  it("uses only library lifts that are not retired", () => {
    for (const s of PROGRAMS.twoset.templates.flatMap((t) => t.exercises.map((e) => e.slug))) {
      expect(getExercise(s), s).toBeDefined();
      expect(getExercise(s)!.retired, s).toBeFalsy();
    }
  });

  it("sets effort by his rules and rest at 150–180 s for heavy compounds, 90–120 s for isolation", () => {
    for (const e of PROGRAMS.twoset.templates.flatMap((t) => t.exercises)) {
      const lib = getExercise(e.slug)!;
      expect(e.rir, e.slug).toBe(RIR[e.slug] ?? "0");
      if (lib.category === "compound") expect(e.rest >= 150 && e.rest <= 180, e.slug).toBe(true);
      else expect(e.rest >= 90 && e.rest <= 120, e.slug).toBe(true);
      // a lift added later from the library gets the same effort and a rest in the same band
      expect(effortDefaults(lib).rir, e.slug).toBe(e.rir);
      const r = effortDefaults(lib).rest;
      expect(lib.category === "compound" ? r >= 150 && r <= 180 : r >= 90 && r <= 120, e.slug).toBe(true);
    }
  });

  it("keeps a warm-up and notes for every day, and warm-ups are not working sets", () => {
    for (const t of PROGRAMS.twoset.templates) {
      expect(t.warmup.length).toBeGreaterThanOrEqual(3);
      expect(t.notes[0]).toBe("Two working sets per exercise. Warm-up sets don't count.");
    }
    expect(TEMPLATE_DEFS.lower_a.warmup.find((w) => w.label === "Squat ramp-up")?.detail).toMatch(/^Empty bar ×10/);
    expect(TEMPLATE_DEFS.lower_a.exercises.find((e) => e.slug === "walking-lunge")!.note).toMatch(/per leg; one set covers both legs/);
  });

  it("has a Sunday of optional recovery, with no volleyball or jumps", () => {
    expect(SUNDAY_RECOVERY.title).toBe("Rest and recovery");
    expect(SUNDAY_RECOVERY.items).toHaveLength(6);
    expect(JSON.stringify(SUNDAY_RECOVERY)).not.toMatch(/volley|jump/i);
    expect(JSON.stringify(PROGRAMS.twoset)).not.toMatch(/volley|jump|arnold/i);
    expect(JSON.stringify(PROGRAMS.ppl)).not.toMatch(/volley|box.?jump|broad.?jump|approach.?jump/i);
  });
});

describe("library", () => {
  it("adds the straight-arm cable pulldown for his Chest & Back day", () => {
    const e = getExercise("straight-arm-pulldown")!;
    expect(e).toMatchObject({ name: "Straight-Arm Cable Pulldown", category: "isolation", equipment: "cable" });
    expect(e.primary).toContain("lats");
    expect(e.instructions.length).toBeGreaterThanOrEqual(3);
    expect(e.formTips.length).toBeGreaterThanOrEqual(2);
    for (const sub of e.substitutes) expect(getExercise(sub), sub).toBeDefined();
  });

  it("keeps the earlier lifts with 3–5 steps, 2–4 tips and existing substitutes", () => {
    for (const s of ["cable-rear-delt-fly", "single-arm-overhead-cable-triceps-extension", "cross-body-hammer-curl"]) {
      const e = getExercise(s)!;
      expect(e.instructions.length).toBeGreaterThanOrEqual(3);
      expect(e.instructions.length).toBeLessThanOrEqual(5);
      expect(e.formTips.length).toBeGreaterThanOrEqual(2);
      expect(e.formTips.length).toBeLessThanOrEqual(4);
      for (const sub of e.substitutes) expect(getExercise(sub), sub).toBeDefined();
    }
    expect(getExercise("reverse-pec-deck")!.substitutes).toContain("cable-rear-delt-fly");
    expect(getExercise("overhead-cable-triceps-extension")!.substitutes).toContain("single-arm-overhead-cable-triceps-extension");
  });

  it("never says volleyball, and keeps the jumps only for history", () => {
    expect(LIBRARY.filter((e) => /volley/i.test(e.name))).toEqual([]);
    expect(getExercise("approach-jump")!.name).toBe("Approach Jump");
    const retired = LIBRARY.filter((e) => e.retired).map((e) => e.slug).sort();
    expect(retired).toEqual(["approach-jump", "box-jump", "broad-jump", "squat-jump"]);
    expect(pickableLibrary().some((e) => e.retired)).toBe(false);
    expect(pickableLibrary()).toHaveLength(LIBRARY.length - 4);
    for (const e of pickableLibrary()) for (const s of e.substitutes) expect(getExercise(s)?.retired, `${e.slug} → ${s}`).toBeFalsy();
  });
});

describe("the active program (§2.3)", () => {
  const PPL = { "1": "push_a", "2": "pull_a", "3": "legs_a", "4": "push_b", "5": "pull_b", "6": "legs_b", "0": "rest" };
  it("prefers prefs.program, else infers from the week, else the two-set split", () => {
    expect(activeProgram({ prefs: { program: "ppl" }, weekly_schedule: TWOSET_SCHEDULE })).toBe("ppl");
    expect(activeProgram({ prefs: {}, weekly_schedule: { "1": "arms_a" } })).toBe("twoset");
    expect(activeProgram({ prefs: { program: "arnold" }, weekly_schedule: { "1": "shoulders_arms_a" } })).toBe("twoset");
    expect(activeProgram({ prefs: null, weekly_schedule: PPL })).toBe("ppl");
    expect(activeProgram({ prefs: {}, weekly_schedule: {} })).toBe("twoset");
    expect(activeProgram(null)).toBe("twoset");
    expect(activeProgram({ prefs: { program: "volleyball" }, weekly_schedule: PPL })).toBe("ppl");
  });

  it("knows when the program started, only for the program that is active", () => {
    const sw = { from: "ppl", to: "twoset", at: "2026-10-22T13:00:00Z", date: "2026-10-22", frozen: 13, mapped: 1 };
    expect(programSince({ program: "twoset", programSwitch: sw })).toBe("2026-10-22");
    expect(programSince({ program: "ppl", programSwitch: sw })).toBeNull();
    expect(programSince({})).toBeNull();
  });

  it("merges the weekly schedule over the active program's default week", () => {
    expect(scheduleFor({ weekly_schedule: { "3": "rest" } })).toEqual({ ...TWOSET_SCHEDULE, "3": "rest" });
    expect(scheduleFor({ weekly_schedule: { "1": "push_a" } })["2"]).toBe("pull_a");
  });

  it("maps every slot to the other program and back (a bijection)", () => {
    const keys = [...PROGRAMS.twoset.keys, ...PROGRAMS.ppl.keys] as TemplateKey[];
    for (const k of keys) {
      const to = programOfKey(k) === "twoset" ? "ppl" : "twoset";
      expect(counterpartKey(counterpartKey(k, to), programOfKey(k)!)).toBe(k);
    }
    expect(counterpartKey("push_b", "twoset")).toBe("arms_b");
    expect(counterpartKey("chest_a", "ppl")).toBe("pull_a");
    expect(counterpartKey("legs_a", "twoset")).toBe("lower_a");
    expect(new Set(PROGRAMS.ppl.keys.map((k) => counterpartKey(k, "twoset"))).size).toBe(6);
    expect(programOfKey("shoulders_arms_a")).toBeNull();
    expect(templateDef("nope")).toBeUndefined();
  });
});

describe("resolvePlanKey (§2.4)", () => {
  const ctx = { program: "twoset" as const, since: "2026-10-22" };
  const week = scheduleFor({ weekly_schedule: TWOSET_SCHEDULE });
  it("lets the override win", () => {
    expect(resolvePlanKey("2026-10-24", week, { template_key: "rest" }, ctx)).toBe("rest");
    expect(resolvePlanKey("2026-10-24", week, { template_key: "chest_a" }, ctx)).toBe("chest_a");
  });
  it("maps an other-program key on or after the switch, never before it or on the switch's own rows", () => {
    expect(resolvePlanKey("2026-10-22", week, { template_key: "push_b", note: null }, ctx)).toBe("arms_b");
    expect(resolvePlanKey("2026-10-30", week, { template_key: "pull_a" }, ctx)).toBe("chest_a");
    expect(resolvePlanKey("2026-10-21", week, { template_key: "pull_a" }, ctx)).toBe("pull_a");
    expect(resolvePlanKey("2026-10-22", week, { template_key: "pull_a", note: "program-switch" }, ctx)).toBe("pull_a");
    expect(resolvePlanKey("2026-10-30", week, { template_key: "pull_a" }, { program: "twoset", since: null })).toBe("pull_a");
  });
  it("falls back to the weekly schedule, then rest", () => {
    expect(resolvePlanKey("2026-10-26", week, null, ctx)).toBe("arms_a"); // Monday
    expect(resolvePlanKey("2026-10-25", week, undefined, ctx)).toBe("rest"); // Sunday
    expect(resolvePlanKey("2026-10-26", {}, null, ctx)).toBe("rest");
  });
});

describe("stored rows (§1.10)", () => {
  const rows = pplFixture as { key: string; name: string; warmup: WarmupStep[]; exercises: TemplateExercise[] }[];
  it("hides the jumps and their warm-up without touching the stored row", () => {
    const legsA = rows.find((r) => r.key === "legs_a")!;
    const before = JSON.stringify(legsA);
    expect(legsA.exercises.map((e) => e.slug)).toContain("box-jump");
    expect(visibleExercises(legsA.exercises).map((e) => e.slug)).not.toContain("box-jump");
    expect(visibleExercises(legsA.exercises).map((e) => e.slug)).not.toContain("approach-jump");
    const w = visibleWarmup(legsA.warmup);
    expect(w.map((x) => x.label)).not.toContain("Jump prep");
    expect(w.find((x) => x.label === "Squat ramp-up")!.detail).toMatch(/^Empty bar ×10/);
    expect(JSON.stringify(legsA)).toBe(before);
    const legsB = rows.find((r) => r.key === "legs_b")!;
    expect(visibleExercises(legsB.exercises).map((e) => e.slug)).not.toContain("broad-jump");
  });
});

describe("labels, effort and names", () => {
  it("uses the built-in short and strip names, or his own name when he renamed a day", () => {
    expect(templateLabels({ key: "arms_a", name: "Arms & Shoulders" })).toEqual({ name: "Arms & Shoulders", short: "Arms & Shoulders", abbr: "Arms", family: "shoulders_arms" });
    expect(templateLabels({ key: "lower_b", name: "Legs" })).toEqual({ name: "Legs", short: "Legs", abbr: "Legs", family: "legs" });
    expect(templateLabels({ key: "pull_b", name: "Pull B (Q)" })).toEqual({ name: "Pull B (Q)", short: "Pull B (Q)", abbr: "Pull", family: "pull" });
    expect(templateLabels({ key: "chest_b", name: "Upper day" })).toMatchObject({ short: "Upper day", abbr: "Upper", family: "chest_back" });
    for (const t of PROGRAMS.twoset.templates) expect(t.abbr.length).toBeLessThanOrEqual(5);
  });

  it("derives effort defaults from the library category", () => {
    expect(effortDefaults(getExercise("back-squat")!)).toEqual({ rir: "1–2", rest: 180 });
    expect(effortDefaults(getExercise("hack-squat")!).rir).toBe("0");
    expect(effortDefaults(getExercise("db-bench-press")!)).toMatchObject({ rir: "0–1" });
    expect(effortDefaults(getExercise("cable-lateral-raise")!)).toEqual({ rir: "0", rest: 90 });
    expect(effortDefaults(getExercise("cable-crunch")!)).toEqual({ rir: "0", rest: 90 });
    expect(effortDefaults(getExercise("farmer-carry")!)).toEqual({ rir: "1–2", rest: 90 });
    expect(effortDefaults(getExercise("box-jump")!).rir).toBe("Fresh");
  });

  it("parses RIR text", () => {
    expect(rirRange("1–3")).toEqual([1, 3]);
    expect(rirRange("0–1")).toEqual([0, 1]);
    expect(rirRange("0")).toEqual([0, 0]);
    expect(rirRange("0–2")).toEqual([0, 2]);
    expect(rirRange("3")).toEqual([3, 3]);
    expect(rirRange("Fresh")).toBeNull();
    expect(rirRange(null)).toBeNull();
  });

  it("titles a lift with the active program's name, else the library's", () => {
    expect(exerciseDisplayName("walking-lunge", PROGRAMS.twoset.templates)).toBe("Dumbbell Walking Lunges");
    expect(exerciseDisplayName("cable-chest-fly", PROGRAMS.twoset.templates)).toBe("Cable Chest Fly");
    expect(exerciseDisplayName("barbell-bench-press", PROGRAMS.twoset.templates)).toBe("Barbell Bench Press");
  });

  it("offers the optional lift only on a normal day with a go (or no) check-in", () => {
    expect(suggestOptional("standard", "go")).toBe(true);
    expect(suggestOptional("standard", "unknown")).toBe(true);
    expect(suggestOptional("standard", null)).toBe(true);
    for (const l of ["trim", "legs", "ease", "recover", "rest"] as const) expect(suggestOptional("standard", l)).toBe(false);
    expect(suggestOptional("intro", "go")).toBe(false);
    expect(suggestOptional("deload", "go")).toBe(false);
  });
});

describe("carriedSwaps (§3.7)", () => {
  const ppl = PROGRAMS.ppl.templates.map((t) => ({ key: t.key, exercises: t.exercises }));
  const twoset = PROGRAMS.twoset.templates.map((t) => ({ key: t.key, exercises: t.exercises }));
  it("finds a swap he made in PPL of a lift the two-set split also uses", () => {
    const pushA = ppl.find((t) => t.key === "push_a")!;
    const swapped = { ...pushA, exercises: pushA.exercises.map((e) => (e.slug === "cable-triceps-pushdown" ? { ...e, slug: "rope-triceps-pushdown", name: "Rope Triceps Pushdowns" } : e)) };
    const out = carriedSwaps([swapped], twoset);
    expect(out).toEqual([{ from: "cable-triceps-pushdown", to: "rope-triceps-pushdown", keys: ["arms_a", "arms_b"] }]);
  });
  it("ignores unchanged rows, set changes and swaps of lifts the two-set split doesn't use", () => {
    expect(carriedSwaps(ppl, twoset)).toEqual([]);
    const pushA = ppl.find((t) => t.key === "push_a")!;
    const moreSets = { ...pushA, exercises: pushA.exercises.map((e) => ({ ...e, sets: e.sets + 1 })) };
    expect(carriedSwaps([moreSets], twoset)).toEqual([]);
    const bench = { ...pushA, exercises: pushA.exercises.map((e) => (e.slug === "barbell-bench-press" ? { ...e, slug: "db-bench-press" } : e)) };
    expect(carriedSwaps([bench], twoset)).toEqual([]);
  });
});
