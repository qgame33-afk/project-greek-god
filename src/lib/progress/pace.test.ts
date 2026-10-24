import { describe, expect, it } from "vitest";
import { addDays, daysBetween, type ISODate } from "@/lib/dates";
import {
  bandOf,
  dayMonth,
  gildFraction,
  highWater,
  MIN_WEIGHINS,
  pace,
  paceCorridor,
  projectAt,
  rateAt,
  roman,
  terraces,
  trendAt,
  trendSeries,
  verdictFor,
  type ProfileForPace,
  type RateReading,
} from "./pace";

const TODAY = "2026-10-17";
const TARGET = "2027-08-01";

/** Daily weigh-ins on a straight line of `perWeek` lb a week that puts the 7-day trend at `trend` on `ref`. */
function line(ref: ISODate, trend: number, perWeek: number, days = 28, noise: number[] = [0]) {
  const perDay = perWeek / 7;
  const out: { local_date: ISODate; weight_lb: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = days - 1 - i;
    // the mean of the last 7 days sits 3 days before ref
    out.push({ local_date: addDays(ref, -i), weight_lb: trend + perDay * (3 - i) + noise[k % noise.length] });
  }
  return out;
}

const profile: ProfileForPace = {
  start_weight_lb: 163,
  goal_weight_lb: 183,
  goal_range_min_lb: 180,
  goal_range_max_lb: 185,
  start_date: "2026-09-01",
  target_date: TARGET,
};

const ok = (lbPerWeek: number): RateReading => ({ lbPerWeek, n: 20, spanDays: 27, from: addDays(TODAY, -27), to: TODAY, status: "ok", includesEarlyWater: false });

describe("the mock day (§4.1.2 #1)", () => {
  const w = line(TODAY, 168.4, 0.4);

  it("trend 168.4, rate 0.40, 184.9 by 1 Aug, corridor 0.28–0.40, verdict top", () => {
    const p = pace({ weighIns: w, today: TODAY, profile });
    expect(p.trend.lb).toBe(168.4);
    expect(p.trend.n).toBe(7);
    expect(p.rate.lbPerWeek).toBe(0.4);
    expect(p.rate.status).toBe("ok");
    expect(daysBetween(TODAY, TARGET)).toBe(288);
    expect(projectAt(168.4, 0.4, TODAY, TARGET)).toBe(184.9); // 168.4 + 0.4 × 41.14
    expect(p.projection).toEqual({ lb: 184.9, date: TARGET });
    expect(p.corridor).toEqual({ minRate: 0.28, maxRate: 0.4, weeksLeft: 41.14, bandMin: 180, bandMax: 185 });
    expect(p.verdict).toBe("top");
    expect(p.sentence).toBe("On track, a bit fast.");
    expect(p.detail).toBe("+0.40 lb a week · ~184.9 lb by 1 Aug");
    expect(p.ariaLabel).toBe("Trend 168.4 pounds, gaining 0.4 pounds a week, projected 184.9 on 1 August, on track, a bit fast.");
    expect(p.band).toEqual({ min: 180, max: 185 });
  });

  it("gilds 27% of the climb (start 163, goal 183)", () => {
    expect(gildFraction(168.4, 163, 183, w.length)).toBeCloseTo(0.27, 5);
  });
});

describe("trendAt", () => {
  it("averages the 7 days ending at ref and reports the latest scale reading", () => {
    const w = [
      { local_date: "2026-10-01", weight_lb: 164 },
      { local_date: "2026-10-11", weight_lb: 165 },
      { local_date: "2026-10-14", weight_lb: 166 },
      { local_date: "2026-10-17", weight_lb: 167.6 },
    ];
    const t = trendAt(w, TODAY);
    expect(t.lb).toBe(166.2);
    expect(t.n).toBe(3);
    expect(t.end).toBe(TODAY);
    expect(t.latest).toEqual({ lb: 167.6, date: "2026-10-17" });
  });

  it("is null with no weigh-ins ever", () => {
    expect(trendAt([], TODAY)).toEqual({ lb: null, n: 0, end: TODAY, latest: null });
  });

  it("anchors at the last weigh-in when it is older than the window (§4.1.2 #8)", () => {
    const w = [
      { local_date: "2026-10-01", weight_lb: 165 },
      { local_date: "2026-10-04", weight_lb: 166 },
      { local_date: "2026-10-09", weight_lb: 167 },
    ];
    const t = trendAt(w, TODAY);
    expect(t.end).toBe("2026-10-09");
    expect(t.lb).toBe(166.5); // Oct 4 + Oct 9
    expect(t.n).toBe(2);
    // exactly one day outside the window still anchors (never an empty window)
    const edge = trendAt([{ local_date: "2026-10-10", weight_lb: 170 }], TODAY);
    expect(edge.end).toBe("2026-10-10");
    expect(edge.lb).toBe(170);
    // inside the window: anchored at ref
    expect(trendAt([{ local_date: "2026-10-11", weight_lb: 170 }], TODAY).end).toBe(TODAY);
  });

  it("ignores future rows, non-numbers and bad dates", () => {
    const w = [
      { local_date: "2026-10-16", weight_lb: 168 },
      { local_date: "2026-10-18", weight_lb: 999 },
      { local_date: "2026-10-15", weight_lb: Number.NaN },
      { local_date: "bad", weight_lb: 150 },
      { local_date: "2026-10-14", weight_lb: "167" as unknown as number },
    ];
    const t = trendAt(w, TODAY);
    expect(t.lb).toBe(167.5);
    expect(t.n).toBe(2);
    expect(t.latest?.date).toBe("2026-10-16");
  });

  it("does not care about input order", () => {
    const w = line(TODAY, 168.4, 0.4);
    expect(trendAt([...w].reverse(), TODAY)).toEqual(trendAt(w, TODAY));
  });
});

describe("trendSeries", () => {
  it("one point per weigh-in date, ascending, 7-day trailing mean", () => {
    const w = [
      { local_date: "2026-10-10", weight_lb: 170 },
      { local_date: "2026-10-01", weight_lb: 160 },
      { local_date: "2026-10-05", weight_lb: 162 },
    ];
    expect(trendSeries(w)).toEqual([
      { date: "2026-10-01", lb: 160 },
      { date: "2026-10-05", lb: 161 },
      { date: "2026-10-10", lb: 166 }, // Oct 4–10: 162, 170
    ]);
  });

  it("filters by from/to but averages with earlier rows", () => {
    const w = [
      { local_date: "2026-10-01", weight_lb: 160 },
      { local_date: "2026-10-05", weight_lb: 162 },
      { local_date: "2026-10-10", weight_lb: 170 },
    ];
    expect(trendSeries(w, "2026-10-05", "2026-10-05")).toEqual([{ date: "2026-10-05", lb: 161 }]);
    expect(trendSeries([], "2026-10-01")).toEqual([]);
  });

  it("matches trendAt on every weigh-in date", () => {
    const w = line(TODAY, 168.4, 0.4, 40, [0.3, -0.2, 0.1, -0.4, 0.2, 0, 0]).filter((_, i) => i % 3 !== 1);
    for (const pt of trendSeries(w)) expect(trendAt(w, pt.date).lb).toBe(pt.lb);
  });
});

describe("rateAt", () => {
  it("recovers a perfect +0.5 lb a week line (§4.1.2 #5)", () => {
    const r = rateAt(line(TODAY, 168, 0.5), TODAY);
    expect(r.lbPerWeek).toBe(0.5);
    expect(r.status).toBe("ok");
    expect(r.n).toBe(28);
    expect(r.spanDays).toBe(27);
    expect(r.from).toBe("2026-09-20");
    expect(r.to).toBe(TODAY);
  });

  it("stays within ±0.05 of the true slope on noisy data", () => {
    const noise = [0.3, -0.2, 0.1, -0.4, 0.2, 0, 0]; // a weekly water pattern
    const daily = rateAt(line(TODAY, 168, 0.5, 28, noise), TODAY).lbPerWeek!;
    expect(Math.abs(daily - 0.5)).toBeLessThanOrEqual(0.05);
    const twoA = line(TODAY, 168, 0.5, 28, [0.25, -0.25]); // alternating morning swings
    expect(Math.abs(rateAt(twoA, TODAY).lbPerWeek! - 0.5)).toBeLessThanOrEqual(0.05);
    // sparse, uneven weigh-ins on the true line are still exact
    const sparse = line(TODAY, 168, 0.5).filter((_, i) => [0, 2, 5, 7, 9, 12, 15, 16, 19, 22, 26, 27].includes(i));
    expect(rateAt(sparse, TODAY).lbPerWeek).toBe(0.5);
  });

  it("only uses the 28 days ending at ref", () => {
    const old = [{ local_date: "2026-08-01", weight_lb: 140 }];
    expect(rateAt([...old, ...line(TODAY, 168, 0.3)], TODAY).lbPerWeek).toBe(0.3);
  });

  it("needs 4 weigh-ins (§4.1.2 #2)", () => {
    const w = [
      { local_date: "2026-10-01", weight_lb: 165 },
      { local_date: "2026-10-09", weight_lb: 166 },
      { local_date: "2026-10-17", weight_lb: 167 },
    ];
    const r = rateAt(w, TODAY);
    expect(r.status).toBe("needs_weighins");
    expect(r.lbPerWeek).toBeNull();
    expect(r.n).toBe(3);
    expect(r.spanDays).toBe(16);
    expect(rateAt([], TODAY)).toMatchObject({ status: "needs_weighins", n: 0, spanDays: 0, lbPerWeek: null });
  });

  it("needs a 10-day span (§4.1.2 #3)", () => {
    const w = [11, 12, 14, 17].map((d) => ({ local_date: `2026-10-${d}`, weight_lb: 166 + d / 10 }));
    const r = rateAt(w, TODAY);
    expect(r.status).toBe("needs_span");
    expect(r.spanDays).toBe(6);
    expect(r.lbPerWeek).toBeNull();
    // span of exactly 10 days is enough
    const ten = [7, 10, 14, 17].map((d) => ({ local_date: `2026-10-${String(d).padStart(2, "0")}`, weight_lb: 166 }));
    expect(rateAt(ten, TODAY)).toMatchObject({ status: "ok", spanDays: 10, lbPerWeek: 0 });
  });

  it("flags windows overlapping the first 14 programme days (§4.1.2 #4)", () => {
    const w = line(TODAY, 168, 0.4);
    expect(rateAt(w, TODAY, "2026-10-01").includesEarlyWater).toBe(true);
    expect(rateAt(w, TODAY, "2026-09-07").includesEarlyWater).toBe(true); // day 14 is Sep 20, the window's first day
    expect(rateAt(w, TODAY, "2026-09-06").includesEarlyWater).toBe(false);
    expect(rateAt(w, TODAY, "2026-11-01").includesEarlyWater).toBe(false); // programme hasn't started
    expect(rateAt(w, TODAY).includesEarlyWater).toBe(false);
    expect(rateAt(w, TODAY, null).includesEarlyWater).toBe(false);
  });

  it("is exact across a DST change (Nov 1) and handles losses and flat lines", () => {
    const ref = "2026-11-10";
    expect(rateAt(line(ref, 170, 0.35), ref).lbPerWeek).toBe(0.35);
    expect(rateAt(line("2027-03-20", 178, -0.2), "2027-03-20").lbPerWeek).toBe(-0.2); // spring forward Mar 14
    const flat = rateAt(line(TODAY, 170, 0), TODAY);
    expect(flat.lbPerWeek).toBe(0);
    expect(Object.is(flat.lbPerWeek, -0)).toBe(false);
  });

  it("ignores future rows", () => {
    const w = [...line(TODAY, 168, 0.4), { local_date: "2026-10-20", weight_lb: 200 }];
    expect(rateAt(w, TODAY).lbPerWeek).toBe(0.4);
  });
});

describe("paceCorridor", () => {
  it("is the rate range that lands the trend in the band at the target date", () => {
    expect(paceCorridor(168.4, TODAY, TARGET, 180, 185)).toEqual({ minRate: 0.28, maxRate: 0.4, weeksLeft: 41.14, bandMin: 180, bandMax: 185 });
  });
  it("is null on or after the target date", () => {
    expect(paceCorridor(170, TARGET, TARGET, 180, 185)).toBeNull();
    expect(paceCorridor(170, "2027-08-02", TARGET, 180, 185)).toBeNull();
  });
  it("orders a reversed band", () => {
    expect(paceCorridor(170, TODAY, TARGET, 185, 180)).toMatchObject({ bandMin: 180, bandMax: 185 });
  });
});

describe("verdictFor", () => {
  const c = paceCorridor(168.4, TODAY, TARGET, 180, 185)!; // 0.28–0.40, top from 0.382
  it("needs data unless the rate is ok", () => {
    expect(verdictFor({ ...ok(0.4), status: "needs_span", lbPerWeek: null }, c, 168.4)).toBe("needs_data");
    expect(verdictFor(ok(0.4), c, null)).toBe("needs_data");
    expect(verdictFor(ok(0.4), null, 168.4)).toBe("needs_data"); // nothing to judge against
  });
  it("below / on_pace / top / above", () => {
    expect(verdictFor(ok(0.27), c, 168.4)).toBe("below");
    expect(verdictFor(ok(0.28), c, 168.4)).toBe("on_pace");
    expect(verdictFor(ok(0.35), c, 168.4)).toBe("on_pace");
    expect(verdictFor(ok(0.38), c, 168.4)).toBe("on_pace");
    expect(verdictFor(ok(0.39), c, 168.4)).toBe("top");
    expect(verdictFor(ok(0.4), c, 168.4)).toBe("top");
    expect(verdictFor(ok(0.41), c, 168.4)).toBe("above");
    expect(verdictFor(ok(-0.2), c, 168.4)).toBe("below");
  });
  it("arrived once the trend reaches the band, even with a fast rate", () => {
    expect(verdictFor(ok(1.2), paceCorridor(180.2, TODAY, TARGET, 180, 185), 180.2)).toBe("arrived");
  });
  it("after the target date: arrived inside the band, else below", () => {
    expect(verdictFor(ok(0.3), null, 181, { min: 180, max: 185 })).toBe("arrived");
    expect(verdictFor(ok(0.3), null, 178, { min: 180, max: 185 })).toBe("below");
  });
});

describe("pace copy", () => {
  it("fresh user: no trend, pace after 4 weigh-ins", () => {
    const p = pace({ weighIns: [], today: TODAY, profile });
    expect(p.trend.lb).toBeNull();
    expect(p.verdict).toBe("needs_data");
    expect(p.sentence).toBe("Your pace appears after 4 weigh-ins.");
    expect(p.detail).toBe("0 of 4 weigh-ins in the last 4 weeks");
    expect(p.projection).toBeNull();
    expect(p.corridor).toBeNull();
    expect(p.ariaLabel).toBe("No weigh-ins yet. Your pace appears after 4 weigh-ins.");
  });

  it("1–3 weigh-ins: trend shows, no projection", () => {
    const w = [
      { local_date: "2026-10-15", weight_lb: 166 },
      { local_date: "2026-10-16", weight_lb: 166.4 },
      { local_date: "2026-10-17", weight_lb: 166.2 },
    ];
    const p = pace({ weighIns: w, today: TODAY, profile });
    expect(p.trend.lb).toBe(166.2);
    expect(p.projection).toBeNull();
    expect(p.verdict).toBe("needs_data");
    expect(p.detail).toBe("3 of 4 weigh-ins in the last 4 weeks");
    expect(p.ariaLabel).toBe("Trend 166.2 pounds. Your pace appears after 4 weigh-ins. 3 of 4 weigh-ins in the last 4 weeks.");
    expect(gildFraction(p.trend.lb, 163, 183, w.length)).toBe(0);
  });

  it("4 weigh-ins over too few days says what is missing", () => {
    const w = [11, 12, 14, 17].map((d) => ({ local_date: `2026-10-${d}`, weight_lb: 166 }));
    const p = pace({ weighIns: w, today: TODAY, profile });
    expect(p.verdict).toBe("needs_data");
    expect(p.sentence).toBe("Your pace appears after 10 days of weigh-ins.");
    expect(p.detail).toBe("Weigh-ins span 6 of 10 days in the last 4 weeks");
  });

  it("4 weigh-ins over 10+ days: projection and gild appear", () => {
    const w = [3, 7, 12, 17].map((d) => ({ local_date: `2026-10-${String(d).padStart(2, "0")}`, weight_lb: 166 + d * 0.05 }));
    const p = pace({ weighIns: w, today: TODAY, profile });
    expect(p.rate.status).toBe("ok");
    expect(p.projection).not.toBeNull();
    expect(gildFraction(p.trend.lb, 163, 183, w.length)).toBeGreaterThan(0);
  });

  it("below, on pace, above, arrived", () => {
    const below = pace({ weighIns: line(TODAY, 168.4, 0.2), today: TODAY, profile });
    expect(below.verdict).toBe("below");
    expect(below.sentence).toBe("A bit slow.");
    expect(below.detail).toBe("+0.20 lb a week · 0.28–0.40 lands you in 180–185 lb");
    expect(below.ariaLabel).toContain("a bit slow, against a needed pace of 0.28 to 0.4 pounds a week.");

    const on = pace({ weighIns: line(TODAY, 168.4, 0.33), today: TODAY, profile });
    expect(on.verdict).toBe("on_pace");
    expect(on.sentence).toBe("On track.");
    expect(on.detail).toBe("+0.33 lb a week · ~182.0 lb by 1 Aug");
    expect(on.ariaLabel.endsWith(", on track.")).toBe(true);

    const fast = pace({ weighIns: line(TODAY, 168.4, 0.9), today: TODAY, profile });
    expect(fast.verdict).toBe("above");
    expect(fast.sentence).toBe("A bit fast.");
    expect(fast.detail).toBe("+0.90 lb a week · 0.28–0.40 is the lean-gain window");

    const there = pace({ weighIns: line(TODAY, 181.2, 0.1), today: TODAY, profile });
    expect(there.verdict).toBe("arrived");
    expect(there.sentence).toBe("You're inside 180–185 lb.");
    expect(there.detail).toBe("Trend 181.2 lb · hold here");
    expect(there.ariaLabel).toBe("Trend 181.2 pounds, gaining 0.1 pounds a week, inside your goal band of 180 to 185 pounds.");

    const over = pace({ weighIns: line(TODAY, 187, 0.1), today: TODAY, profile });
    expect(over.verdict).toBe("arrived");
    expect(over.sentence).toBe("You're above 180–185 lb.");
  });

  it("a losing week reads as losing, never as a negative gain", () => {
    const p = pace({ weighIns: line(TODAY, 168.4, -0.3), today: TODAY, profile });
    expect(p.detail.startsWith("−0.30 lb a week")).toBe(true);
    expect(p.ariaLabel).toContain("losing 0.3 pounds a week");
  });

  it("a stale trend says 'as of' and projects from the trend's date", () => {
    const w = line("2026-10-08", 168, 0.4, 20);
    const p = pace({ weighIns: w, today: TODAY, profile });
    expect(p.trend.end).toBe("2026-10-08");
    expect(p.ariaLabel.startsWith("Trend 168 pounds, as of 8 October")).toBe(true);
    expect(p.projection!.lb).toBe(projectAt(168, p.rate.lbPerWeek!, "2026-10-08", TARGET));
  });

  it("after the target date there is no projection or corridor", () => {
    const p = pace({ weighIns: line("2027-08-10", 178, 0.3), today: "2027-08-10", profile });
    expect(p.corridor).toBeNull();
    expect(p.projection).toBeNull();
    expect(p.verdict).toBe("below");
    expect(p.detail).toBe("+0.30 lb a week · the target date has passed");
  });

  it("without a profile it never invents a verdict", () => {
    const p = pace({ weighIns: line(TODAY, 168.4, 0.4), today: TODAY, profile: null });
    expect(p.verdict).toBe("needs_data");
    expect(p.sentence).toBe("Your pace needs a goal band.");
    expect(p.projection).toBeNull();
    expect(p.rate.lbPerWeek).toBe(0.4);
  });

  it("kg users get identical lb math; only the copy converts (§4.1.2 #9)", () => {
    const w = line(TODAY, 168.4, 0.4);
    const lb = pace({ weighIns: w, today: TODAY, profile });
    const kg = pace({ weighIns: w, today: TODAY, profile, unit: "kg" });
    expect(kg.trend).toEqual(lb.trend);
    expect(kg.rate).toEqual(lb.rate);
    expect(kg.corridor).toEqual(lb.corridor);
    expect(kg.projection).toEqual(lb.projection);
    expect(kg.verdict).toBe(lb.verdict);
    expect(kg.detail).toBe("+0.18 kg a week · ~83.9 kg by 1 Aug");
    expect(kg.ariaLabel).toContain("Trend 76.4 kilograms");
  });

  it("falls back to the goal weight when the band is unset", () => {
    expect(bandOf({ goal_weight_lb: 183, goal_range_min_lb: null, goal_range_max_lb: null })).toEqual({ min: 183, max: 183 });
    expect(bandOf({ goal_weight_lb: "183", goal_range_min_lb: "180", goal_range_max_lb: "185" })).toEqual({ min: 180, max: 185 });
    expect(bandOf({ goal_weight_lb: null, goal_range_min_lb: null, goal_range_max_lb: null })).toBeNull();
    expect(bandOf(null)).toBeNull();
  });

  it("formats day-month and adds a year only when far away", () => {
    expect(dayMonth(TARGET, TODAY)).toBe("1 Aug");
    expect(dayMonth(TARGET, TODAY, true)).toBe("1 August");
    expect(dayMonth("2028-01-05", TODAY)).toBe("5 Jan 2028");
  });
});

describe("terraces (§4.1.2 #6)", () => {
  it("start 163, band 180 → seven terraces I–VII", () => {
    const p = pace({ weighIns: [], today: TODAY, profile });
    const t = terraces(p, [], 163, 180);
    expect(t.map((x) => x.lb)).toEqual([165, 167.5, 170, 172.5, 175, 177.5, 180]);
    expect(t.map((x) => x.numeral)).toEqual(["I", "II", "III", "IV", "V", "VI", "VII"]);
    expect(t.filter((x) => x.final).map((x) => x.lb)).toEqual([180]);
    expect(t.every((x) => x.eta === null && x.reachedOn === null)).toBe(true);
  });

  it("a start on a multiple of the step is not a terrace", () => {
    const p = pace({ weighIns: [], today: TODAY, profile });
    expect(terraces(p, [], 165, 175).map((x) => x.lb)).toEqual([167.5, 170, 172.5, 175]);
  });

  it("reachedOn is the first crossing; ETA = trend date + (lb − trend) / rate weeks", () => {
    const w = line(TODAY, 168.4, 0.4, 60);
    const p = pace({ weighIns: w, today: TODAY, profile });
    const series = trendSeries(w);
    const t = terraces(p, series, 163, 180);
    const first165 = series.find((s) => s.lb >= 165)!.date;
    expect(t[0].reachedOn).toBe(first165);
    expect(t[0].eta).toBeNull();
    expect(t[1].reachedOn).toBe(series.find((s) => s.lb >= 167.5)!.date);
    // Terrace III, 170: (170 − 168.4) / 0.4 = 4 weeks = 28 days
    expect(t[2].reachedOn).toBeNull();
    expect(t[2].eta).toBe(addDays(TODAY, 28));
    expect(t[6].eta).toBe(addDays(TODAY, Math.round(((180 - 168.4) / 0.4) * 7)));
  });

  it("no ETA with a flat or falling rate, or before the rate exists", () => {
    const flat = pace({ weighIns: line(TODAY, 168.4, 0), today: TODAY, profile });
    expect(terraces(flat, [], 163, 180).every((x) => x.eta === null)).toBe(true);
    const down = pace({ weighIns: line(TODAY, 168.4, -0.2), today: TODAY, profile });
    expect(terraces(down, [], 163, 180).every((x) => x.eta === null)).toBe(true);
  });

  it("roman numerals", () => {
    expect([1, 4, 7, 9, 12, 14].map(roman)).toEqual(["I", "IV", "VII", "IX", "XII", "XIV"]);
  });
});

describe("gildFraction (§4.1.2 #7)", () => {
  it("is 0 below 4 weigh-ins and without a trend", () => {
    expect(MIN_WEIGHINS).toBe(4);
    expect(gildFraction(170, 163, 183, 3)).toBe(0);
    expect(gildFraction(null, 163, 183, 10)).toBe(0);
    expect(gildFraction(170, 163, 183, 4)).toBeCloseTo(0.35, 5);
  });
  it("follows the trend down (no ratchet) and clamps", () => {
    expect(gildFraction(168.4, 163, 183, 10)).toBeCloseTo(0.27, 5);
    expect(gildFraction(167.0, 163, 183, 10)).toBeLessThan(gildFraction(168.4, 163, 183, 10));
    expect(gildFraction(150, 163, 183, 10)).toBe(0);
    expect(gildFraction(190, 163, 183, 10)).toBe(1);
    expect(gildFraction(170, 170, 170, 10)).toBe(1);
    expect(gildFraction(Number.NaN, 163, 183, 10)).toBe(0);
  });
});

describe("highWater", () => {
  it("is the best trend so far, earliest on a tie", () => {
    expect(highWater([])).toBeNull();
    expect(
      highWater([
        { date: "2026-10-01", lb: 168 },
        { date: "2026-10-05", lb: 168.6 },
        { date: "2026-10-09", lb: 168.6 },
        { date: "2026-10-12", lb: 168.2 },
      ]),
    ).toEqual({ lb: 168.6, date: "2026-10-05" });
  });
});
