import { describe, expect, it } from "vitest";
import {
  cellKind,
  cellLabel,
  monthGrid,
  monthSummary,
  type DayLite,
} from "./heatmap";

const T = "2026-10-16";

describe("cellKind", () => {
  it("maps completion to the DESIGN §5.11 steps", () => {
    expect(cellKind(0, "2026-10-10", T)).toBe("empty");
    expect(cellKind(0.2, "2026-10-10", T)).toBe("low");
    expect(cellKind(1 / 3, "2026-10-10", T)).toBe("low");
    expect(cellKind(0.5, "2026-10-10", T)).toBe("mid");
    expect(cellKind(2 / 3, "2026-10-10", T)).toBe("mid");
    expect(cellKind(0.8, "2026-10-10", T)).toBe("high");
    expect(cellKind(1, "2026-10-10", T)).toBe("full");
  });
  it("never colours future or pre-start days", () => {
    expect(cellKind(1, "2026-10-17", T)).toBe("future");
    expect(cellKind(1, "2026-09-01", T, "2026-09-10")).toBe("pre");
    expect(cellKind(Number.NaN, "2026-10-10", T)).toBe("empty");
  });
});

describe("monthGrid", () => {
  it("starts on Monday and pads to whole weeks", () => {
    const g = monthGrid("2026-10-16"); // Oct 1 2026 is a Thursday
    expect(g.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(g.length % 7).toBe(0);
    expect(g.filter(Boolean)).toHaveLength(31);
    expect(g.at(-1)).toBeNull(); // Oct 31 is a Saturday → one pad
  });
  it("handles a month that starts on Monday", () => {
    const g = monthGrid("2027-02-01");
    expect(g[0]).toBe("2027-02-01");
    expect(g).toHaveLength(28);
  });
});

describe("monthSummary", () => {
  const d = (
    date: string,
    ratio: number,
    workoutDone = false,
    isTrainingDay = true,
  ): DayLite => ({ date, ratio, workoutDone, isTrainingDay });
  it("averages finished days and skips an unfinished today", () => {
    const s = monthSummary(
      [
        d("2026-10-14", 1, true),
        d("2026-10-15", 0.5),
        d("2026-10-16", 0.2),
        d("2026-10-17", 0),
      ],
      T,
    );
    expect(s.counted).toBe(2);
    expect(s.adherence).toBe(0.75);
    expect(s.qualifying).toBe(1);
    expect(s.workoutsDone).toBe(1);
    expect(s.workoutsPlanned).toBe(2);
  });
  it("counts today once it qualifies", () => {
    const s = monthSummary(
      [d("2026-10-15", 0.5), d("2026-10-16", 0.8, true)],
      T,
    );
    expect(s.counted).toBe(2);
    expect(s.workoutsPlanned).toBe(2);
  });
  it("returns null adherence before any finished day and respects the start date", () => {
    expect(monthSummary([d("2026-10-16", 0.1)], T).adherence).toBeNull();
    expect(
      monthSummary([d("2026-10-01", 0), d("2026-10-15", 1)], T, "2026-10-10")
        .adherence,
    ).toBe(1);
  });
});

describe("cellLabel", () => {
  it("reads naturally", () => {
    expect(cellLabel("2026-10-14", "high", 5, 8, true)).toBe(
      "Wednesday, October 14: 5 of 8 habits done, workout done",
    );
    expect(cellLabel("2026-10-20", "future", 0, 0, false)).toBe(
      "Tuesday, October 20: upcoming",
    );
  });
});
