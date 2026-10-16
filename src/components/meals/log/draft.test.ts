import { describe, expect, it } from "vitest";
import { draftMacros, editField, estimateFor, macroMismatch, newDraft, parseNumber, resetDraft, withServings } from "./draft";

const PER = { kcal: 924, protein: 51.6, carbs: 98.3, fat: 33.1 };

describe("food-log draft", () => {
  it("starts at the recipe's estimate for the servings", () => {
    const d = newDraft(PER, 1.25);
    expect(d.edited).toBe(false);
    expect(d.fields).toEqual({ kcal: "1155", protein: "64.5", carbs: "122.9", fat: "41.4" });
    expect(estimateFor(PER, 2)).toEqual({ kcal: 1848, protein: 103.2, carbs: 196.6, fat: 66.2 });
  });

  it("follows the servings stepper until the user types", () => {
    const d = withServings(newDraft(PER, 1), 2, PER);
    expect(d.fields.kcal).toBe("1848");
    expect(d.edited).toBe(false);
  });

  it("scales the user's own numbers by the same ratio once edited", () => {
    let d = newDraft(PER, 1);
    d = editField(d, "kcal", "800");
    d = editField(d, "protein", "50");
    expect(d.edited).toBe(true);
    d = withServings(d, 2, PER);
    expect(d.fields.kcal).toBe("1600");
    expect(d.fields.protein).toBe("100");
    // untouched fields scale too (they're part of what the user confirmed)
    expect(d.fields.carbs).toBe("196.6");
    // and a half-typed field is left alone
    d = editField(d, "fat", "");
    d = withServings(d, 1, PER);
    expect(d.fields.fat).toBe("");
    expect(d.fields.kcal).toBe("800");
  });

  it("puts the estimate back on reset", () => {
    const d = resetDraft(editField(newDraft(PER, 1.5), "kcal", "10"), PER);
    expect(d).toEqual(newDraft(PER, 1.5));
  });

  it("strips anything but digits and a separator while typing", () => {
    expect(editField(newDraft(PER, 1), "kcal", "9a2-4 kcal").fields.kcal).toBe("924");
  });

  it("parses typed numbers, including decimal commas and thousands", () => {
    expect(parseNumber("42")).toBe(42);
    expect(parseNumber("42.5")).toBe(42.5);
    expect(parseNumber("42,5")).toBe(42.5);
    expect(parseNumber("1,200")).toBe(1200);
    expect(parseNumber(" 7 ")).toBe(7);
    expect(parseNumber(".5")).toBe(0.5);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("1.2.3")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });

  it("validates before logging", () => {
    expect(draftMacros(newDraft(PER, 1))).toEqual({ ok: true, macros: { kcal: 924, protein: 51.6, carbs: 98.3, fat: 33.1 } });
    const bad = draftMacros(editField(editField(newDraft(PER, 1), "kcal", ""), "fat", "99999"));
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.kcal).toBe("Enter a number");
      expect(bad.errors.fat).toBe("0–2,000");
      expect(bad.errors.protein).toBeUndefined();
    }
  });

  it("flags typed macros that don't add up, softly", () => {
    expect(macroMismatch({ kcal: 924, protein: 51.6, carbs: 98.3, fat: 33.1 })).toBeNull();
    expect(macroMismatch({ kcal: 400, protein: 51.6, carbs: 98.3, fat: 33.1 })).toBe("Protein, carbs and fat add up to 898 kcal; you entered 400.");
    expect(macroMismatch({ kcal: 0, protein: 0, carbs: 0, fat: 0 })).toBeNull();
    // small differences never nag
    expect(macroMismatch({ kcal: 150, protein: 10, carbs: 10, fat: 10 })).toBeNull();
  });
});
