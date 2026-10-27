import { describe, expect, it } from "vitest";
import { TEMPLATE_DEFS as PROGRAM_BY_KEY, estimateDurationMin } from "./programs";
import {
  RIR_OPTIONS,
  isLegDay,
  modeTemplate,
  moveItem,
  niceTicks,
  newTemplateExercise,
  regionOf,
  sameTemplateContent,
  sessionVolume,
  sessionsFromSets,
  strengthSeries,
  substituteExercise,
  templateSummary,
  usesE1rm,
  validateTemplate,
  weeklySetsByMuscle,
} from "./volume";

describe("sessionVolume", () => {
  it("sums load × reps over completed working sets only", () => {
    const v = sessionVolume([
      { exercise_slug: "barbell-bench-press", weight_lb: 185, reps: 6, completed: true, kind: "working" },
      { exercise_slug: "barbell-bench-press", weight_lb: "185", reps: 5, completed: true, kind: "working" },
      { exercise_slug: "barbell-bench-press", weight_lb: 135, reps: 5, completed: true, kind: "warmup" },
      { exercise_slug: "barbell-bench-press", weight_lb: 185, reps: 4, completed: false, kind: "working" },
      { exercise_slug: "box-jump", weight_lb: null, reps: 3 },
    ]);
    expect(v).toEqual({ volumeLb: 185 * 11, sets: 3, reps: 14 });
  });

  it("is zero for an empty session", () => {
    expect(sessionVolume([])).toEqual({ volumeLb: 0, sets: 0, reps: 0 });
  });
});

describe("weeklySetsByMuscle", () => {
  it("credits each primary muscle with one set", () => {
    const r = weeklySetsByMuscle([
      { exercise_slug: "barbell-bench-press", weight_lb: 185, reps: 6 },
      { exercise_slug: "barbell-bench-press", weight_lb: 185, reps: 6 },
      { exercise_slug: "barbell-bench-press", weight_lb: 135, reps: 8, kind: "warmup" },
      { exercise_slug: "not-in-library", weight_lb: 50, reps: 10 },
    ]);
    expect(r).toEqual([
      { muscle: "chest", sets: 2 },
      { muscle: "other", sets: 1 },
    ]);
  });

  it("optionally adds fractional credit for secondary muscles", () => {
    const r = weeklySetsByMuscle([{ exercise_slug: "barbell-bench-press", weight_lb: 185, reps: 6 }], { secondary: 0.5 });
    expect(r).toContainEqual({ muscle: "chest", sets: 1 });
    expect(r).toContainEqual({ muscle: "triceps", sets: 0.5 });
    expect(r).toContainEqual({ muscle: "front_delts", sets: 0.5 });
  });
});

describe("templates", () => {
  const pushA = PROGRAM_BY_KEY.push_a;
  const legsA = PROGRAM_BY_KEY.legs_a;

  it("summarises exercises and sets", () => {
    expect(templateSummary(pushA)).toEqual({ exercises: 6, sets: 17 });
  });

  it("standard mode is the template as written", () => {
    expect(templateSummary(modeTemplate(pushA, "standard"))).toEqual(templateSummary(pushA));
  });

  it("intro drops a set from most exercises (never below 2)", () => {
    const intro = modeTemplate(pushA, "intro");
    expect(intro.exercises.map((e) => e.sets)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(estimateDurationMin(intro)).toBeLessThan(estimateDurationMin(pushA));
  });

  it("deload roughly halves the sets and lowers the top of each rep range by 2", () => {
    const d = modeTemplate(pushA, "deload");
    // a two-set lift keeps both sets in a deload (it gets easier instead)
    expect(d.exercises.map((e) => e.sets)).toEqual([2, 2, 2, 2, 2, 2]);
    // bench 5–8 → 5–6, laterals 12–20 → 12–18 (matches the deload suggestion's target)
    expect([d.exercises[0].repLow, d.exercises[0].repHigh]).toEqual([5, 6]);
    expect(d.exercises[3].repHigh).toBe(pushA.exercises[3].repHigh - 2);
    // a retired jump in an old stored row keeps its fixed target
    const jumpDay = { ...legsA, exercises: [{ slug: "box-jump", name: "Box Jumps", sets: 3, repLow: 3, repHigh: 3, unit: "reps" as const, rir: "Fresh", rest: 120 }, ...legsA.exercises] };
    const jumps = modeTemplate(jumpDay, "deload").exercises.find((e) => e.slug === "box-jump")!;
    expect(jumps.repHigh).toBe(3);
    // never below the bottom of the range
    expect(modeTemplate({ ...pushA, exercises: [{ ...pushA.exercises[0], repLow: 5, repHigh: 6 }] }, "deload").exercises[0].repHigh).toBe(5);
  });

  it("leaves optional exercises out unless asked; the two-set days keep 12 / 12 / 8 sets in every mode", () => {
    const opt = { ...PROGRAM_BY_KEY.arms_b, exercises: [...PROGRAM_BY_KEY.arms_b.exercises, { ...PROGRAM_BY_KEY.arms_b.exercises[4], slug: "reverse-curl", optional: true }] };
    expect(modeTemplate(opt, "standard").exercises.map((e) => e.slug)).not.toContain("reverse-curl");
    expect(modeTemplate(opt, "standard", { includeOptional: true }).exercises.map((e) => e.slug)).toContain("reverse-curl");
    for (const m of ["standard", "intro", "deload"] as const)
      expect((["arms_b", "chest_b", "lower_b"] as const).map((k) => modeTemplate(PROGRAM_BY_KEY[k], m).exercises.reduce((n, e) => n + e.sets, 0)), m).toEqual([12, 12, 8]);
  });

  it("the deprecated lighter-legs form still trims leg accessories", () => {
    const light = modeTemplate(legsA, "standard", true);
    expect(light.exercises.some((e) => e.optional)).toBe(false);
    const squat = light.exercises.find((e) => e.slug === "back-squat");
    const orig = legsA.exercises.find((e) => e.slug === "back-squat");
    expect(squat!.sets).toBe(orig!.sets - 1);
  });

  it("compares template content regardless of jsonb key order", () => {
    const shuffled = {
      ...pushA,
      exercises: pushA.exercises.map((e) => {
        const { rir, name, note, rest, sets, slug, unit, repLow, repHigh, optional } = e;
        return { rir, name, ...(note ? { note } : {}), rest, sets, slug, unit, repLow, repHigh, ...(optional ? { optional } : {}) };
      }),
      warmup: pushA.warmup.map((w) => ({ detail: w.detail, label: w.label })),
    };
    expect(JSON.stringify(shuffled.exercises) === JSON.stringify(pushA.exercises)).toBe(false);
    expect(sameTemplateContent(shuffled, pushA)).toBe(true);
    expect(sameTemplateContent({ ...pushA, exercises: pushA.exercises.map((e, i) => (i === 0 ? { ...e, optional: false, note: e.note ?? "" } : e)) }, pushA)).toBe(true);
    expect(sameTemplateContent({ ...pushA, exercises: pushA.exercises.map((e, i) => (i === 0 ? { ...e, sets: e.sets + 1 } : e)) }, pushA)).toBe(false);
    expect(sameTemplateContent({ ...pushA, name: "Push A2" }, pushA)).toBe(false);
  });

  it("recognises leg days", () => {
    expect(isLegDay(PROGRAM_BY_KEY.legs_a)).toBe(true);
    expect(isLegDay(PROGRAM_BY_KEY.legs_b)).toBe(true);
    expect(isLegDay(pushA)).toBe(false);
    expect(isLegDay(PROGRAM_BY_KEY.pull_a)).toBe(false);
    expect(isLegDay({ exercises: [] })).toBe(false);
  });

  it("maps muscles to regions", () => {
    expect(regionOf(["side_delts"])).toBe("shoulders");
    expect(regionOf(["full_body", "quads"])).toBe("legs");
    expect(regionOf([])).toBeNull();
  });
});

describe("template editing", () => {
  it("offers the Arnold effort targets among the RIR options", () => {
    expect([...RIR_OPTIONS]).toEqual(["0–1", "0–2", "1–2", "1–3", "2–3", "3–4", "Fresh"]);
  });
  it("creates a starting prescription from the library", async () => {
    const { getExercise } = await import("./library");
    expect(newTemplateExercise(getExercise("barbell-bench-press")!)).toMatchObject({ sets: 2, repLow: 6, repHigh: 10, unit: "reps", rir: "1–2", rest: 180 });
    // effortDefaults (PROGRAM-V3 §1.3): compounds 150–180 s, failure on machines and isolation (90–120 s)
    expect(newTemplateExercise(getExercise("leg-press")!)).toMatchObject({ sets: 2, rir: "0", rest: 150 });
    expect(newTemplateExercise(getExercise("back-squat")!)).toMatchObject({ rir: "1–2", rest: 180 });
    expect(newTemplateExercise(getExercise("cable-lateral-raise")!)).toMatchObject({ rir: "0", rest: 90, unit: "each" });
    expect(newTemplateExercise(getExercise("hanging-leg-raise")!)).toMatchObject({ rir: "0" });
    expect(newTemplateExercise(getExercise("farmer-carry")!)).toMatchObject({ rir: "1–2", rest: 90, unit: "sec" });
    expect(newTemplateExercise(getExercise("box-jump")!)).toMatchObject({ repLow: 3, repHigh: 3, rir: "Fresh" });
    expect(newTemplateExercise(getExercise("cable-crunch")!)).toMatchObject({ repLow: 10, repHigh: 15 });
  });

  it("substitutes but keeps the prescription", async () => {
    const { getExercise } = await import("./library");
    const bench = PROGRAM_BY_KEY.push_a.exercises[0];
    const sub = substituteExercise(bench, getExercise("db-bench-press")!);
    expect(sub).toMatchObject({ slug: "db-bench-press", name: "Dumbbell Bench Press", sets: bench.sets, repLow: bench.repLow, repHigh: bench.repHigh, rest: bench.rest });
  });

  it("moves items", () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    const a = [1, 2];
    expect(moveItem(a, 0, 5)).toBe(a);
  });

  it("validates names, ranges and warm-up steps", () => {
    const ok = validateTemplate(PROGRAM_BY_KEY.legs_a);
    expect(ok.ok).toBe(true);
    const ex = { ...PROGRAM_BY_KEY.push_a.exercises[0] };
    const bad = validateTemplate({
      name: " ",
      exercises: [{ ...ex, repLow: 10, repHigh: 8 }, { ...ex, sets: 0 }, { ...ex, unit: "sec", repLow: 30, repHigh: 900 }, ex],
      warmup: [{ label: "", detail: "" }, { label: "", detail: "x" }],
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors.name).toBeDefined();
    expect(Object.keys(bad.errors.exercise)).toEqual(["0", "1", "2"]);
    expect(bad.errors.warmup).toEqual({ 0: "Fill in or remove this step.", 1: "Give the step a short title." });
    expect(validateTemplate({ name: "X", exercises: [], warmup: [] }).errors.exercises).toBeDefined();
  });
});

describe("exercise history", () => {
  const day = (local_date: string, e1: number | null, w: number | null, reps: number | null, vol: number, sets: number, pr = false) => ({
    local_date,
    best_e1rm_lb: e1,
    top_weight_lb: w,
    max_reps: reps,
    volume_lb: vol,
    sets,
    had_pr: pr,
  });

  it("charts e1RM over volume, oldest first, within the range", () => {
    const s = strengthSeries([day("2026-10-14", 222, 185, 6, 3200, 3, true), day("2026-09-01", 210, 175, 6, 3000, 3), day("2026-10-07", 216, 180, 6, 3100, 3)], "2026-10-01");
    expect(s.metric).toBe("e1rm");
    expect(s.bars).toBe("volume");
    expect(s.points.map((p) => p.date)).toEqual(["2026-10-07", "2026-10-14"]);
    expect(s.points[1]).toEqual({ date: "2026-10-14", value: 222, bar: 3200, pr: true });
  });

  it("falls back to top weight, then reps and set counts", () => {
    expect(strengthSeries([day("2026-10-01", null, 90, 30, 2700, 2)]).metric).toBe("weight");
    const jumps = strengthSeries([day("2026-10-01", null, null, 3, 0, 3)]);
    expect(jumps).toMatchObject({ metric: "reps", bars: "sets" });
    expect(jumps.points[0]).toMatchObject({ value: 3, bar: 3 });
    expect(strengthSeries([]).points).toEqual([]);
  });

  it("does not chart e1RM for high-rep work that only has it on the odd short set", () => {
    // Cable lateral raise at 12–20: one 22.5×11 miss is the only day with an e1RM.
    const raise = [day("2026-10-02", null, 25, 16, 1200, 3), day("2026-10-09", null, 25, 18, 1300, 3), day("2026-10-16", 30.8, 22.5, 11, 700, 3)];
    expect(usesE1rm(raise)).toBe(false);
    expect(strengthSeries(raise).metric).toBe("weight");
    expect(usesE1rm([day("2026-10-02", 222, 180, 7, 3600, 3), day("2026-10-09", null, 135, 15, 2000, 3)])).toBe(true);
    expect(usesE1rm([])).toBe(false);
  });

  it("groups sets by session, newest first", () => {
    const set = (id: string, session_id: string, local_date: string, set_index: number, weight_lb: number, reps: number, e1rm_lb: number | null) => ({
      id, session_id, local_date, set_index, weight_lb, reps, duration_sec: null, rir: 1, notes: null, e1rm_lb,
    });
    const g = sessionsFromSets([set("a2", "A", "2026-10-07", 1, 180, 5, 210), set("a1", "A", "2026-10-07", 0, 180, 6, 216), set("b1", "B", "2026-10-14", 0, 185, 6, 222)]);
    expect(g.map((x) => x.sessionId)).toEqual(["B", "A"]);
    expect(g[1].sets.map((s) => s.id)).toEqual(["a1", "a2"]);
    expect(g[1]).toMatchObject({ topE1rm: 216, topWeight: 180, volumeLb: 180 * 11 });
  });
});

describe("niceTicks", () => {
  it("covers the range with round steps", () => {
    expect(niceTicks(209, 228)).toEqual([200, 210, 220, 230]);
    expect(niceTicks(239.2, 282)).toEqual([220, 240, 260, 280, 300]);
    expect(niceTicks(0, 7)).toEqual([0, 2.5, 5, 7.5]);
    expect(niceTicks(3, 3)).toEqual([3]);
    expect(niceTicks(NaN, 3)).toEqual([]);
  });
});
