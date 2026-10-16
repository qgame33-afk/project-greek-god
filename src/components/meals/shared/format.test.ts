import { describe, expect, it } from "vitest";
import { LIBRARY, getLibraryRecipe } from "@/lib/meals/library";
import { glyphFor, GLYPH_TONE, kcalText, macroSummary, originLabel, servingsLabel, servingsMultiplier, slotTitle } from "./format";

describe("meal display helpers", () => {
  it("names slots, numbering snacks only when a day has several", () => {
    expect(slotTitle("breakfast")).toBe("Breakfast");
    expect(slotTitle("snack", 0, 1)).toBe("Snack");
    expect(slotTitle("snack", 1, 2)).toBe("Snack 2");
    expect(slotTitle("dinner", 0, 3)).toBe("Dinner");
  });

  it("writes servings as kitchen fractions", () => {
    expect(servingsLabel(1)).toBe("1 serving");
    expect(servingsLabel(1.5)).toBe("1½ servings");
    expect(servingsLabel(0.75)).toBe("¾ servings");
    expect(servingsLabel(2)).toBe("2 servings");
    expect(servingsLabel(NaN)).toBe("1 serving");
    expect(servingsMultiplier(1)).toBe("");
    expect(servingsMultiplier(1.25)).toBe("×1¼");
  });

  it("formats kcal and the card summary as integers", () => {
    expect(kcalText(3300.4)).toBe("3,300");
    expect(macroSummary({ kcal: 919.6, protein: 57.6 })).toBe("920 kcal · 58 g protein");
  });

  it("labels user recipes by origin and leaves library recipes plain", () => {
    expect(originLabel("library")).toBeNull();
    expect(originLabel("ai")).toBe("AI recipe");
    expect(originLabel("simplified")).toBe("Made easier");
  });

  it("picks a glyph from the dish style first, then the protein", () => {
    expect(glyphFor({ tags: ["protein:beef", "style:burger"] })).toBe("burger");
    expect(glyphFor({ tags: ["protein:chicken", "style:plate"] })).toBe("poultry");
    expect(glyphFor({ tags: ["protein:whey"] })).toBe("shake");
    expect(glyphFor({ tags: [] })).toBe("bowl");
    expect(glyphFor(getLibraryRecipe("lib:spaghetti-bolognese")!)).toBe("beef");
  });

  it("gives every library recipe a glyph with a tone", () => {
    for (const r of LIBRARY) expect(GLYPH_TONE[glyphFor(r)]).toBeTruthy();
  });
});
