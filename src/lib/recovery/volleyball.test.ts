import { describe, expect, it } from "vitest";
import { volleyballFrequency } from "@/lib/progress/athletic";
import { volleyballEntries } from "./volleyball";

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
});
