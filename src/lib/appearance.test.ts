import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, isNightMinute, parseAppearance } from "./appearance";

describe("appearance", () => {
  it("parses stored settings tolerantly, defaulting anything unknown", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ motion: "reduce", transparency: "reduce", night: "always" })).toEqual({ motion: "reduce", transparency: "reduce", night: "always" });
    expect(parseAppearance({ motion: "fast", night: 1 })).toEqual(DEFAULT_APPEARANCE);
  });

  it("runs the night (Seal) variant from 21:00 to 05:00", () => {
    expect(isNightMinute(21 * 60)).toBe(true);
    expect(isNightMinute(23 * 60 + 59)).toBe(true);
    expect(isNightMinute(0)).toBe(true);
    expect(isNightMinute(4 * 60 + 59)).toBe(true);
    expect(isNightMinute(5 * 60)).toBe(false);
    expect(isNightMinute(20 * 60 + 59)).toBe(false);
  });
});
