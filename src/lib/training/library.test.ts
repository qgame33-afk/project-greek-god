import { describe, expect, it } from "vitest";
import { getExercise, LIBRARY, LIBRARY_BY_SLUG } from "./library";
import { pickableLibrary } from "./programs";
import type { Equipment, ExerciseCategory, MuscleGroup, Tracking } from "./types";
import { MUSCLE_LABEL } from "./volume";

const MUSCLES = Object.keys(MUSCLE_LABEL).filter((m) => m !== "other") as MuscleGroup[];
const CATEGORIES: ExerciseCategory[] = ["compound", "isolation", "explosive", "carry", "core"];
const EQUIPMENT: Equipment[] = ["barbell", "dumbbell", "cable", "machine", "smith", "bodyweight", "ez_bar", "plate_loaded", "band", "kettlebell", "box", "other"];
const TRACKING: Tracking[] = ["weight_reps", "bodyweight_reps", "reps", "weight_time"];

/** The library before the big list (2026-11-06): history, bests and his templates point at these. */
const ORIGINAL = [
  "barbell-bench-press", "db-bench-press", "machine-chest-press", "incline-db-press", "incline-barbell-press", "incline-smith-press", "dip",
  "close-grip-bench-press", "cable-chest-fly", "pec-deck", "db-fly", "seated-db-shoulder-press", "machine-shoulder-press", "overhead-press",
  "cable-lateral-raise", "db-lateral-raise", "machine-lateral-raise", "cable-triceps-pushdown", "rope-triceps-pushdown", "straight-bar-pushdown",
  "overhead-cable-triceps-extension", "skull-crusher", "weighted-pull-up", "pull-up", "chin-up", "assisted-pull-up", "lat-pulldown",
  "neutral-grip-lat-pulldown", "single-arm-lat-pulldown", "chest-supported-row", "chest-supported-wide-row", "seated-cable-row",
  "single-arm-cable-row", "db-row", "t-bar-row", "barbell-row", "reverse-pec-deck", "face-pull", "rear-delt-db-fly", "ez-bar-curl",
  "barbell-curl", "cable-curl", "preacher-curl", "incline-db-curl", "hammer-curl", "cable-hammer-curl", "reverse-curl", "wrist-curl",
  "farmer-carry", "trap-bar-carry", "suitcase-carry", "box-jump", "approach-jump", "broad-jump", "squat-jump", "back-squat", "front-squat",
  "hack-squat", "pendulum-squat", "smith-squat", "leg-press", "goblet-squat", "bulgarian-split-squat", "walking-lunge", "romanian-deadlift",
  "db-romanian-deadlift", "back-extension", "hip-thrust", "glute-bridge", "seated-leg-curl", "lying-leg-curl", "nordic-curl", "leg-extension",
  "standing-calf-raise", "seated-calf-raise", "leg-press-calf-raise", "hanging-knee-raise", "hanging-leg-raise", "cable-crunch", "ab-wheel",
  "cable-rear-delt-fly", "single-arm-overhead-cable-triceps-extension", "cross-body-hammer-curl", "straight-arm-pulldown",
];

describe("the exercise library", () => {
  it("is a big list: at least 250 pickable lifts", () => {
    expect(pickableLibrary().length).toBeGreaterThanOrEqual(250);
  });

  it("keeps every original slug, so history, bests and templates still resolve", () => {
    expect(ORIGINAL).toHaveLength(84);
    for (const slug of ORIGINAL) expect(getExercise(slug), slug).toBeDefined();
    expect(LIBRARY.slice(0, ORIGINAL.length).map((e) => e.slug)).toEqual(ORIGINAL);
  });

  it("has unique, url-safe slugs and unique names", () => {
    const slugs = LIBRARY.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(Object.keys(LIBRARY_BY_SLUG)).toHaveLength(slugs.length);
    for (const s of slugs) expect(s, s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const names = LIBRARY.map((e) => e.name.toLowerCase());
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it("fills every field with valid values", () => {
    for (const e of LIBRARY) {
      const at = e.slug;
      expect(e.name.trim().length, at).toBeGreaterThan(2);
      expect(e.primary.length, at).toBeGreaterThan(0);
      for (const m of [...e.primary, ...e.secondary]) expect(MUSCLES, `${at}: ${m}`).toContain(m);
      for (const m of e.secondary) expect(e.primary, `${at}: ${m} is both primary and secondary`).not.toContain(m);
      expect(CATEGORIES, at).toContain(e.category);
      expect(EQUIPMENT, at).toContain(e.equipment);
      expect(TRACKING, at).toContain(e.tracking);
      expect(e.rest, at).toBeGreaterThanOrEqual(30);
      expect(e.rest, at).toBeLessThanOrEqual(300);
      expect([0, 2.5, 5, 10], at).toContain(e.increment);
      expect(e.instructions.length, at).toBeGreaterThanOrEqual(3);
      expect(e.instructions.length, at).toBeLessThanOrEqual(5);
      expect(e.formTips.length, at).toBeGreaterThanOrEqual(2);
      expect(e.formTips.length, at).toBeLessThanOrEqual(4);
      for (const line of [...e.instructions, ...e.formTips]) {
        expect(line.trim().length, at).toBeGreaterThan(8);
        expect(line, at).not.toMatch(/!/);
      }
      // the weight logged per hand only makes sense when there is a weight in each hand
      if (e.perHand) expect(["dumbbell", "kettlebell"], at).toContain(e.equipment);
      if (e.bodyweightOk) expect(e.tracking, at).toBe("weight_reps");
      if (e.tracking === "weight_time") expect(["carry", "isolation"], at).toContain(e.category);
      if (e.equipment === "band") expect(e.tracking, at).toBe("bodyweight_reps");
    }
  });

  it("lists real substitutes for every pickable lift: existing, not itself, never retired", () => {
    for (const e of pickableLibrary()) {
      expect(e.substitutes.length, e.slug).toBeGreaterThan(0);
      expect(new Set(e.substitutes).size, e.slug).toBe(e.substitutes.length);
      for (const s of e.substitutes) {
        expect(s, e.slug).not.toBe(e.slug);
        expect(getExercise(s), `${e.slug} → ${s}`).toBeDefined();
        expect(getExercise(s)!.retired, `${e.slug} → ${s}`).toBeFalsy();
      }
    }
  });

  it("covers every muscle group and every equipment type", () => {
    const pick = pickableLibrary();
    const groups: MuscleGroup[] = ["chest", "upper_chest", "front_delts", "side_delts", "rear_delts", "lats", "upper_back", "traps", "lower_back", "biceps", "brachialis", "forearms", "triceps", "quads", "hamstrings", "glutes", "adductors", "calves", "abs", "obliques"];
    for (const g of groups) expect(pick.filter((e) => e.primary.includes(g)).length, g).toBeGreaterThanOrEqual(3);
    for (const q of EQUIPMENT.filter((x) => x !== "box")) expect(pick.filter((e) => e.equipment === q).length, q).toBeGreaterThanOrEqual(3);
  });

  it("offers no volleyball, jump or sprint drills", () => {
    for (const e of pickableLibrary()) {
      expect(`${e.slug} ${e.name}`, e.slug).not.toMatch(/volley|jump|sprint|plyo|bound/i);
      expect(e.category, e.slug).not.toBe("explosive");
      expect(e.tracking, e.slug).not.toBe("reps");
    }
  });
});
