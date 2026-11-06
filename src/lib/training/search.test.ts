import { describe, expect, it } from "vitest";
import { getExercise } from "./library";
import { pickableLibrary } from "./programs";
import { alphabetical, editDistance, EQUIPMENT_FILTERS, exerciseLine, MUSCLE_FILTERS, passesFilters, searchLibrary, similarTo } from "./search";

const top = (q: string, n = 3, f = {}) => searchLibrary(q, f).slice(0, n).map((e) => e.slug);

describe("searchLibrary", () => {
  it("finds lifts by name, by prefix, in any word order", () => {
    expect(top("preacher")).toContain("preacher-curl");
    expect(top("incl db pre", 1)).toEqual(["incline-db-press"]);
    expect(top("press incline dumbbell", 2)).toContain("incline-db-press");
    expect(top("lat pull", 5)).toContain("lat-pulldown");
    expect(top("pullup", 10)).toEqual(expect.arrayContaining(["pull-up", "wide-grip-pull-up", "neutral-grip-pull-up"]));
  });

  it("forgives typos", () => {
    expect(top("laterl raise", 5)).toContain("db-lateral-raise");
    expect(top("tricep pushdwn", 5)).toContain("cable-triceps-pushdown");
    expect(top("romainan", 5)).toContain("romanian-deadlift");
    expect(top("hamer curl", 5)).toContain("hammer-curl");
    expect(top("bulgarain", 3)).toContain("bulgarian-split-squat");
  });

  it("understands gym shorthand", () => {
    expect(top("db row", 5)).toContain("db-row");
    expect(top("rdl", 5)).toContain("romanian-deadlift");
    expect(top("ohp", 5)).toContain("overhead-press");
    expect(top("kb swing", 2)).toContain("kettlebell-swing");
    // triceps lifts first (a typo match like "twist" may follow far below)
    expect(searchLibrary("tris").slice(0, 20).every((e) => [...e.primary, ...e.secondary].includes("triceps"))).toBe(true);
    expect(searchLibrary("tris").slice(0, 10).every((e) => e.primary.includes("triceps"))).toBe(true);
  });

  it("matches muscles and equipment too, name matches first", () => {
    const calves = searchLibrary("calves");
    expect(calves.length).toBeGreaterThanOrEqual(6);
    expect(calves.slice(0, 6).every((e) => e.primary.includes("calves"))).toBe(true);
    // a muscle word ranks lifts for that muscle above lifts that only have the word in their name
    const chest = searchLibrary("chest");
    expect(chest.findIndex((e) => e.slug === "machine-chest-press")).toBeLessThan(chest.findIndex((e) => e.slug === "chest-supported-row"));
    expect(searchLibrary("smith").every((e) => e.equipment === "smith" || /smith/i.test(e.name))).toBe(true);
    expect(searchLibrary("band").length).toBeGreaterThanOrEqual(5);
  });

  it("returns nothing for an empty query or nonsense, and never a retired lift", () => {
    expect(searchLibrary("")).toEqual([]);
    expect(searchLibrary("   ")).toEqual([]);
    expect(searchLibrary("zzqx")).toEqual([]);
    expect(searchLibrary("jump")).toEqual([]);
    expect(searchLibrary("box").some((e) => e.retired)).toBe(false);
  });

  it("applies the filters to the results", () => {
    const r = searchLibrary("curl", { equipment: "cable" });
    expect(r.length).toBeGreaterThanOrEqual(4);
    expect(r.every((e) => e.equipment === "cable")).toBe(true);
    expect(searchLibrary("press", { muscle: "upper_chest" }).every((e) => e.primary.includes("upper_chest"))).toBe(true);
  });
});

describe("filters", () => {
  it("every chip has lifts, and a muscle chip matches primary muscles only", () => {
    for (const m of MUSCLE_FILTERS) expect(pickableLibrary().filter((e) => passesFilters(e, { muscle: m.id })).length, m.id).toBeGreaterThanOrEqual(3);
    for (const q of EQUIPMENT_FILTERS) expect(pickableLibrary().filter((e) => passesFilters(e, { equipment: q.id })).length, q.id).toBeGreaterThanOrEqual(3);
    expect(passesFilters(getExercise("barbell-bench-press")!, { muscle: "triceps" })).toBe(false);
    expect(passesFilters(getExercise("hammer-curl")!, { muscle: "biceps" })).toBe(true);
    expect(passesFilters(getExercise("hammer-curl")!, { muscle: "biceps", equipment: "cable" })).toBe(false);
  });

  it("A–Z groups every pickable lift by first letter, in order", () => {
    const groups = alphabetical();
    expect(groups.flatMap((g) => g.items)).toHaveLength(pickableLibrary().length);
    expect(groups.map((g) => g.letter)).toEqual([...groups.map((g) => g.letter)].sort());
    for (const g of groups) for (const e of g.items) expect(/[a-z]/i.test(e.name[0]) ? e.name[0].toUpperCase() : "#").toBe(g.letter);
    const dumbbellBack = alphabetical({ muscle: "lats", equipment: "dumbbell" }).flatMap((g) => g.items);
    expect(dumbbellBack.every((e) => e.equipment === "dumbbell" && e.primary.includes("lats"))).toBe(true);
    expect(alphabetical({}, ["ab-wheel"]).flatMap((g) => g.items).some((e) => e.slug === "ab-wheel")).toBe(false);
  });
});

describe("similarTo", () => {
  it("lists the lift's substitutes first, then the same main muscle, never itself", () => {
    const s = similarTo("incline-db-curl").map((e) => e.slug);
    const subs = getExercise("incline-db-curl")!.substitutes;
    expect(s.slice(0, subs.length)).toEqual(subs);
    expect(s).not.toContain("incline-db-curl");
    expect(s.length).toBe(8);
    for (const slug of s.slice(subs.length)) expect(getExercise(slug)!.primary[0]).toBe("biceps");
  });

  it("keeps timed carries with timed lifts, and drops excluded ones", () => {
    expect(similarTo("farmer-carry").every((e) => e.tracking === "weight_time")).toBe(true);
    expect(similarTo("lat-pulldown").every((e) => e.tracking !== "weight_time")).toBe(true);
    expect(similarTo("lat-pulldown", 8, ["pull-up"]).map((e) => e.slug)).not.toContain("pull-up");
    expect(similarTo("not-a-lift")).toEqual([]);
  });
});

describe("helpers", () => {
  it("edit distance counts a swap of two letters as one", () => {
    expect(editDistance("curl", "curl")).toBe(0);
    expect(editDistance("crul", "curl")).toBe(1);
    expect(editDistance("pushdwn", "pushdown")).toBe(1);
    expect(editDistance("abc", "xyzxyz")).toBe(3);
  });

  it("a row reads its muscles and equipment in plain words", () => {
    expect(exerciseLine(getExercise("incline-db-press")!)).toBe("Upper chest · Dumbbell");
    expect(exerciseLine(getExercise("conventional-deadlift")!)).toBe("Hamstrings, glutes, lower back · Barbell");
    expect(exerciseLine(getExercise("band-pull-apart")!)).toBe("Rear delts · Band");
  });
});
