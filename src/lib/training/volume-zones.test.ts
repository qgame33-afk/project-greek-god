import { describe, expect, it } from "vitest";
import { PROGRAM_BY_KEY } from "./program";
import { LIBRARY } from "./library";
import { modeTemplate, weeklySetsByMuscle } from "./volume";
import { SET_ZONES, ZONE_OF, ZONE_ORDER, plannedSetsByZone, setsByZone, zoneRows, zoneStatus, zonesOf } from "./volume-zones";
import type { MuscleGroup } from "./types";

const set = (slug: string, extra: Record<string, unknown> = {}) => ({ exercise_slug: slug, weight_lb: 100, reps: 8, ...extra });

describe("SET_ZONES", () => {
  it("has the spec's defaults", () => {
    for (const z of ["chest", "back", "quads", "hamstrings", "shoulders"] as const) expect(SET_ZONES[z]).toEqual([10, 20]);
    for (const z of ["biceps", "triceps", "glutes", "calves"] as const) expect(SET_ZONES[z]).toEqual([8, 16]);
    expect(SET_ZONES.core).toEqual([6, 12]);
  });

  it("shows every zone once, in push / pull / legs / core order", () => {
    expect(new Set(ZONE_ORDER).size).toBe(Object.keys(SET_ZONES).length);
    expect(ZONE_ORDER[0]).toBe("chest");
    expect(ZONE_ORDER.at(-1)).toBe("core");
  });
});

describe("zoneStatus", () => {
  it("is inclusive at both ends of the zone", () => {
    expect(zoneStatus(9, [10, 20])).toBe("under");
    expect(zoneStatus(10, [10, 20])).toBe("in");
    expect(zoneStatus(20, [10, 20])).toBe("in");
    expect(zoneStatus(21, [10, 20])).toBe("above");
    expect(zoneStatus(0, [6, 12])).toBe("under");
  });
});

describe("the muscle → zone mapping", () => {
  it("maps every fine muscle group the library uses", () => {
    const used = new Set<MuscleGroup>(LIBRARY.flatMap((e) => e.primary));
    for (const m of used) expect(m in ZONE_OF).toBe(true);
  });

  it("puts the fine groups where the spec's coarse groups are", () => {
    expect(ZONE_OF.upper_chest).toBe("chest");
    expect(ZONE_OF.lats).toBe("back");
    expect(ZONE_OF.upper_back).toBe("back");
    expect(ZONE_OF.traps).toBe("back");
    expect(ZONE_OF.side_delts).toBe("shoulders");
    expect(ZONE_OF.rear_delts).toBe("shoulders");
    expect(ZONE_OF.front_delts).toBe("shoulders");
    expect(ZONE_OF.brachialis).toBe("biceps");
    expect(ZONE_OF.abs).toBe("core");
    expect(ZONE_OF.obliques).toBe("core");
    expect(ZONE_OF.forearms).toBeNull();
    expect(ZONE_OF.adductors).toBeNull();
    expect(ZONE_OF.full_body).toBeNull();
  });

  it("counts a set once per zone even with two primaries in it", () => {
    // chest-supported row: primary upper back + lats → one back set
    expect(zonesOf("chest-supported-row")).toEqual(["back"]);
    // hammer curl: brachialis + forearms → one biceps set, no "other"
    expect(zonesOf("hammer-curl")).toEqual(["biceps"]);
    // farmer carry: grip + forearms + traps → back
    expect(zonesOf("farmer-carry")).toEqual(["back"]);
    expect(zonesOf("not-in-library")).toEqual(["other"]);
    expect(zonesOf(null)).toEqual(["other"]);
  });
});

describe("setsByZone", () => {
  it("counts completed working sets only", () => {
    const z = setsByZone([
      set("barbell-bench-press"),
      set("barbell-bench-press"),
      set("barbell-bench-press", { kind: "warmup" }),
      set("barbell-bench-press", { completed: false }),
      set("chest-supported-row"),
      set("not-in-library"),
    ]);
    expect(z.chest).toBe(2);
    expect(z.back).toBe(1);
    expect(z.other).toBe(1);
    expect(z.quads).toBe(0);
  });

  it("matches weeklySetsByMuscle summed by zone when no set has two primaries in one zone", () => {
    const rows = [set("barbell-bench-press"), set("barbell-bench-press"), set("db-fly"), set("hammer-curl"), set("barbell-row")];
    const fine = weeklySetsByMuscle(rows);
    const zones = setsByZone(rows);
    const chest = fine.filter((r) => r.muscle !== "other" && ZONE_OF[r.muscle as MuscleGroup] === "chest").reduce((n, r) => n + r.sets, 0);
    expect(zones.chest).toBe(chest);
    // barbell row is upper back + lats: two fine-muscle credits, one back set
    const backFine = fine.filter((r) => r.muscle !== "other" && ZONE_OF[r.muscle as MuscleGroup] === "back").reduce((n, r) => n + r.sets, 0);
    expect(backFine).toBe(2);
    expect(zones.back).toBe(1);
  });
});

describe("plannedSetsByZone", () => {
  it("uses the set counts the template would start with in that mode", () => {
    const push = PROGRAM_BY_KEY.push_a;
    const standard = plannedSetsByZone([push], "standard");
    const deload = plannedSetsByZone([push], "deload");
    const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    expect(total(deload)).toBeLessThan(total(standard));
    // a template with one primary zone per exercise sums to its set count
    const eff = modeTemplate(push, "standard");
    const multi = eff.exercises.reduce((n, e) => n + Math.max(1, zonesOf(e.slug).length) * e.sets, 0);
    expect(total(standard)).toBe(multi);
    expect(standard.chest).toBeGreaterThan(0);
  });
});

describe("zoneRows", () => {
  it("labels each row with words and a VoiceOver sentence", () => {
    const done = setsByZone(Array.from({ length: 8 }, () => set("barbell-bench-press")));
    const rows = zoneRows(done, { ...done, chest: 6 });
    const chest = rows.find((r) => r.zone === "chest")!;
    expect(chest).toMatchObject({ sets: 8, range: [10, 20], status: "under", toZone: 2, planned: 6 });
    expect(chest.aria).toBe("Chest, 8 hard sets, target 10 to 20, under, 6 more planned");
    expect(rows).toHaveLength(ZONE_ORDER.length);
    expect(rows.find((r) => r.zone === "core")!.aria).toBe("Core, 0 hard sets, target 6 to 12, under");
  });
});
