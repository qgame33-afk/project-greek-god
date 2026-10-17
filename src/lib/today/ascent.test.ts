import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { pace, trendAt } from "@/lib/progress/pace";
import { ascentProgress, paceCaption, paceTone } from "./ascent";

const TODAY = "2026-10-17";
const w = (d: string, lb: number) => ({ local_date: d, weight_lb: lb });

describe("ascentProgress on the one trend", () => {
  it("reads its trend from pace.trendAt", () => {
    const rows = [w("2026-10-01", 164), w("2026-10-11", 165), w("2026-10-14", 166), w("2026-10-17", 167.6)];
    const a = ascentProgress(163, 183, rows, TODAY);
    const t = trendAt(rows, TODAY);
    expect(a.trend).toBe(t.lb);
    expect(a.avg7).toBe(t.lb);
    expect(a.avgCount).toBe(t.n);
    expect(a.avgEnd).toBe(t.end);
    expect(a.latest).toBe(167.6);
    expect(a.p).toBeCloseTo((166.2 - 163) / 20, 5);
  });

  it("gilds only from the 4th weigh-in, and follows the trend down", () => {
    const three = [w("2026-10-15", 168), w("2026-10-16", 168.4), w("2026-10-17", 168.8)];
    const a3 = ascentProgress(163, 183, three, TODAY);
    expect(a3.p).toBeGreaterThan(0);
    expect(a3.gild).toBe(0);
    expect(a3.weighInsToGild).toBe(1);
    const four = [w("2026-10-14", 168), ...three];
    const a4 = ascentProgress(163, 183, four, TODAY);
    expect(a4.gild).toBeCloseTo(a4.p, 5);
    expect(a4.weighInsToGild).toBe(0);
    const lower = ascentProgress(163, 183, [...four.slice(0, 3), w("2026-10-17", 160)], TODAY);
    expect(lower.gild).toBeLessThan(a4.gild);
    expect(ascentProgress(163, 183, [], TODAY)).toMatchObject({ gild: 0, weighInsToGild: 4 });
    expect(ascentProgress(null, 183, four, TODAY).gild).toBe(0);
  });

  it("weeklyChange keeps its old meaning for the exported shape", () => {
    const rows = Array.from({ length: 14 }, (_, i) => w(addDays(TODAY, -13 + i), 166 + i * 0.1));
    expect(ascentProgress(163, 183, rows, TODAY).weeklyChange).toBe(0.7);
  });
});

describe("paceTone / paceCaption (old screens)", () => {
  const profile = { start_weight_lb: 163, goal_weight_lb: 183, goal_range_min_lb: 180, goal_range_max_lb: 185, start_date: "2026-09-01", target_date: "2027-08-01" };
  const line = (perWeek: number) => Array.from({ length: 28 }, (_, i) => w(addDays(TODAY, -27 + i), 168.4 + (perWeek / 7) * (i - 24)));

  it("follows the pace verdict, never the sign", () => {
    expect(paceTone("on_pace")).toBe("good");
    expect(paceTone("top")).toBe("good");
    expect(paceTone("arrived")).toBe("good");
    expect(paceTone("above")).toBe("warn");
    expect(paceTone("below")).toBe("neutral");
    expect(paceTone("needs_data")).toBe("neutral");
  });

  it("says what the rate needs or where it sits", () => {
    expect(paceCaption(pace({ weighIns: [], today: TODAY, profile }))).toBe("0 of 4 weigh-ins · last 4 weeks");
    expect(paceCaption(pace({ weighIns: [11, 12, 14, 17].map((d) => w(`2026-10-${d}`, 166)), today: TODAY, profile }))).toBe("Needs 10 days of weigh-ins");
    expect(paceCaption(pace({ weighIns: line(0.4), today: TODAY, profile }))).toBe("Top of your corridor");
    expect(paceCaption(pace({ weighIns: line(0.33), today: TODAY, profile }))).toBe("On pace · last 4 weeks");
    expect(paceCaption(pace({ weighIns: line(0.1), today: TODAY, profile }))).toBe("Under your corridor");
    expect(paceCaption(pace({ weighIns: line(1), today: TODAY, profile }))).toBe("Faster than your corridor");
  });
});
