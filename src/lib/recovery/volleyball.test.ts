import { describe, expect, it } from "vitest";
import { volleyballFrequency } from "@/lib/progress/athletic";
import { volleyballEntries } from "./volleyball";
import { weeklyReview } from "./weekly";

describe("volleyballEntries", () => {
  it("counts a check-in switch day with no session as one session", () => {
    const e = volleyballEntries([], [{ local_date: "2026-10-15", volleyball: true }]);
    expect(e).toEqual([{ local_date: "2026-10-15", logged: false }]);
    expect(volleyballFrequency(e, "2026-10-16").total).toBe(1);
  });

  it("never counts a day twice when the switch and a session agree", () => {
    const e = volleyballEntries(
      [{ local_date: "2026-10-15" }, { local_date: "2026-10-15" }],
      [
        { local_date: "2026-10-15", volleyball: true },
        { local_date: "2026-10-14", volleyball: false },
        { local_date: "2026-10-13", volleyball: null },
      ],
    );
    expect(e.map((x) => x.local_date)).toEqual(["2026-10-15", "2026-10-15"]);
  });

  it("gives the weekly review the same count as Training and Progress", () => {
    const sessions = [{ local_date: "2026-10-13", duration_min: 90 }];
    const checkins = [
      { local_date: "2026-10-15", sleep_hours: 8, sleep_quality: null, energy: null, soreness: null, fatigue: null, stress: null, pain_notes: null, volleyball: true },
    ];
    const review = weeklyReview({ weekStart: "2026-10-12", today: "2026-10-16", sleepGoalH: 8, checkins, sessions: [], volleyball: sessions, plannedDates: [] });
    const days = volleyballEntries(sessions, checkins);
    expect(review.volleyball.sessions).toBe(2);
    expect(days).toHaveLength(2);
  });
});
