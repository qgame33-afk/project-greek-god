import { describe, expect, it } from "vitest";
import { buildWeightRows, lastWeighIns, nearestWeighInIndex, rangeFrom, tickLabel, xTicks, yDomain, dateToT } from "./weightSeries";
import {
  compareMonths,
  defaultMilestone,
  measurementMonths,
  monthSnapshot,
  monthlyAverage,
  monthsBetween,
  parseRoadmap,
  removeOverride,
  roadmapMonths,
  upsertOverride,
} from "./months";
import { DEFAULT_ROADMAP } from "@/lib/bodyweight";

const W = [
  { local_date: "2026-10-01", weight_lb: 163.0 },
  { local_date: "2026-10-02", weight_lb: 163.4 },
  { local_date: "2026-10-04", weight_lb: 163.2 },
  { local_date: "2026-10-08", weight_lb: 164.0, notes: "salty dinner" },
  { local_date: "2026-10-15", weight_lb: 164.6 },
];

describe("weight chart series", () => {
  it("picks range starts", () => {
    expect(rangeFrom("7d", "2026-10-16", "2026-09-01")).toBe("2026-10-10");
    expect(rangeFrom("30d", "2026-10-16", null)).toBe("2026-09-17");
    expect(rangeFrom("all", "2026-10-16", "2026-10-01", "2026-09-20")).toBe("2026-09-20");
    expect(rangeFrom("all", "2026-10-16", null, null)).toBe("2026-09-17");
  });

  it("builds rows with a trailing 7-day average from all data", () => {
    const rows = buildWeightRows(W, { from: "2026-10-04", to: "2026-10-16", unit: "lb" });
    expect(rows.map((r) => r.date)).toEqual(["2026-10-04", "2026-10-08", "2026-10-15"]);
    // Oct 4 average includes Oct 1 and 2 even though they're outside the window
    expect(rows[0].avg).toBeCloseTo((163 + 163.4 + 163.2) / 3, 2);
    expect(rows[1].note).toBe("salty dinner");
    expect(rows.every((r) => r.plan === null)).toBe(true);
  });

  it("adds PLAN anchors only inside the programme window", () => {
    const plan = { startDate: "2026-10-01", targetDate: "2027-08-01", startLb: 163, goalLb: 183 };
    const rows = buildWeightRows(W, { from: "2026-09-25", to: "2026-10-16", unit: "lb", plan });
    const anchors = rows.filter((r) => r.weight == null);
    // 09-25 is before the plan start, so it gets no anchor; plan start and range end do
    expect(anchors.map((r) => r.date)).toEqual(["2026-10-01", "2026-10-16"].filter((d) => !W.some((w) => w.local_date === d)));
    expect(rows.find((r) => r.date === "2026-10-01")!.plan).toBe(163);
    expect(rows.find((r) => r.date === "2026-10-16")!.plan).toBeGreaterThan(163.9);
    // ordered by time
    expect(rows.map((r) => r.t)).toEqual([...rows.map((r) => r.t)].sort((a, b) => a - b));
  });

  it("converts to kg for display", () => {
    const rows = buildWeightRows([{ local_date: "2026-10-01", weight_lb: 220.46 }], { from: "2026-10-01", to: "2026-10-01", unit: "kg" });
    expect(rows[0].weight).toBeCloseTo(100, 1);
  });

  it("y domain pads and includes the plan only when shown", () => {
    const rows = [
      { date: "a", t: 1, weight: 163, avg: 163.2, plan: 170, note: null },
      { date: "b", t: 2, weight: 164, avg: 163.6, plan: null, note: null },
    ];
    expect(yDomain(rows, false)).toEqual([162, 165]);
    expect(yDomain(rows, true)).toEqual([162, 171]);
    expect(yDomain([], true)).toBeNull();
  });

  it("x ticks are whole days and labels read OCT 12", () => {
    const t = xTicks("2026-10-01", "2026-10-31", 5);
    expect(t).toHaveLength(5);
    expect(t[0]).toBe(dateToT("2026-10-01"));
    expect(t.at(-1)).toBe(dateToT("2026-10-31"));
    expect(tickLabel(dateToT("2026-10-12"))).toBe("OCT 12");
    expect(xTicks("2026-10-01", "2026-10-01")).toHaveLength(1);
  });

  it("scrubbing snaps to the nearest real weigh-in", () => {
    const rows = [
      { date: "a", t: 1, weight: null, avg: null, plan: 1, note: null },
      { date: "b", t: 2, weight: 163, avg: 163, plan: 1, note: null },
      { date: "c", t: 3, weight: null, avg: null, plan: 1, note: null },
    ];
    expect(nearestWeighInIndex(rows, 0)).toBe(1);
    expect(nearestWeighInIndex(rows, 2)).toBe(1);
    expect(nearestWeighInIndex([], 0)).toBeNull();
    expect(lastWeighIns(rows, 7).map((r) => r.date)).toEqual(["b"]);
  });
});

describe("month aggregates", () => {
  it("lists months inclusively", () => {
    expect(monthsBetween("2026-10-16", "2027-08-01")).toHaveLength(11);
    expect(monthsBetween("2026-10-16", "2027-08-01")[0]).toBe("2026-10-01");
    expect(monthsBetween("2026-10-16", "2027-08-01").at(-1)).toBe("2027-08-01");
  });

  it("averages a month (and month-to-date)", () => {
    expect(monthlyAverage(W, "2026-10-01")).toBeCloseTo((163 + 163.4 + 163.2 + 164 + 164.6) / 5, 2);
    expect(monthlyAverage(W, "2026-10-01", "2026-10-02")).toBeCloseTo(163.2, 2);
    expect(monthlyAverage(W, "2026-11-01")).toBeNull();
  });

  it("maps the spec milestones onto the programme months", () => {
    // Oct → Aug: exactly the spec order
    expect(Array.from({ length: 11 }, (_, i) => defaultMilestone(i, 11)!.title)).toEqual(DEFAULT_ROADMAP.map((d) => d.title));
    // A 12-month plan keeps the final review last and refine second-to-last
    const twelve = Array.from({ length: 12 }, (_, i) => defaultMilestone(i, 12)!.title);
    expect(twelve.at(-1)).toBe(DEFAULT_ROADMAP[10].title);
    expect(twelve.at(-2)).toBe(DEFAULT_ROADMAP[9].title);
    expect(twelve[0]).toBe(DEFAULT_ROADMAP[0].title);
    // a short plan still ends with the final review
    expect(defaultMilestone(2, 3)!.title).toBe(DEFAULT_ROADMAP[10].title);
    expect(defaultMilestone(5, 3)).toBeNull();
  });

  it("validates roadmap overrides and edits them immutably", () => {
    const parsed = parseRoadmap([{ offset: 2, title: "Deload + review", detail: "x" }, { offset: -1, title: "bad" }, "junk", { offset: 3 }]);
    expect(parsed).toEqual([{ offset: 2, title: "Deload + review", detail: "x" }]);
    expect(parseRoadmap(null)).toEqual([]);
    const next = upsertOverride(parsed, { offset: 0, title: "Day one", detail: "" });
    expect(next.map((o) => o.offset)).toEqual([0, 2]);
    expect(upsertOverride(next, { offset: 2, title: "Changed", detail: "" }).find((o) => o.offset === 2)!.title).toBe("Changed");
    expect(removeOverride(next, 0)).toEqual(parsed);
  });

  it("builds roadmap entries with PLAN, LOGGED and status", () => {
    const plan = { startDate: "2026-10-01", targetDate: "2027-08-01", startLb: 163, goalLb: 183 };
    const months = roadmapMonths({
      plan,
      today: "2026-11-10",
      overrides: [{ offset: 1, title: "Habits first", detail: "Six sessions a week." }],
      weights: [...W, { local_date: "2026-11-03", weight_lb: 165 }, { local_date: "2026-11-20", weight_lb: 170 }],
      startLabel: "163.0 lb",
    });
    expect(months).toHaveLength(11);
    expect(months[0].status).toBe("past");
    expect(months[0].railFill).toBe(1);
    expect(months[0].detail.startsWith("Start at 163.0 lb")).toBe(true);
    expect(months[0].logged).toBeCloseTo(163.64, 2);
    expect(months[1].status).toBe("current");
    expect(months[1].custom).toBe(true);
    expect(months[1].title).toBe("Habits first");
    // month-to-date: the Nov 20 weigh-in is in the future relative to today and is ignored
    expect(months[1].logged).toBe(165);
    expect(months[1].railFill).toBeGreaterThan(0.3);
    expect(months[1].railFill).toBeLessThan(0.4);
    expect(months[2].status).toBe("future");
    expect(months[2].logged).toBeNull();
    // PLAN at month end, reaching the goal in the final month
    expect(months[0].plan).toBeGreaterThan(163);
    expect(months.at(-1)!.plan).toBe(183);
  });

  it("snapshots and compares measurement months", () => {
    const rows = [
      { local_date: "2026-10-01", waist_in: 30.5, chest_in: 38.5 },
      { local_date: "2026-10-20", waist_in: 30.75, chest_in: null },
      { local_date: "2026-11-15", waist_in: 31, chest_in: 39.25 },
    ];
    expect(measurementMonths(rows)).toEqual(["2026-11-01", "2026-10-01"]);
    expect(monthSnapshot(rows, "2026-10-01", "waist_in")).toEqual({ value: 30.75, date: "2026-10-20" });
    expect(monthSnapshot(rows, "2026-10-01", "chest_in")).toEqual({ value: 38.5, date: "2026-10-01" });
    const cmp = compareMonths(rows, "2026-10-01", "2026-11-01", ["waist_in", "chest_in", "calf_in"]);
    expect(cmp[0].diff).toBe(0.25);
    expect(cmp[1].diff).toBe(0.75);
    expect(cmp[2]).toEqual({ field: "calf_in", a: null, b: null, diff: null });
  });
});
