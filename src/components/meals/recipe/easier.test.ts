import { describe, expect, it } from "vitest";
import { HISTORY_CAP } from "@/lib/data/meals-model";
import { simplifyRecipe } from "@/lib/meals/engine";
import { LIBRARY, getLibraryRecipe } from "@/lib/meals/library";
import { ingredientCount } from "@/lib/meals/recipe";
import type { WhyReason } from "@/lib/meals/types";
import { compareRecipes, easierSwapPatch, storedSimplified } from "./easier";

const homemade = getLibraryRecipe("lib:homemade-bolognese")!;
const jarred = getLibraryRecipe("lib:spaghetti-bolognese")!;

const REASONS: WhyReason[] = [
  { kind: "liked_similar", text: "You liked Beef Tacos (beef)", weight: 1.4 },
  { kind: "macro_fit", text: "Fits dinner: 920 kcal, 58 g protein", weight: 0.9 },
  { kind: "liked_cuisine", text: "You like Italian food", weight: 0.6 },
];

describe("make this easier: swap into the planned meal", () => {
  it("puts the easier recipe in, the old pick on the undo stack, and keeps only reasons that still hold", () => {
    const meal = { recipe_key: homemade.key, servings: 1.25, reason: REASONS, history: [] };
    const p = easierSwapPatch(meal, jarred, homemade);
    expect(p.recipe_key).toBe(jarred.key);
    expect(p.history).toEqual([{ recipe_key: homemade.key, servings: 1.25, reason: REASONS }]);
    // the macro reason quoted the old recipe's numbers: gone. Taste reasons survive (same dish).
    expect(p.reason!.map((r) => r.kind)).toEqual(["difficulty_fit", "liked_similar", "liked_cuisine"]);
    expect(p.reason![0].text).toBe(`Made easier: ${jarred.minutes} min, ${ingredientCount(jarred)} ingredients, ${jarred.steps.length} steps`);
  });

  it("drops taste reasons that no longer hold when the easier version is another kind of dish", () => {
    const pasta = getLibraryRecipe("lib:garlic-shrimp-pasta")!;
    const rice = getLibraryRecipe(pasta.easierKey!)!;
    const reasons: WhyReason[] = [
      { kind: "liked_similar", text: "You liked Easy Spaghetti Bolognese (pasta)", weight: 1 },
      { kind: "liked_cuisine", text: "You like Italian food", weight: 0.5 },
    ];
    const p = easierSwapPatch({ recipe_key: pasta.key, servings: 1, reason: reasons, history: [] }, rice, pasta);
    expect(p.reason!.map((r) => r.kind)).toEqual(["difficulty_fit"]);
    // without the original recipe to compare, nothing is assumed to still hold
    expect(easierSwapPatch({ recipe_key: homemade.key, servings: 1, reason: REASONS, history: [] }, jarred).reason).toHaveLength(1);
  });

  it("never carries a reason about the old recipe itself over to another recipe", () => {
    const own: WhyReason[] = [{ kind: "liked_similar", text: "You gave this a thumbs up", weight: 1 }, ...REASONS];
    const p = easierSwapPatch({ recipe_key: homemade.key, servings: 1, reason: own, history: [] }, jarred, homemade);
    expect(p.reason!.map((r) => r.text)).not.toContain("You gave this a thumbs up");
    // a version made from this recipe keeps it (it's the same dish, simplified)
    const derived = { ...jarred, key: "usr:x", baseKey: homemade.key };
    expect(easierSwapPatch({ recipe_key: homemade.key, servings: 1, reason: own, history: [] }, derived).reason!.map((r) => r.text)).toContain("You gave this a thumbs up");
  });

  it("caps the undo stack like every other planned-meal change", () => {
    const history = Array.from({ length: HISTORY_CAP }, (_, i) => ({ recipe_key: `lib:old-${i}`, servings: 1, reason: null }));
    const p = easierSwapPatch({ recipe_key: homemade.key, servings: 1, reason: null, history }, jarred);
    expect(p.history).toHaveLength(HISTORY_CAP);
    expect(p.history![HISTORY_CAP - 1].recipe_key).toBe(homemade.key);
    expect(p.history![0].recipe_key).toBe("lib:old-1");
  });

  it("works on a meal with no stored reasons", () => {
    const p = easierSwapPatch({ recipe_key: homemade.key, servings: 1, reason: null, history: [] }, jarred);
    expect(p.reason).toHaveLength(1);
    expect(p.history[0].reason).toBeNull();
  });
});

describe("make this easier: before → after", () => {
  it("compares time, ingredients, steps and the per-serving estimate", () => {
    const rows = compareRecipes(homemade, jarred);
    expect(rows.map((r) => r.label)).toEqual(["Time", "Ingredients", "Steps", "Calories", "Protein"]);
    const time = rows[0];
    expect(time.before).toBe(`${homemade.minutes} min`);
    expect(time.after).toBe(`${jarred.minutes} min`);
    expect(time.better).toBe(jarred.minutes < homemade.minutes);
    // nutrition is never "better" or "worse": it's information
    expect(rows[3].better).toBe(false);
    expect(rows[4].better).toBe(false);
    expect(rows[4].after).toMatch(/^\d+ g$/);
  });

  it("matches what the engine offers for a recipe with a hand-written easier version", () => {
    const res = simplifyRecipe(homemade);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.kind).toBe("easier_version");
      expect(res.recipe.key).toBe(jarred.key);
      const better = compareRecipes(homemade, res.recipe).filter((r) => r.better);
      expect(better.length).toBeGreaterThan(0);
    }
  });

  it("is honest when a Super Easy recipe can't get simpler", () => {
    const shake = getLibraryRecipe("lib:protein-shake")!;
    const res = simplifyRecipe(shake);
    expect(res.ok).toBe(false);
  });
});

describe("make this easier: the same shortcut version twice", () => {
  it("reuses the stored copy instead of storing a duplicate", () => {
    const alfredo = getLibraryRecipe("lib:chicken-alfredo")!;
    const res = simplifyRecipe(alfredo);
    if (!res.ok || res.kind !== "simplified") throw new Error("expected a shortcut version");
    const stored = { ...res.recipe, key: "usr:5d1f0c55-0000-4000-8000-000000000001" };
    expect(storedSimplified([...LIBRARY, stored], res.recipe)?.key).toBe(stored.key);
    // a different version of the same base (other swaps) is not the same recipe
    const other = { ...stored, minutes: stored.minutes + 5 };
    expect(storedSimplified([...LIBRARY, other], res.recipe)).toBeUndefined();
    expect(storedSimplified(LIBRARY, res.recipe)).toBeUndefined();
  });
});
