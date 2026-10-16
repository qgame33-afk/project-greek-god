import { describe, expect, it } from "vitest";
import { habitsOn } from "./habit-history";

const at = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d, 9, 30).toISOString();

describe("habitsOn", () => {
  const defs = [
    { key: "protein", created_at: at(2026, 10, 16) }, // built-in, seeded late
    { key: "mobility", created_at: at(2026, 10, 16) },
    { key: "c-creatine-5-g", created_at: at(2026, 10, 16) },
    { key: "c-walk", created_at: null },
  ];
  it("keeps built-ins on every day, even before their row existed", () => {
    expect(habitsOn(defs, "2026-09-11").map((d) => d.key)).toEqual([
      "protein",
      "mobility",
      "c-walk",
    ]);
  });
  it("counts a custom habit from the local day it was created", () => {
    expect(habitsOn(defs, "2026-10-15").map((d) => d.key)).not.toContain(
      "c-creatine-5-g",
    );
    expect(habitsOn(defs, "2026-10-16").map((d) => d.key)).toContain(
      "c-creatine-5-g",
    );
  });
});
