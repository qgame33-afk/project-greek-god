import { describe, expect, it } from "vitest";
import {
  editability,
  formatTarget,
  habitKeyFor,
  HABIT_PRESETS,
  moveHabit,
  nextSort,
  presetState,
  validateDraft,
  type HabitDefEdit,
} from "./habits-edit";

const def = (
  key: string,
  sort: number,
  over: Partial<HabitDefEdit> = {},
): HabitDefEdit => ({
  key,
  label: key,
  kind: "check",
  target: null,
  unit: null,
  active: true,
  sort,
  ...over,
});

describe("editability", () => {
  it("lets auto habits be hidden but not edited", () => {
    expect(editability({ key: "protein", kind: "auto" })).toEqual({
      rename: false,
      target: false,
      hide: true,
      remove: false,
      profileGoal: false,
    });
  });
  it("routes the steps goal to the profile", () => {
    expect(editability({ key: "steps", kind: "value" })).toMatchObject({
      rename: false,
      profileGoal: true,
      remove: false,
    });
  });
  it("allows renaming built-in mobility but not deleting it", () => {
    expect(editability({ key: "mobility", kind: "check" })).toMatchObject({
      rename: true,
      remove: false,
    });
  });
  it("makes custom habits fully editable", () => {
    expect(editability({ key: "c-walk", kind: "value" })).toEqual({
      rename: true,
      target: true,
      hide: true,
      remove: true,
      profileGoal: false,
    });
  });
});

describe("habitKeyFor", () => {
  it("slugs labels and stays unique", () => {
    expect(habitKeyFor("Creatine 5 g", [])).toBe("c-creatine-5-g");
    expect(habitKeyFor("Creatine 5 g", ["c-creatine-5-g"])).toBe(
      "c-creatine-5-g-2",
    );
    expect(habitKeyFor("Créatine!!", [])).toBe("c-creatine");
    expect(habitKeyFor("💧", [])).toBe("c-habit");
  });
});

describe("validateDraft", () => {
  it("accepts a check habit", () => {
    expect(
      validateDraft({
        label: "  Vitamin   D ",
        kind: "check",
        target: "",
        unit: "",
      }),
    ).toEqual({
      ok: true,
      value: { label: "Vitamin D", kind: "check", target: null, unit: null },
    });
  });
  it("requires a positive target for value habits", () => {
    const r = validateDraft({
      label: "Mobility",
      kind: "value",
      target: "0",
      unit: "min",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.target).toBeDefined();
    expect(
      validateDraft({
        label: "Mobility",
        kind: "value",
        target: "10,5",
        unit: " min ",
      }),
    ).toEqual({
      ok: true,
      value: { label: "Mobility", kind: "value", target: 10.5, unit: "min" },
    });
  });
  it("rejects blanks and duplicate names", () => {
    expect(
      validateDraft({ label: " ", kind: "check", target: "", unit: "" }).ok,
    ).toBe(false);
    const dup = validateDraft(
      { label: "creatine 5 g", kind: "check", target: "", unit: "" },
      ["Creatine 5 g"],
    );
    expect(dup.ok).toBe(false);
  });
});

describe("moveHabit", () => {
  const list = [def("a", 0), def("b", 1), def("c", 2)];
  it("swaps neighbours and reports changed rows", () => {
    const { list: next, changed } = moveHabit(list, "c", -1);
    expect(next.map((d) => d.key)).toEqual(["a", "c", "b"]);
    expect(changed.map((d) => [d.key, d.sort])).toEqual([
      ["c", 1],
      ["b", 2],
    ]);
  });
  it("is a no-op at the edges", () => {
    expect(moveHabit(list, "a", -1).changed).toEqual([]);
    expect(moveHabit(list, "c", 1).changed).toEqual([]);
    expect(moveHabit(list, "zzz", 1).changed).toEqual([]);
  });
  it("heals duplicate sort values", () => {
    const { list: next } = moveHabit(
      [def("a", 0), def("b", 0), def("c", 7)],
      "c",
      -1,
    );
    expect(next.map((d) => d.sort)).toEqual([0, 1, 2]);
    expect(next.map((d) => d.key)).toEqual(["a", "c", "b"]);
  });
});

describe("presets", () => {
  it("knows which presets are already in the list", () => {
    const defs = [
      def("mobility", 7, { active: false, label: "Mobility (optional)" }),
      def("c-creatine-5-g", 8, { label: "Creatine 5 g" }),
    ];
    const mob = HABIT_PRESETS.find((p) => p.id === "mobility")!;
    const cre = HABIT_PRESETS.find((p) => p.id === "creatine")!;
    const vit = HABIT_PRESETS.find((p) => p.id === "vitamin-d")!;
    expect(presetState(mob, defs)).toBe("hidden");
    expect(presetState(cre, defs)).toBe("active");
    expect(presetState(vit, defs)).toBe("absent");
  });
  it("appends at the end and formats targets", () => {
    expect(nextSort([def("a", 3), def("b", 9)])).toBe(10);
    expect(nextSort([])).toBe(0);
    expect(formatTarget(8000, "steps")).toBe("8,000 steps");
    expect(formatTarget(2.5, "L")).toBe("2.5 L");
    expect(formatTarget(null, "min")).toBe("");
  });
});
