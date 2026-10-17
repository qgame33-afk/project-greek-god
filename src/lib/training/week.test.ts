import { describe, expect, it } from "vitest";
import { sessionsSealed } from "@/lib/adherence";
import { weekDates } from "@/lib/dates";
import { sealedDays, splitLabel, weekRangeLabel } from "./week";

const SCHEDULE = { "0": "rest", "1": "push_a", "2": "pull_a", "3": "legs_a", "4": "push_b", "5": "pull_b", "6": "legs_b" };
const TODAY = "2026-10-17";
const dates = weekDates(TODAY);

describe("sealedDays", () => {
  it("counts the demo week as 4 of 6", () => {
    const sessions = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"].map((d) => ({ local_date: d, status: "done" }));
    const days = sealedDays({ dates, planKey: (d) => SCHEDULE[String(new Date(`${d}T12:00:00Z`).getUTCDay()) as keyof typeof SCHEDULE], schedule: SCHEDULE, sessions, volleyballDates: [], programStart: "2026-09-11" });
    expect(sessionsSealed(days, TODAY)).toEqual({ done: 4, planned: 6 });
  });

  it("turns a training day set to rest with volleyball played into one counted swap", () => {
    const plan: Record<string, string> = { "2026-10-15": "rest" };
    const days = sealedDays({
      dates,
      planKey: (d) => plan[d] ?? SCHEDULE[String(new Date(`${d}T12:00:00Z`).getUTCDay()) as keyof typeof SCHEDULE],
      schedule: SCHEDULE,
      sessions: [{ local_date: "2026-10-12", status: "done" }],
      volleyballDates: ["2026-10-15"],
    });
    expect(days.find((d) => d.date === "2026-10-15")).toEqual({ date: "2026-10-15", kind: "volleyball", done: true });
    expect(sessionsSealed(days, TODAY)).toEqual({ done: 2, planned: 6 });
  });

  it("never plans days before the programme started", () => {
    const days = sealedDays({ dates, planKey: () => "push_a", schedule: SCHEDULE, sessions: [], volleyballDates: [], programStart: "2026-10-16" });
    expect(days.filter((d) => d.kind === "train").map((d) => d.date)).toEqual(["2026-10-16", "2026-10-17", "2026-10-18"]);
  });
});

describe("labels", () => {
  it("names the split from the week's templates", () => {
    expect(splitLabel(["legs_a", "push_a", "rest", "pull_b"])).toBe("push, pull, legs");
    expect(splitLabel(["push_a", "push_b"])).toBe("push");
    expect(splitLabel(["rest"])).toBeNull();
  });

  it("formats the week's dates", () => {
    expect(weekRangeLabel(dates)).toBe("12–18 Oct");
    expect(weekRangeLabel(weekDates("2026-10-01"))).toBe("28 Sep – 4 Oct");
  });
});
