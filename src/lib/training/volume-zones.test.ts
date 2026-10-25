import { PROGRAMS } from "./programs";
import { GROUP_LABEL, GROUP_ZONES, GROUPS, groupCredit, groupRows, groupSets, groupTrends, plannedGroupSets, volumeSuggestions } from "./volume-zones";
import { describe, expect, it } from "vitest";
import { TEMPLATE_DEFS as PROGRAM_BY_KEY } from "./programs";
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

/* ----------------------------------------------- 13 groups (PROGRAM-ARNOLD §5) */

describe("muscle groups with fractional credit (§5)", () => {
  const set = (slug: string, extra: Partial<{ completed: boolean; kind: string }> = {}) => ({ exercise_slug: slug, weight_lb: 50, reps: 10, ...extra });

  it("credits a primary muscle 1 and a secondary 0.5, each group once per set", () => {
    expect(groupCredit("incline-db-press")).toEqual({ chest: 1, front_delts: 0.5, triceps: 0.5 });
    expect(groupCredit("chest-supported-row")).toEqual({ back: 1, rear_delts: 0.5, biceps: 0.5 });
    expect(groupCredit("cross-body-hammer-curl")).toEqual({ biceps: 1, forearms: 1 });
    // lats + upper back are one back set, not two
    expect(groupSets([set("chest-supported-row")]).back).toBe(1);
  });

  it("ignores traps, retired and unknown lifts; warm-ups and open sets never count", () => {
    expect(groupCredit("cable-lateral-raise")).toEqual({ side_delts: 1 });
    expect(groupCredit("box-jump")).toEqual({});
    expect(groupCredit("my-custom-lift")).toEqual({});
    expect(groupCredit("my-custom-lift", { "my-custom-lift": ["biceps"] })).toEqual({ biceps: 1 });
    const g = groupSets([set("preacher-curl"), set("preacher-curl", { kind: "warmup" }), set("preacher-curl", { completed: false })]);
    expect(g.biceps).toBe(1);
    expect(GROUPS).toHaveLength(13);
    expect(GROUP_LABEL.chest).toBe("Upper chest and chest");
  });

  it("puts every group of the standard and intro Arnold weeks inside its zone (§5.3)", () => {
    const arnold = PROGRAMS.arnold.templates;
    const std = plannedGroupSets(arnold, "standard");
    const intro = plannedGroupSets(arnold, "intro");
    expect(std).toEqual({ chest: 14, side_delts: 10, rear_delts: 11.5, front_delts: 11, back: 19, biceps: 18, triceps: 17, forearms: 6.5, quads: 13, hamstrings: 13.5, glutes: 13.5, calves: 11, abs: 6 });
    expect(intro).toEqual({ chest: 12, side_delts: 8, rear_delts: 8, front_delts: 10, back: 14, biceps: 14, triceps: 14, forearms: 5, quads: 11, hamstrings: 10, glutes: 11, calves: 8, abs: 4 });
    for (const g of GROUPS) {
      expect(std[g] >= GROUP_ZONES[g][0] && std[g] <= GROUP_ZONES[g][1], `${g} standard`).toBe(true);
      expect(intro[g] >= GROUP_ZONES[g][0] && intro[g] <= GROUP_ZONES[g][1], `${g} intro`).toBe(true);
    }
    // with the optional reverse curls, forearms reach 8.5
    const withOpt = arnold.map((t) => ({ exercises: t.exercises.map((e) => ({ ...e, optional: false })) }));
    expect(plannedGroupSets(withOpt, "standard").forearms).toBe(8.5);
  });

  it("builds rows in Quinton's order with status and a spoken sentence", () => {
    const rows = groupRows(plannedGroupSets(PROGRAMS.arnold.templates, "standard"));
    expect(rows.map((r) => r.group)).toEqual(GROUPS);
    expect(rows.every((r) => r.status === "in")).toBe(true);
    expect(rows[1].aria).toBe("Side delts, 10 sets, range 8 to 20, in range");
  });

  /* history: per slug, newest first */
  const hist = (slug: string, loads: [string, number, number][], mode: "standard" | "deload" = "standard") =>
    loads.map(([d, w, r], i) => ({ local_date: d, session_id: `${slug}-${d}`, set_index: 0, weight_lb: w, reps: r, duration_sec: null, rir: null, mode, _i: i }));
  const today = "2026-11-20";

  it("gives side delts and biceps their own trend from the same weeks (Q§5)", () => {
    const history = {
      "cable-lateral-raise": hist("cable-lateral-raise", [["2026-11-16", 22, 15], ["2026-11-09", 21, 15], ["2026-11-02", 20, 15], ["2026-10-26", 20, 14]]),
      "db-lateral-raise": hist("db-lateral-raise", [["2026-11-19", 25, 15], ["2026-11-12", 24, 15], ["2026-11-05", 22, 15]]),
      "preacher-curl": hist("preacher-curl", [["2026-11-16", 50, 10], ["2026-11-09", 50, 10], ["2026-11-02", 50, 10]]),
      "cable-curl": hist("cable-curl", [["2026-11-19", 40, 12], ["2026-11-12", 40, 12], ["2026-11-05", 40, 12]]),
    };
    const t = groupTrends(history, today);
    expect(t.side_delts.trend).toBe("up");
    expect(t.biceps.trend).toBe("flat");
    expect(t.side_delts.lifts.map((l) => l.slug).sort()).toEqual(["cable-lateral-raise", "db-lateral-raise"]);
    expect(t.triceps.trend).toBe("unknown");
  });

  // weekly sets: 3 complete weeks before the week of `today` (Mon 2026-11-16)
  const weeks = ["2026-10-26", "2026-11-02", "2026-11-09"];
  const repeat = (slug: string, perWeek: number) => weeks.flatMap((w) => Array.from({ length: perWeek }, () => ({ ...set(slug), local_date: w })));
  const base = {
    today,
    sessions: weeks.map((w) => ({ local_date: w, status: "done", mode: "standard" })),
    checkins: [] as { local_date: string; soreness: number | null; fatigue: number | null }[],
    templates: PROGRAMS.arnold.templates,
    mode: "standard" as const,
    programSince: null,
    startDate: "2026-09-01",
  };
  const trend = (t: "up" | "flat" | "down" | "unknown") => ({ trend: t, changePct: t === "down" ? -3 : 0, weeks: 6 as const, lifts: [] });

  it("trims a group above its zone that isn't progressing, naming the accessory", () => {
    const out = volumeSuggestions({ ...base, sets: repeat("lat-pulldown", 24), trends: { back: trend("flat") } });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ group: "back", kind: "trim", sets: 2 });
    expect(out[0].reason).toMatch(/^Lats and upper back: about 2 fewer sets a week\. It hasn't progressed at 24 sets\./);
    expect(out[0].exercise?.templateKey).toBe("chest_back_b");
  });

  it("never suggests anything for a group that is progressing, under or over its zone", () => {
    expect(volumeSuggestions({ ...base, sets: repeat("lat-pulldown", 24), trends: { back: trend("up") } })).toEqual([]);
    expect(volumeSuggestions({ ...base, sets: repeat("cable-lateral-raise", 4), trends: { side_delts: trend("up") } })).toEqual([]);
  });

  it("adds to a group under its zone only when it isn't progressing and recovery is fine", () => {
    const out = volumeSuggestions({ ...base, sets: repeat("cable-lateral-raise", 6), trends: { side_delts: trend("flat") } });
    expect(out[0]).toMatchObject({ group: "side_delts", kind: "add", sets: 2 });
    expect(out[0].reason).toBe("Side delts: add 2 sets a week, for example one more set of Dumbbell Lateral Raises.");
    const sore = Array.from({ length: 7 }, (_, i) => ({ local_date: `2026-11-1${i}`, soreness: 4, fatigue: 3 }));
    expect(volumeSuggestions({ ...base, checkins: sore, sets: repeat("cable-lateral-raise", 6), trends: { side_delts: trend("flat") } })).toEqual([]);
  });

  it("holds a group losing strength while recovery is strained", () => {
    const sore = Array.from({ length: 7 }, (_, i) => ({ local_date: `2026-11-1${i}`, soreness: 4, fatigue: 2 }));
    const out = volumeSuggestions({ ...base, checkins: sore, sets: repeat("preacher-curl", 12), trends: { biceps: trend("down") } });
    expect(out[0]).toMatchObject({ group: "biceps", kind: "hold", sets: 0 });
    expect(out[0].reason).toBe("Biceps: keep the sets where they are and recover first. Strength is down 3% with soreness 4/5.");
  });

  it("gives at most two, trim before hold before add; nothing in light weeks or before 3 weeks of the program", () => {
    const sets = [...repeat("lat-pulldown", 24), ...repeat("hack-squat", 24), ...repeat("cable-lateral-raise", 2)];
    const trends = { back: trend("flat"), quads: trend("down"), side_delts: trend("flat") };
    const out = volumeSuggestions({ ...base, sets, trends });
    expect(out.map((x) => x.kind)).toEqual(["trim", "trim"]);
    expect(volumeSuggestions({ ...base, mode: "intro", sets, trends })).toEqual([]);
    expect(volumeSuggestions({ ...base, programSince: "2026-11-05", sets, trends })).toEqual([]);
    const deloadWeeks = { ...base, sessions: weeks.map((w) => ({ local_date: w, status: "done", mode: "deload" })) };
    expect(volumeSuggestions({ ...deloadWeeks, sets, trends })).toEqual([]);
  });
});
