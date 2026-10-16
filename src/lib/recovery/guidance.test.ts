import { describe, expect, it } from "vitest";
import {
  computeGuidance,
  hasSignal,
  planLite,
  sleepPoints,
  trainingStreak,
  volumeChange,
  type CheckinLite,
  type ReadinessInput,
  type SessionLite,
} from "./guidance";
import { addDays } from "@/lib/dates";

const D = "2026-10-16"; // a Friday

const ci = (over: Partial<CheckinLite> = {}, date = D): CheckinLite => ({
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

const pullB = planLite("pull_b", "Pull B", [
  "neutral-grip-lat-pulldown",
  "preacher-curl",
]);
const legsA = planLite("legs_a", "Legs A", [
  "box-jump",
  "approach-jump",
  "back-squat",
]);
const legsNoJumps = planLite("legs_b", "Legs B", ["hack-squat", "leg-press"]);
const rest = planLite("rest", null, []);

const input = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  date: D,
  sleepGoalH: 8,
  checkins: [],
  volleyballDates: [],
  sessions: [],
  plan: pullB,
  ...over,
});

describe("sleepPoints", () => {
  it("scales with the deficit to the goal", () => {
    expect(sleepPoints(8, 8)).toBe(0);
    expect(sleepPoints(7.5, 8)).toBe(0);
    expect(sleepPoints(7.25, 8)).toBe(1);
    expect(sleepPoints(6.5, 8)).toBe(2);
    expect(sleepPoints(5.5, 8)).toBe(3);
    expect(sleepPoints(9, 8)).toBe(0);
  });
});

describe("computeGuidance", () => {
  it("asks for a check-in instead of guessing when nothing is logged", () => {
    const g = computeGuidance(input());
    expect(g.level).toBe("unknown");
    expect(g.hasCheckin).toBe(false);
    expect(g.title).toMatch(/check in/i);
    expect(g.detail).toContain("Pull B");
  });

  it("does not treat a volleyball-only check-in as a recovery signal", () => {
    expect(hasSignal(ci({ volleyball: true }))).toBe(false);
    expect(
      computeGuidance(input({ checkins: [ci({ volleyball: true })] })).level,
    ).toBe("unknown");
  });

  it("says train as planned when markers are fine", () => {
    const g = computeGuidance(
      input({
        checkins: [
          ci({
            sleep_hours: 8,
            energy: 4,
            soreness: 2,
            fatigue: 2,
            stress: 2,
            sleep_quality: 4,
          }),
        ],
      }),
    );
    expect(g.level).toBe("go");
    expect(g.title).toBe("Train as planned");
    expect(g.score).toBe(0);
    expect(g.reasons[0]).toBe("Slept 8 of 8 h");
    expect(g.adjustments).toEqual({
      dropSets: 0,
      rir: null,
      loadPct: null,
      skipJumps: false,
      rest: false,
    });
  });

  it("trims the session after a short night and high soreness", () => {
    const g = computeGuidance(
      input({ checkins: [ci({ sleep_hours: 6.5, soreness: 4, energy: 3 })] }),
    );
    expect(g.score).toBe(3); // sleep 2 + soreness 1
    expect(g.level).toBe("trim");
    expect(g.detail).toBe(
      "Keep the session but drop one set per exercise and stay at RIR 2–3.",
    );
    expect(g.adjustments.dropSets).toBe(1);
    expect(g.adjustments.rir).toBe("2–3");
    expect(g.reasons[0]).toBe("Slept 6.5 of 8 h");
    expect(g.extras).toContain("Aim for 8 h tonight.");
  });

  it("goes lighter at 4–5 points", () => {
    const g = computeGuidance(
      input({
        checkins: [
          ci({ sleep_hours: 6.5, soreness: 4, fatigue: 4, energy: 3 }),
        ],
      }),
    );
    expect(g.score).toBe(4);
    expect(g.level).toBe("ease");
    expect(g.adjustments.loadPct).toBe(-10);
  });

  it("suggests a recovery day when many markers are poor", () => {
    const g = computeGuidance(
      input({
        checkins: [
          ci({ sleep_hours: 5, energy: 1, soreness: 5, fatigue: 5, stress: 5 }),
        ],
      }),
    );
    expect(g.level).toBe("recover");
    expect(g.title).toBe("Take a recovery day");
    expect(g.detail).toContain("Walk, mobility, sleep");
    expect(g.adjustments.rest).toBe(true);
  });

  it("swaps jumps on a leg day after volleyball when legs are sore", () => {
    const g = computeGuidance(
      input({
        plan: legsA,
        checkins: [ci({ sleep_hours: 8, soreness: 3, energy: 4 })],
        volleyballDates: [addDays(D, -1)],
      }),
    );
    expect(g.level).toBe("legs");
    expect(g.detail).toBe(
      "Swap jumps for extra rest; legs are carrying volleyball fatigue.",
    );
    expect(g.adjustments.skipJumps).toBe(true);
  });

  it("keeps leg work easier without jumps when the leg day has none", () => {
    const g = computeGuidance(
      input({
        plan: legsNoJumps,
        checkins: [ci({ sleep_hours: 8, fatigue: 3, volleyball: true })],
      }),
    );
    expect(g.level).toBe("legs");
    expect(g.adjustments.skipJumps).toBe(false);
    expect(g.detail).toMatch(/RIR 2–3/);
  });

  it("does not touch an upper-body day for volleyball fatigue", () => {
    const g = computeGuidance(
      input({
        checkins: [ci({ sleep_hours: 8, soreness: 3 })],
        volleyballDates: [D],
      }),
    );
    expect(g.level).toBe("go");
  });

  it("adds a point for three or more volleyball days in a week", () => {
    const g = computeGuidance(
      input({
        checkins: [ci({ sleep_hours: 8, energy: 4 })],
        volleyballDates: [
          addDays(D, -1),
          addDays(D, -3),
          addDays(D, -5),
          addDays(D, -9),
        ],
      }),
    );
    const vb = g.factors.find((f) => f.key === "volleyball");
    expect(vb?.value).toBe("3 days");
    expect(vb?.points).toBe(1);
  });

  it("flags pain without diagnosing it", () => {
    const g = computeGuidance(
      input({
        checkins: [
          ci({ sleep_hours: 8, pain_notes: "Left knee on deep squats" }),
        ],
      }),
    );
    expect(g.pain).toBe("Left knee on deep squats");
    expect(g.extras.join(" ")).toMatch(/get it checked/);
    expect(g.factors.find((f) => f.key === "pain")?.points).toBe(1);
  });

  it("counts accumulated sleep debt over three nights", () => {
    const g = computeGuidance(
      input({
        checkins: [
          ci({ sleep_hours: 7.5 }),
          ci({ sleep_hours: 6.5 }, addDays(D, -1)),
          ci({ sleep_hours: 6.5 }, addDays(D, -2)),
        ],
      }),
    );
    const debt = g.factors.find((f) => f.key === "sleep_debt");
    expect(debt?.points).toBe(1);
    expect(debt?.value).toBe("6.75 h");
  });

  it("caps sleep at 3 points", () => {
    const g = computeGuidance(
      input({
        checkins: [
          ci({ sleep_hours: 4 }),
          ci({ sleep_hours: 4 }, addDays(D, -1)),
        ],
      }),
    );
    expect(g.score).toBe(3);
    expect(g.level).toBe("trim");
  });

  it("handles a rest day without prescribing training", () => {
    expect(computeGuidance(input({ plan: rest })).level).toBe("rest");
    const g = computeGuidance(
      input({
        plan: rest,
        checkins: [ci({ sleep_hours: 5, soreness: 5, fatigue: 5 })],
      }),
    );
    expect(g.level).toBe("rest");
    expect(g.title).toBe("Rest fully today");
  });

  it("reads numeric strings from Postgres numerics", () => {
    const g = computeGuidance(
      input({ checkins: [ci({ sleep_hours: "6.3" })] }),
    );
    expect(g.factors.find((f) => f.key === "sleep")?.points).toBe(2);
  });
});

describe("training context", () => {
  const s = (date: string, sets = 18): SessionLite => ({
    local_date: date,
    status: "done",
    sets_completed: sets,
  });

  it("counts consecutive finished sessions before the date", () => {
    const sessions = [1, 2, 3, 4, 5, 6].map((o) => s(addDays(D, -o)));
    expect(trainingStreak(sessions, D)).toBe(6);
    expect(trainingStreak([s(addDays(D, -2))], D)).toBe(0);
    expect(
      trainingStreak([{ ...s(addDays(D, -1)), status: "active" }], D),
    ).toBe(0);
  });

  it("compares recent sets with the 3-week average", () => {
    const prior = [8, 10, 12, 15, 17, 19, 22, 24, 26].map((o) =>
      s(addDays(D, -o), 12),
    ); // 9 sessions × 12 = 108 → 36/wk
    const recent = [0, 1, 2, 3].map((o) => s(addDays(D, -o), 14)); // 56
    const v = volumeChange([...prior, ...recent], D);
    expect(v?.priorWeekly).toBe(36);
    expect(v?.recent).toBe(56);
    expect(volumeChange(recent, D)).toBeNull();
    const g = computeGuidance(
      input({
        sessions: [...prior, ...recent],
        checkins: [ci({ sleep_hours: 8 })],
      }),
    );
    expect(g.factors.find((f) => f.key === "volume")).toMatchObject({
      value: "+56%",
      points: 1,
    });
  });

  it("adds a point after six straight training days", () => {
    const sessions = [1, 2, 3, 4, 5, 6].map((o) => s(addDays(D, -o)));
    const g = computeGuidance(
      input({ sessions, checkins: [ci({ sleep_hours: 8 })] }),
    );
    expect(g.factors.find((f) => f.key === "streak")?.points).toBe(1);
  });
});
