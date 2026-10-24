import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, isNightMinute, nightOn, parseAppearance } from "./appearance";

describe("appearance", () => {
  it("parses stored settings tolerantly, defaulting anything unknown", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ motion: "reduce", transparency: "reduce", night: "always" })).toEqual({ motion: "reduce", transparency: "reduce", night: "always" });
    expect(parseAppearance({ motion: "fast", night: 1 })).toEqual(DEFAULT_APPEARANCE);
  });

  it("keeps night dimming's three settings: Off, 9 PM–5 AM (auto, the default) and Always", () => {
    expect(parseAppearance({ night: "off" }).night).toBe("off");
    expect(parseAppearance({ night: "auto" }).night).toBe("auto");
    expect(parseAppearance({ night: "always" }).night).toBe("always");
    expect(DEFAULT_APPEARANCE.night).toBe("auto");
  });

  it("dims from 21:00 to 05:00 on auto, always on Always, never on Off", () => {
    expect(isNightMinute(21 * 60)).toBe(true);
    expect(isNightMinute(23 * 60 + 59)).toBe(true);
    expect(isNightMinute(0)).toBe(true);
    expect(isNightMinute(4 * 60 + 59)).toBe(true);
    expect(isNightMinute(5 * 60)).toBe(false);
    expect(isNightMinute(20 * 60 + 59)).toBe(false);
    const noon = new Date(2026, 9, 22, 12, 0);
    const late = new Date(2026, 9, 22, 22, 30);
    expect(nightOn("auto", noon)).toBe(false);
    expect(nightOn("auto", late)).toBe(true);
    expect(nightOn("always", noon)).toBe(true);
    expect(nightOn("off", late)).toBe(false);
  });
});
