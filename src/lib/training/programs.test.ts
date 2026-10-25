import { describe, expect, it } from "vitest";
import pplFixture from "../../../scripts/dev/fixtures/ppl-rows-2026-10.json";
import { getExercise, LIBRARY } from "./library";
import {
  activeProgram,
  ARNOLD_SCHEDULE,
  carriedSwaps,
  counterpartKey,
  effortDefaults,
  estimateDurationMin,
  exerciseDisplayName,
  pickableLibrary,
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
  visibleExercises,
  visibleWarmup,
} from "./programs";
import type { TemplateExercise, TemplateKey, WarmupStep } from "./types";

/** docs/PROGRAM-ARNOLD.md §1.3, copied literally (cross-checked against Quinton's request line by line). */
const SPEC = [
  {
    key: "shoulders_arms_a", name: "Shoulders, Biceps & Triceps A", short: "Shoulders & Arms A", abbr: "Arms", family: "shoulders_arms", weekday: 1,
    exercises: [
      { slug: "seated-db-shoulder-press", name: "Seated Dumbbell Shoulder Press", sets: 2, repLow: 6, repHigh: 10, unit: "reps", rir: "1–3", rest: 150, optional: false },
      { slug: "cable-lateral-raise", name: "Cable Lateral Raises", sets: 4, repLow: 12, repHigh: 20, unit: "each", rir: "0–2", rest: 60, optional: false },
      { slug: "reverse-pec-deck", name: "Reverse Pec Deck", sets: 3, repLow: 12, repHigh: 20, unit: "reps", rir: "0–2", rest: 60, optional: false },
      { slug: "preacher-curl", name: "EZ-Bar Preacher Curls", sets: 3, repLow: 8, repHigh: 12, unit: "reps", rir: "0–2", rest: 90, optional: false },
      { slug: "overhead-cable-triceps-extension", name: "Overhead Cable Triceps Extensions", sets: 3, repLow: 10, repHigh: 15, unit: "reps", rir: "0–2", rest: 90, optional: false },
      { slug: "incline-db-curl", name: "Incline Dumbbell Curls", sets: 2, repLow: 10, repHigh: 15, unit: "reps", rir: "0", rest: 75, optional: false },
      { slug: "rope-triceps-pushdown", name: "Rope Triceps Pushdowns", sets: 2, repLow: 10, repHigh: 15, unit: "reps", rir: "0–2", rest: 60, optional: false },
    ],
  },
  {
    key: "chest_back_a", name: "Chest & Back A", short: "Chest & Back A", abbr: "Chest", family: "chest_back", weekday: 2,
    exercises: [
      { slug: "incline-db-press", name: "Incline Dumbbell Press", sets: 3, repLow: 6, repHigh: 10, unit: "reps", rir: "1–3", rest: 150, optional: false },
      { slug: "neutral-grip-lat-pulldown", name: "Neutral-Grip Lat Pulldown", sets: 3, repLow: 8, repHigh: 12, unit: "reps", rir: "1–3", rest: 150, optional: false },
      { slug: "chest-supported-row", name: "Chest-Supported Row", sets: 3, repLow: 8, repHigh: 12, unit: "reps", rir: "1–3", rest: 120, optional: false },
      { slug: "machine-chest-press", name: "Machine Chest Press", sets: 2, repLow: 8, repHigh: 12, unit: "reps", rir: "1–3", rest: 120, optional: false },
      { slug: "cable-chest-fly", name: "Low-to-High Cable Fly", sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "0–2", rest: 75, optional: false },
      { slug: "single-arm-lat-pulldown", name: "Single-Arm Cable Lat Pulldown", sets: 2, repLow: 10, repHigh: 15, unit: "each", rir: "1–3", rest: 120, optional: false },
    ],
  },
  {
    key: "legs_abs_a", name: "Legs & Abs A", short: "Legs & Abs A", abbr: "Legs", family: "legs_abs", weekday: 3,
    exercises: [
      { slug: "back-squat", name: "Barbell Back Squat", sets: 3, repLow: 5, repHigh: 8, unit: "reps", rir: "1–3", rest: 180, optional: false },
      { slug: "romanian-deadlift", name: "Romanian Deadlift", sets: 3, repLow: 6, repHigh: 10, unit: "reps", rir: "1–3", rest: 180, optional: false },
      { slug: "leg-press", name: "Leg Press", sets: 2, repLow: 10, repHigh: 15, unit: "reps", rir: "1–3", rest: 150, optional: false },
      { slug: "seated-leg-curl", name: "Seated Leg Curl", sets: 3, repLow: 10, repHigh: 15, unit: "reps", rir: "0–2", rest: 90, optional: false },
      { slug: "standing-calf-raise", name: "Standing Calf Raises", sets: 4, repLow: 8, repHigh: 15, unit: "reps", rir: "0–2", rest: 75, optional: false },
      { slug: "hanging-leg-raise", name: "Hanging Leg Raises", sets: 3, repLow: 10, repHigh: 15, unit: "reps", rir: "0–2", rest: 75, optional: false },
    ],
  },
  {
    key: "shoulders_arms_b", name: "Shoulders, Biceps & Triceps B", short: "Shoulders & Arms B", abbr: "Arms", family: "shoulders_arms", weekday: 4,
    exercises: [
      { slug: "machine-shoulder-press", name: "Machine Shoulder Press", sets: 2, repLow: 8, repHigh: 12, unit: "reps", rir: "1–3", rest: 120, optional: false },
      { slug: "db-lateral-raise", name: "Dumbbell Lateral Raises", sets: 4, repLow: 12, repHigh: 20, unit: "reps", rir: "0–2", rest: 60, optional: false },
      { slug: "cable-rear-delt-fly", name: "Cable Rear Delt Fly", sets: 3, repLow: 12, repHigh: 20, unit: "reps", rir: "0–2", rest: 60, optional: false },
      { slug: "cable-curl", name: "Cable Biceps Curls", sets: 3, repLow: 10, repHigh: 15, unit: "reps", rir: "0–2", rest: 75, optional: false },
      { slug: "single-arm-overhead-cable-triceps-extension", name: "Single-Arm Overhead Cable Triceps Extension", sets: 3, repLow: 10, repHigh: 15, unit: "each", rir: "0–2", rest: 60, optional: false },
      { slug: "cross-body-hammer-curl", name: "Cross-Body Hammer Curls", sets: 2, repLow: 10, repHigh: 15, unit: "reps", rir: "0–2", rest: 75, optional: false },
      { slug: "straight-bar-pushdown", name: "Straight-Bar Triceps Pushdowns", sets: 2, repLow: 10, repHigh: 15, unit: "reps", rir: "0–2", rest: 60, optional: false },
      { slug: "reverse-curl", name: "Reverse Curls", sets: 2, repLow: 10, repHigh: 15, unit: "reps", rir: "0–2", rest: 60, optional: true },
    ],
  },
  {
    key: "chest_back_b", name: "Chest & Back B", short: "Chest & Back B", abbr: "Chest", family: "chest_back", weekday: 5,
    exercises: [
      { slug: "incline-smith-press", name: "Incline Smith Machine Press", sets: 3, repLow: 8, repHigh: 12, unit: "reps", rir: "1–3", rest: 150, optional: false },
      { slug: "chest-supported-wide-row", name: "Chest-Supported Wide Row", sets: 3, repLow: 8, repHigh: 12, unit: "reps", rir: "1–3", rest: 150, optional: false },
      { slug: "lat-pulldown", name: "Wide-Grip Lat Pulldown", sets: 3, repLow: 8, repHigh: 12, unit: "reps", rir: "1–3", rest: 120, optional: false },
      { slug: "db-bench-press", name: "Flat Dumbbell Bench Press", sets: 2, repLow: 8, repHigh: 12, unit: "reps", rir: "1–3", rest: 120, optional: false },
      { slug: "pec-deck", name: "Pec Deck", sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "0–2", rest: 75, optional: false },
      { slug: "single-arm-cable-row", name: "Single-Arm Cable Row", sets: 2, repLow: 10, repHigh: 15, unit: "each", rir: "1–3", rest: 120, optional: false },
    ],
  },
  {
    key: "legs_abs_b", name: "Legs & Abs B", short: "Legs & Abs B", abbr: "Legs", family: "legs_abs", weekday: 6,
    exercises: [
      { slug: "hack-squat", name: "Hack Squat", sets: 3, repLow: 8, repHigh: 12, unit: "reps", rir: "1–3", rest: 180, optional: false },
      { slug: "bulgarian-split-squat", name: "Bulgarian Split Squat", sets: 2, repLow: 8, repHigh: 12, unit: "each", rir: "1–3", rest: 120, optional: false },
      { slug: "lying-leg-curl", name: "Lying Leg Curl", sets: 3, repLow: 10, repHigh: 15, unit: "reps", rir: "0–2", rest: 90, optional: false },
      { slug: "leg-extension", name: "Leg Extension", sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "0–2", rest: 75, optional: false },
      { slug: "hip-thrust", name: "Hip Thrust", sets: 2, repLow: 8, repHigh: 12, unit: "reps", rir: "1–3", rest: 120, optional: false },
      { slug: "seated-calf-raise", name: "Seated Calf Raises", sets: 4, repLow: 10, repHigh: 20, unit: "reps", rir: "0–2", rest: 60, optional: false },
      { slug: "cable-crunch", name: "Cable Crunches", sets: 3, repLow: 10, repHigh: 15, unit: "reps", rir: "0–2", rest: 60, optional: false },
    ],
  },
];

describe("the Arnold split (§1.3)", () => {
  it("is the default program, with Quinton's six templates in weekday order", () => {
    const got = PROGRAMS.arnold.templates.map((t) => ({
      key: t.key,
      name: t.name,
      short: t.short,
      abbr: t.abbr,
      family: t.family,
      weekday: t.weekday,
      exercises: t.exercises.map((e) => ({ slug: e.slug, name: e.name, sets: e.sets, repLow: e.repLow, repHigh: e.repHigh, unit: e.unit, rir: e.rir, rest: e.rest, optional: !!e.optional })),
    }));
    expect(got).toEqual(SPEC);
  });

  it("schedules Monday–Saturday and rests on Sunday", () => {
    expect(ARNOLD_SCHEDULE).toEqual({ "1": "shoulders_arms_a", "2": "chest_back_a", "3": "legs_abs_a", "4": "shoulders_arms_b", "5": "chest_back_b", "6": "legs_abs_b", "0": "rest" });
    expect(PROGRAMS.arnold.name).toBe("Arnold split");
    expect(PROGRAMS.ppl.name).toBe("Push/Pull/Legs");
  });

  it("totals 105 working sets a week (+2 with the optional reverse curls)", () => {
    const sets = (opt: boolean) => PROGRAMS.arnold.templates.flatMap((t) => t.exercises).filter((e) => opt || !e.optional).reduce((n, e) => n + e.sets, 0);
    expect(sets(false)).toBe(105);
    expect(sets(true)).toBe(107);
    expect(PROGRAMS.arnold.templates.map((t) => estimateDurationMin(t))).toEqual([50, 45, 50, 45, 45, 50]);
  });

  it("uses only library lifts that are not retired, each on exactly one day", () => {
    const all = PROGRAMS.arnold.templates.flatMap((t) => t.exercises.map((e) => e.slug));
    for (const s of all) {
      expect(getExercise(s), s).toBeDefined();
      expect(getExercise(s)!.retired, s).toBeFalsy();
    }
    expect(new Set(all).size).toBe(all.length);
  });

  it("gives heavy compounds 1–3 RIR and 120–180 s, isolation 0–2 RIR and 60–120 s (Q§10)", () => {
    for (const e of PROGRAMS.arnold.templates.flatMap((t) => t.exercises)) {
      const lib = getExercise(e.slug)!;
      if (lib.category === "compound") {
        expect(e.rir, e.slug).toBe("1–3");
        expect(e.rest >= 120 && e.rest <= 180, e.slug).toBe(true);
      } else {
        expect(e.rir, e.slug).toBe("0–2");
        expect(e.rest >= 60 && e.rest <= 120, e.slug).toBe(true);
      }
      if (lib.perSide) expect(e.unit, e.slug).toBe("each");
    }
  });

  it("keeps Quinton's training notes and a warm-up for every day; Wednesday ramps up the squat", () => {
    for (const t of PROGRAMS.arnold.templates) {
      expect(t.notes).toHaveLength(4);
      expect(t.warmup.length).toBeGreaterThanOrEqual(4);
    }
    expect(TEMPLATE_DEFS.legs_abs_a.warmup.find((w) => w.label === "Squat ramp-up")?.detail).toMatch(/^Empty bar ×10 and ×8/);
    expect(TEMPLATE_DEFS.shoulders_arms_b.notes[2]).toBe("Shoulder pressing volume can be reduced if it interferes with Friday's chest session.");
  });

  it("offers reverse curls as a substitute for every Thursday curl", () => {
    for (const s of ["cross-body-hammer-curl", "cable-curl", "hammer-curl", "cable-hammer-curl"]) expect(getExercise(s)!.substitutes, s).toContain("reverse-curl");
  });

  it("has a Sunday of optional recovery, with no volleyball or jumps", () => {
    expect(SUNDAY_RECOVERY.title).toBe("Rest and recovery");
    expect(SUNDAY_RECOVERY.items).toHaveLength(6);
    expect(JSON.stringify(SUNDAY_RECOVERY)).not.toMatch(/volley|jump/i);
    expect(JSON.stringify(PROGRAMS.arnold.rules)).not.toMatch(/volley|jump/i);
    expect(JSON.stringify(PROGRAMS.ppl)).not.toMatch(/volley|box.?jump|broad.?jump|approach.?jump/i);
  });
});

describe("library (§1.8, §1.9)", () => {
  it("adds three lifts with 3–5 steps, 2–4 tips and existing substitutes", () => {
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
  it("prefers prefs.program, else infers from the week, else Arnold", () => {
    expect(activeProgram({ prefs: { program: "ppl" }, weekly_schedule: ARNOLD_SCHEDULE })).toBe("ppl");
    expect(activeProgram({ prefs: {}, weekly_schedule: { "1": "shoulders_arms_a" } })).toBe("arnold");
    expect(activeProgram({ prefs: null, weekly_schedule: PPL })).toBe("ppl");
    expect(activeProgram({ prefs: {}, weekly_schedule: {} })).toBe("arnold");
    expect(activeProgram(null)).toBe("arnold");
    expect(activeProgram({ prefs: { program: "volleyball" }, weekly_schedule: PPL })).toBe("ppl");
  });

  it("knows when the program started, only for the program that is active", () => {
    const sw = { from: "ppl", to: "arnold", at: "2026-10-22T13:00:00Z", date: "2026-10-22", frozen: 13, mapped: 1 };
    expect(programSince({ program: "arnold", programSwitch: sw })).toBe("2026-10-22");
    expect(programSince({ program: "ppl", programSwitch: sw })).toBeNull();
    expect(programSince({})).toBeNull();
  });

  it("merges the weekly schedule over the active program's default week", () => {
    expect(scheduleFor({ weekly_schedule: { "3": "rest" } })).toEqual({ ...ARNOLD_SCHEDULE, "3": "rest" });
    expect(scheduleFor({ weekly_schedule: { "1": "push_a" } })["2"]).toBe("pull_a");
  });

  it("maps every slot to the other program and back (a bijection)", () => {
    const keys = [...PROGRAMS.arnold.keys, ...PROGRAMS.ppl.keys] as TemplateKey[];
    for (const k of keys) {
      const to = programOfKey(k) === "arnold" ? "ppl" : "arnold";
      expect(counterpartKey(counterpartKey(k, to), programOfKey(k)!)).toBe(k);
    }
    expect(counterpartKey("push_b", "arnold")).toBe("shoulders_arms_b");
    expect(counterpartKey("chest_back_a", "ppl")).toBe("pull_a");
    expect(new Set(PROGRAMS.ppl.keys.map((k) => counterpartKey(k, "arnold"))).size).toBe(6);
    expect(templateDef("nope")).toBeUndefined();
  });
});

describe("resolvePlanKey (§2.4)", () => {
  const ctx = { program: "arnold" as const, since: "2026-10-22" };
  const week = scheduleFor({ weekly_schedule: ARNOLD_SCHEDULE });
  it("lets the override win", () => {
    expect(resolvePlanKey("2026-10-24", week, { template_key: "rest" }, ctx)).toBe("rest");
    expect(resolvePlanKey("2026-10-24", week, { template_key: "chest_back_a" }, ctx)).toBe("chest_back_a");
  });
  it("maps an other-program key on or after the switch, never before it or on the switch's own rows", () => {
    expect(resolvePlanKey("2026-10-22", week, { template_key: "push_b", note: null }, ctx)).toBe("shoulders_arms_b");
    expect(resolvePlanKey("2026-10-30", week, { template_key: "pull_a" }, ctx)).toBe("chest_back_a");
    expect(resolvePlanKey("2026-10-21", week, { template_key: "pull_a" }, ctx)).toBe("pull_a");
    expect(resolvePlanKey("2026-10-22", week, { template_key: "pull_a", note: "program-switch" }, ctx)).toBe("pull_a");
    expect(resolvePlanKey("2026-10-30", week, { template_key: "pull_a" }, { program: "arnold", since: null })).toBe("pull_a");
  });
  it("falls back to the weekly schedule, then rest", () => {
    expect(resolvePlanKey("2026-10-26", week, null, ctx)).toBe("shoulders_arms_a"); // Monday
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
    expect(templateLabels({ key: "shoulders_arms_a", name: "Shoulders, Biceps & Triceps A" })).toEqual({ name: "Shoulders, Biceps & Triceps A", short: "Shoulders & Arms A", abbr: "Arms", family: "shoulders_arms" });
    expect(templateLabels({ key: "pull_b", name: "Pull B (Q)" })).toEqual({ name: "Pull B (Q)", short: "Pull B (Q)", abbr: "Pull", family: "pull" });
    expect(templateLabels({ key: "chest_back_b", name: "Upper day" })).toMatchObject({ short: "Upper day", abbr: "Upper", family: "chest_back" });
    for (const t of PROGRAMS.arnold.templates) expect(t.abbr.length).toBeLessThanOrEqual(5);
  });

  it("derives effort defaults from the library category", () => {
    expect(effortDefaults(getExercise("back-squat")!)).toEqual({ rir: "1–3", rest: 180 });
    expect(effortDefaults(getExercise("leg-press")!)).toEqual({ rir: "1–3", rest: 120 });
    expect(effortDefaults(getExercise("cable-lateral-raise")!)).toEqual({ rir: "0–2", rest: 60 });
    expect(effortDefaults(getExercise("cable-crunch")!)).toEqual({ rir: "0–2", rest: 60 });
    expect(effortDefaults(getExercise("farmer-carry")!)).toEqual({ rir: "1–2", rest: 90 });
    expect(effortDefaults(getExercise("box-jump")!).rir).toBe("Fresh");
  });

  it("parses RIR text", () => {
    expect(rirRange("1–3")).toEqual([1, 3]);
    expect(rirRange("0–2")).toEqual([0, 2]);
    expect(rirRange("3")).toEqual([3, 3]);
    expect(rirRange("Fresh")).toBeNull();
    expect(rirRange(null)).toBeNull();
  });

  it("titles a lift with the active program's name, else the library's", () => {
    expect(exerciseDisplayName("cable-chest-fly", PROGRAMS.arnold.templates)).toBe("Low-to-High Cable Fly");
    expect(exerciseDisplayName("cable-chest-fly", [])).toBe("Cable Chest Fly");
    expect(exerciseDisplayName("barbell-bench-press", PROGRAMS.arnold.templates)).toBe("Barbell Bench Press");
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
  const arnold = PROGRAMS.arnold.templates.map((t) => ({ key: t.key, exercises: t.exercises }));
  it("finds a swap he made in PPL that Arnold also uses", () => {
    const pushA = ppl.find((t) => t.key === "push_a")!;
    const swapped = { ...pushA, exercises: pushA.exercises.map((e) => (e.slug === "cable-lateral-raise" ? { ...e, slug: "db-lateral-raise", name: "Dumbbell Lateral Raises" } : e)) };
    const out = carriedSwaps([swapped], arnold);
    expect(out).toEqual([{ from: "cable-lateral-raise", to: "db-lateral-raise", keys: ["shoulders_arms_a"] }]);
  });
  it("ignores unchanged rows, set changes and swaps of lifts Arnold doesn't use", () => {
    expect(carriedSwaps(ppl, arnold)).toEqual([]);
    const pushA = ppl.find((t) => t.key === "push_a")!;
    const moreSets = { ...pushA, exercises: pushA.exercises.map((e) => ({ ...e, sets: e.sets + 1 })) };
    expect(carriedSwaps([moreSets], arnold)).toEqual([]);
    const bench = { ...pushA, exercises: pushA.exercises.map((e) => (e.slug === "barbell-bench-press" ? { ...e, slug: "db-bench-press" } : e)) };
    expect(carriedSwaps([bench], arnold)).toEqual([]);
  });
});
