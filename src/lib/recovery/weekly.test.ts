import { describe, expect, it } from "vitest";
import {
  consistencyLabel,
  stdDev,
  trendOf,
  weeklyReview,
  type WeeklyInput,
} from "./weekly";
import type { CheckinLite, SessionLite } from "./guidance";
import { addDays } from "@/lib/dates";

const WS = "2026-10-05"; // Monday
const PREV = addDays(WS, -7);

const ci = (date: string, over: Partial<CheckinLite> = {}): CheckinLite => ({
  local_date: date,
  sleep_hours: null,
  sleep_quality: null,
  energy: null,
  soreness: null,
  fatigue: null,
  stress: null,
  pain_notes: null,
  volleyball: false,
  ...over,
});
const sess = (
  date: string,
  sets = 18,
  vol = 10000,
  status = "done",
): SessionLite => ({
  local_date: date,
  status,
  sets_completed: sets,
  total_volume_lb: vol,
});
const week = (start: string) =>
  Array.from({ length: 7 }, (_, i) => addDays(start, i));
const plannedSix = week(WS).slice(0, 6);

const base = (over: Partial<WeeklyInput> = {}): WeeklyInput => ({
  weekStart: WS,
  today: addDays(WS, 10), // the week is over
  sleepGoalH: 8,
  checkins: [],
  sessions: [],
  volleyball: [],
  plannedDates: plannedSix,
  ...over,
});

describe("helpers", () => {
  it("computes population standard deviation", () => {
    expect(stdDev([8])).toBeNull();
    expect(stdDev([7, 9])).toBe(1);
    expect(stdDev([8, 8, 8])).toBe(0);
  });
  it("labels consistency and trends", () => {
    expect(consistencyLabel(0.4)).toBe("Steady");
    expect(consistencyLabel(0.9)).toBe("Fairly steady");
    expect(consistencyLabel(1.3)).toBe("Variable");
    expect(trendOf(3.2, 3)).toBe("flat");
    expect(trendOf(2, 2.3)).toBe("down");
    expect(trendOf(3.6, 3)).toBe("up");
    expect(trendOf(2.4, 3)).toBe("down");
    expect(trendOf(3, null)).toBeNull();
  });
});

describe("weeklyReview", () => {
  it("returns an empty review with no recommendations when nothing was logged", () => {
    const r = weeklyReview(base());
    expect(r.empty).toBe(true);
    expect(r.sleep.avg).toBeNull();
    expect(r.sleep.sd).toBeNull();
    expect(r.recommendations).toEqual([]);
  });

  it("summarises a well-recovered week and keeps the plan", () => {
    const days = week(WS);
    const r = weeklyReview(
      base({
        checkins: days.map((d) =>
          ci(d, { sleep_hours: 8, soreness: 2, fatigue: 2, energy: 4 }),
        ),
        sessions: plannedSix.map((d) => sess(d)),
      }),
    );
    expect(r.sleep.avg).toBe(8);
    expect(r.sleep.nights).toBe(7);
    expect(r.sleep.nightsAtGoal).toBe(7);
    expect(r.sleep.consistency).toBe("Steady");
    expect(r.training).toMatchObject({
      done: 6,
      planned: 6,
      sets: 108,
      volumeLb: 60000,
    });
    expect(r.restDays).toBe(1);
    expect(r.recommendations).toEqual([
      {
        key: "keep",
        title: "Keep the same plan",
        reason: "Sleep, soreness, fatigue and training are on track.",
      },
    ]);
  });

  it("never claims a signal is on track when it wasn't logged", () => {
    const days = week(WS);
    const r = weeklyReview(
      base({
        checkins: days.map((d) => ci(d, { sleep_hours: 8 })),
        sessions: plannedSix.map((d) => sess(d)),
      }),
    );
    expect(r.recommendations[0].key).toBe("keep");
    expect(r.recommendations[0].reason).toBe(
      "Sleep and training are on track. Rate soreness and fatigue at check-in to include them.",
    );
    expect(r.recommendations[0].reason).not.toMatch(/soreness (is|are) on track/);
  });

  it("flags short, erratic sleep and rising soreness", () => {
    const hours = [5.5, 8.5, 6, 8.75, 5.25, 7, 6];
    const r = weeklyReview(
      base({
        checkins: [
          ...week(WS).map((d, i) =>
            ci(d, { sleep_hours: hours[i], soreness: 4, fatigue: 3 }),
          ),
          ...week(PREV).map((d) =>
            ci(d, { sleep_hours: 7.5, soreness: 2, fatigue: 2 }),
          ),
        ],
        sessions: plannedSix.map((d) => sess(d)),
      }),
    );
    expect(r.sleep.avg).toBeCloseTo(6.71, 2);
    expect(r.sleep.sd).toBeGreaterThan(1);
    expect(r.soreness).toMatchObject({ avg: 4, prevAvg: 2, trend: "up" });
    const keys = r.recommendations.map((x) => x.key);
    expect(keys).toEqual(["lighter", "sleep", "consistency"]);
    expect(r.recommendations[0].reason).toBe(
      "Soreness averaged 4/5 (up from 2). Drop one set per exercise and keep RIR 2–3.",
    );
    expect(r.recommendations[1].title).toBe("Protect sleep: aim for 8 h");
  });

  it("suggests a deload after two high-fatigue weeks", () => {
    const r = weeklyReview(
      base({
        checkins: [
          ...week(WS).map((d) => ci(d, { sleep_hours: 8, fatigue: 4 })),
          ...week(PREV).map((d) => ci(d, { sleep_hours: 8, fatigue: 4 })),
        ],
        sessions: plannedSix.map((d) => sess(d)),
      }),
    );
    expect(r.recommendations[0].key).toBe("deload");
  });

  it("asks for check-ins when few nights are logged", () => {
    const r = weeklyReview(
      base({
        checkins: [ci(WS, { sleep_hours: 8 })],
        sessions: plannedSix.map((d) => sess(d)),
      }),
    );
    expect(r.recommendations[0]).toMatchObject({
      key: "log",
      reason: "1 of 7 nights logged, so this review is partial.",
    });
  });

  it("counts volleyball from sessions and check-in flags without double counting", () => {
    const r = weeklyReview(
      base({
        checkins: week(WS).map((d, i) =>
          ci(d, { sleep_hours: 8, volleyball: i === 1 || i === 3 || i === 6 }),
        ),
        volleyball: [
          { local_date: addDays(WS, 1), duration_min: 90 },
          { local_date: addDays(WS, 3), duration_min: 60 },
          { local_date: addDays(PREV, 1), duration_min: 90 },
        ],
        sessions: plannedSix.map((d) => sess(d)),
      }),
    );
    expect(r.volleyball).toEqual({
      sessions: 3,
      minutes: 150,
      prevSessions: 1,
    });
    expect(r.restDays).toBe(0); // Sunday had volleyball
    const keys = r.recommendations.map((x) => x.key);
    expect(keys).toContain("volleyball");
    expect(keys).toContain("rest");
  });

  it("compares training volume with the previous week", () => {
    const r = weeklyReview(
      base({
        checkins: week(WS).map((d) => ci(d, { sleep_hours: 8 })),
        sessions: [
          ...plannedSix.map((d) => sess(d, 20, 12500)),
          ...week(PREV)
            .slice(0, 6)
            .map((d) => sess(d, 18, 10000)),
          sess(addDays(WS, 2), 5, 999, "active"),
        ],
      }),
    );
    expect(r.training.volumeLb).toBe(75000);
    expect(r.training.prevVolumeLb).toBe(60000);
    expect(r.training.volumeChange).toBe(0.25);
    expect(r.training.sets).toBe(120);
  });

  it("compares an unfinished week with the same days of last week", () => {
    const today = addDays(WS, 2); // Wednesday
    const r = weeklyReview(
      base({
        today,
        checkins: [
          ci(WS, { sleep_hours: 8 }),
          ci(addDays(WS, 1), { sleep_hours: 8 }),
          ci(today, { sleep_hours: 8 }),
        ],
        sessions: [
          sess(WS, 18, 10000),
          sess(addDays(WS, 1), 18, 12000),
          ...week(PREV)
            .slice(0, 6)
            .map((d) => sess(d, 18, 10000)),
        ],
      }),
    );
    expect(r.training.compareTo).toBe("same days last week");
    expect(r.training.volumeChange).toBe(-0.27); // 22,000 vs 30,000 (Mon–Wed last week)
  });

  it("only counts elapsed days for an in-progress week", () => {
    const today = addDays(WS, 2); // Wednesday
    const r = weeklyReview(
      base({
        today,
        checkins: [
          ci(WS, { sleep_hours: 7.75 }),
          ci(addDays(WS, 1), { sleep_hours: 8 }),
          ci(today, { sleep_hours: 8.25 }),
        ],
        sessions: [sess(WS)],
      }),
    );
    expect(r.inProgress).toBe(true);
    expect(r.daysElapsed).toBe(3);
    expect(r.training.plannedSoFar).toBe(3);
    expect(r.restDays).toBe(2);
    expect(r.recommendations[0].key).toBe("schedule");
    expect(r.recommendations[0].reason).toBe(
      "1 of 3 planned sessions done. Move a session instead of doubling up.",
    );
  });

  it("ignores days before the user's start date", () => {
    const r = weeklyReview(
      base({
        startDate: addDays(WS, 4),
        checkins: [ci(addDays(WS, 4), { sleep_hours: 8 })],
      }),
    );
    expect(r.daysElapsed).toBe(3);
  });
});
