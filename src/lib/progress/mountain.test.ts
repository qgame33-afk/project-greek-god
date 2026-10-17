import { describe, expect, it } from "vitest";
import { addDays, daysBetween, type ISODate } from "@/lib/dates";
import { pace, terraces, trendSeries } from "./pace";
import { boxesOverlap, defaultZoom, gaugeGeometry, insetGeometry, mountainGeometry, polylineHitsBox, ridgeProfile, tickStep, yAt, zoomDomain, type MountainGeometry, type Pt, type Zoom } from "./mountain";

const PROFILE = { start_weight_lb: 163, goal_weight_lb: 183, goal_range_min_lb: 180, goal_range_max_lb: 185, start_date: "2026-09-11", target_date: "2027-08-01" };

/** Daily weigh-ins from `from` for `days` days on a line of `perWeek`, with a fixed wobble. */
function weighIns(from: ISODate, days: number, perWeek: number, base = 163, skip = 0) {
  const out: { local_date: ISODate; weight_lb: number }[] = [];
  for (let i = 0; i < days; i++) {
    if (skip && i % skip === 0 && i > 0) continue;
    const wobble = [0.4, -0.3, 0.1, -0.5, 0.2, 0.6, -0.2][i % 7];
    out.push({ local_date: addDays(from, i), weight_lb: Math.round((base + (perWeek / 7) * i + wobble) * 10) / 10 });
  }
  return out;
}

interface Fixture {
  name: string;
  today: ISODate;
  w: { local_date: ISODate; weight_lb: number }[];
  profile?: typeof PROFILE;
}

const FIXTURES: Fixture[] = [
  { name: "demo: 6 weeks in", today: "2026-10-17", w: weighIns("2026-09-11", 37, 0.45, 163, 6) },
  { name: "mature: 6 months in", today: "2027-03-12", w: weighIns("2026-09-11", 183, 0.45) },
  { name: "fast gain, above the corridor", today: "2026-12-01", w: weighIns("2026-09-11", 82, 1.2) },
  { name: "losing", today: "2026-11-20", w: weighIns("2026-09-11", 71, -0.3) },
  { name: "fresh: no weigh-ins", today: "2026-09-12", w: [] },
  { name: "near the summit", today: "2027-07-01", w: weighIns("2026-09-11", 294, 0.42) },
];

function build(f: Fixture, zoom: Zoom, width = 390, height = 320, ax = false): MountainGeometry {
  const profile = f.profile ?? PROFILE;
  const p = pace({ weighIns: f.w, today: f.today, profile });
  const series = trendSeries(f.w, undefined, f.today);
  return mountainGeometry({
    width,
    height,
    zoom,
    today: f.today,
    start: { date: profile.start_date, lb: profile.start_weight_lb },
    target: profile.target_date,
    band: p.band,
    weighIns: f.w.filter((x) => x.local_date <= f.today).map((x) => ({ date: x.local_date, lb: x.weight_lb })),
    series,
    pace: p,
    terraces: terraces(p, series, profile.start_weight_lb, p.band!.min),
    unit: "lb",
    ax,
  });
}

const ZOOMS: Zoom[] = ["6w", "3m", "season"];
const WIDTHS = [320, 390, 560, 1040];

describe("the decorative ridge", () => {
  it("is a smooth silhouette (no jagged steps between samples)", () => {
    const prof = ridgeProfile();
    expect(prof.length).toBeGreaterThan(60);
    for (let i = 2; i < prof.length; i++) {
      const d1 = prof[i - 1].h - prof[i - 2].h;
      const d2 = prof[i].h - prof[i - 1].h;
      expect(Math.abs(d2 - d1)).toBeLessThan(0.06); // no sudden change of slope
    }
  });

  for (const f of FIXTURES)
    for (const zoom of ZOOMS)
      for (const width of WIDTHS)
        it(`stays in the bottom 30% and never touches the trend or projection · ${f.name} · ${zoom} · ${width}px`, () => {
          const g = build(f, zoom, width);
          const floor = g.plot.y + g.plot.h * 0.7 - 0.01;
          for (const p of g.ridge.points) expect(p.y).toBeGreaterThanOrEqual(floor);
          const lines: Pt[][] = [g.trend];
          if (g.projection) lines.push([g.projection.from, g.projection.to]);
          if (g.corridor) lines.push([g.corridor.origin, g.corridor.lower]);
          for (const p of g.ridge.points)
            for (const l of lines) {
              const v = yAt(l, p.x);
              if (v != null) expect(v).toBeLessThan(p.y); // the data mark is above the ridge
            }
          // and no segment of the ridge crosses a data segment
          for (const l of lines)
            for (let i = 1; i < l.length; i++) {
              const box = { x: Math.min(l[i - 1].x, l[i].x), y: Math.min(l[i - 1].y, l[i].y), w: Math.abs(l[i].x - l[i - 1].x), h: Math.abs(l[i].y - l[i - 1].y) };
              if (box.w === 0) continue;
              const under = g.ridge.points.filter((p) => p.x >= box.x && p.x <= box.x + box.w);
              for (const p of under) expect(p.y).toBeGreaterThan((yAt([l[i - 1], l[i]], p.x) ?? -Infinity) + 0.5);
            }
        });
});

describe("labels", () => {
  for (const f of FIXTURES)
    for (const width of WIDTHS)
      it(`the projection label never overlaps the band label · ${f.name} · ${width}px`, () => {
        const g = build(f, "season", width);
        if (g.projection?.label && g.band?.label) expect(boxesOverlap(g.projection.label, g.band.label)).toBe(false);
        if (g.climberLabel && g.band?.label) expect(boxesOverlap(g.climberLabel, g.band.label)).toBe(false);
        if (g.climberLabel && g.projection?.label) expect(boxesOverlap(g.climberLabel, g.projection.label)).toBe(false);
      });

  it("puts the projection label on the line's end with the date", () => {
    const g = build(FIXTURES[1], "season");
    expect(g.projection?.endInside).toBe(true);
    expect(g.projection?.label?.text).toMatch(/^~1\d\d\.\d · 1 Aug$/);
    const end = g.projection!.end;
    const l = g.projection!.label!;
    expect(Math.abs(l.x + l.w - end.x)).toBeLessThan(2); // right-aligned to the end
    expect(Math.min(Math.abs(l.y + l.h - end.y), Math.abs(l.y - end.y))).toBeLessThanOrEqual(8);
  });

  it("labels the band OLYMPUS · 180–185, left-aligned inside it", () => {
    const g = build(FIXTURES[1], "season");
    expect(g.band?.label?.text).toBe("OLYMPUS · 180–185");
    expect(g.band!.label!.x).toBeCloseTo(g.plot.x + 6, 5);
    expect(g.band!.label!.y).toBeGreaterThanOrEqual(g.band!.y0 - 0.5);
  });
});

describe("axes and zoom", () => {
  it("ticks every 5 lb (1 lb in 6W, 10 lb at AX sizes)", () => {
    const f = FIXTURES[1];
    const diffs = (g: MountainGeometry) => g.yTicks.slice(1).map((t, i) => Math.round((t.lb - g.yTicks[i].lb) * 100) / 100);
    expect(new Set(diffs(build(f, "season")))).toEqual(new Set([5]));
    expect(new Set(diffs(build(f, "6w")))).toEqual(new Set([1]));
    expect(new Set(diffs(build(f, "season", 390, 240, true)))).toEqual(new Set([10]));
    expect(tickStep("season", "kg")).toBe(2);
    for (const g of [build(f, "season"), build(f, "6w")]) for (const t of g.yTicks) expect(t.y).toBeGreaterThanOrEqual(g.plot.y - 0.5);
  });

  it("labels months on Season and 3M, weeks on 6W", () => {
    expect(build(FIXTURES[1], "season").xTicks.map((t) => t.label).join("")).toMatch(/^OND?J?F?M?A?M?J?J?A?$|^[A-Z]+$/);
    expect(build(FIXTURES[0], "3m").xTicks.map((t) => t.label)).toEqual(["Oct", "Nov", "Dec"]);
    for (const t of build(FIXTURES[1], "6w").xTicks) expect(t.label).toMatch(/^\d{1,2} [A-Z][a-z]{2}$/);
  });

  it("3M while the programme is under 12 weeks old, then Season", () => {
    expect(defaultZoom("2026-09-11", "2026-10-17")).toBe("3m");
    expect(defaultZoom("2026-09-11", "2026-12-03")).toBe("3m"); // day 83
    expect(defaultZoom("2026-09-11", "2026-12-04")).toBe("season"); // week 12
    expect(defaultZoom(null, "2026-10-17")).toBe("3m");
  });

  it("zoom windows: Season is start → target; 6W and 3M look mostly back", () => {
    expect(zoomDomain("season", "2026-10-17", "2026-09-11", "2027-08-01", "2026-09-11")).toEqual(["2026-09-11", "2027-08-01"]);
    const [a, b] = zoomDomain("6w", "2027-03-12", "2026-09-11", "2027-08-01", "2026-09-11");
    expect(daysBetween(a, b)).toBe(42);
    expect(daysBetween("2027-03-12", b)).toBe(7);
    // young programme: the window starts at the start date
    expect(zoomDomain("3m", "2026-10-17", "2026-09-11", "2027-08-01", "2026-09-11")[0]).toBe("2026-09-11");
  });

  it("6W shows only the last weeks' weigh-ins", () => {
    const g = build(FIXTURES[1], "6w");
    for (const d of g.dots) expect(d.date >= g.from && d.date <= g.to).toBe(true);
    expect(g.dots.length).toBeLessThanOrEqual(36);
  });
});

describe("fresh account", () => {
  it("draws the corridor from the start to the band, with no history or projection", () => {
    const g = build(FIXTURES[4], "season");
    expect(g.trend).toHaveLength(0);
    expect(g.dots).toHaveLength(0);
    expect(g.projection).toBeNull();
    expect(g.climber).toBeNull();
    expect(g.corridor).not.toBeNull();
    expect(g.corridor!.origin.x).toBeCloseTo(g.x("2026-09-11"), 5);
    expect(g.corridor!.upper.y).toBeCloseTo(g.y(185), 5);
    expect(g.corridor!.lower.y).toBeCloseTo(g.y(180), 5);
  });
});

describe("the Season inset", () => {
  for (const f of FIXTURES.slice(0, 4))
    for (const width of [390, 560])
      it(`never covers data · ${f.name} · ${width}px`, () => {
        const g = build(f, "season", width);
        if (!g.inset) return;
        expect(polylineHitsBox(g.trend, g.inset)).toBe(false);
        if (g.projection) expect(polylineHitsBox([g.projection.from, g.projection.to], g.inset)).toBe(false);
        if (g.corridor) expect(polylineHitsBox([g.corridor.origin, g.corridor.lower], g.inset)).toBe(false);
        for (const l of [g.band?.label, g.projection?.label]) if (l) expect(boxesOverlap(l, g.inset)).toBe(false);
      });

  it("draws the last 6 weeks of the trend only", () => {
    const f = FIXTURES[1];
    const s = trendSeries(f.w, undefined, f.today);
    const ig = insetGeometry(s, f.today, { w: 120, h: 56 })!;
    expect(ig.points.length).toBeLessThanOrEqual(42);
    expect(ig.points.every((p) => p.x >= 0 && p.x <= 120 && p.y >= 0 && p.y <= 56)).toBe(true);
  });
});

describe("pace gauge", () => {
  it("runs 0 → 0.8 with the window and the rate placed on it", () => {
    const g = gaugeGeometry(0.4, { minRate: 0.28, maxRate: 0.4 });
    expect(g.min).toBe(0);
    expect(g.max).toBe(0.8);
    expect(g.window!.from).toBeCloseTo(0.35, 5);
    expect(g.window!.to).toBeCloseTo(0.5, 5);
    expect(g.rate).toBeCloseTo(0.5, 5);
  });
  it("stretches for a fast rate and for a loss", () => {
    expect(gaugeGeometry(1.2, { minRate: 0.3, maxRate: 0.42 }).max).toBeCloseTo(1.5, 5);
    const loss = gaugeGeometry(-0.3, { minRate: 0.3, maxRate: 0.42 });
    expect(loss.min).toBeCloseTo(-0.375, 5);
    expect(loss.rate).toBeGreaterThanOrEqual(0);
  });
  it("shows only the window when there is no rate yet", () => {
    const g = gaugeGeometry(null, { minRate: 0.38, maxRate: 0.49 });
    expect(g.rate).toBeNull();
    expect(g.window).not.toBeNull();
  });
});
