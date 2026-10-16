import { describe, expect, it } from "vitest";
import { isStaple } from "@/lib/meals/ingredients";
import { DEFAULT_PREFS } from "@/lib/meals/types";
import { CUISINES, cuisineMood, evidenceText, groupByAisle, groupByEvidence, INGREDIENT_CHOICES, namesOf, searchIngredients, setCuisineMood, strengthPips, toggled } from "./model";

describe("cuisines", () => {
  it("lists the library's cuisines, most recipes first, with readable names", () => {
    expect(CUISINES.length).toBeGreaterThanOrEqual(5);
    expect(CUISINES[0].recipes).toBeGreaterThanOrEqual(CUISINES[1].recipes);
    const keys = CUISINES.map((c) => c.key);
    expect(keys).toContain("italian");
    expect(CUISINES.find((c) => c.key === "breakfast")?.label).toBe("Breakfast classics");
    expect(CUISINES.find((c) => c.key === "mexican")?.label).toBe("Mexican");
  });

  it("keeps a cuisine in one list at a time", () => {
    let p = { ...DEFAULT_PREFS };
    p = { ...p, ...setCuisineMood(p, "italian", "more") };
    expect(cuisineMood(p, "italian")).toBe("more");
    p = { ...p, ...setCuisineMood(p, "italian", "less") };
    expect(p.likedCuisines).not.toContain("italian");
    expect(p.dislikedCuisines).toEqual(["italian"]);
    p = { ...p, ...setCuisineMood(p, "italian", null) };
    expect(cuisineMood(p, "italian")).toBeNull();
    expect(p.dislikedCuisines).toEqual([]);
  });
});

describe("ingredients", () => {
  it("offers every non-staple ingredient and no staples", () => {
    expect(INGREDIENT_CHOICES.length).toBeGreaterThan(100);
    expect(INGREDIENT_CHOICES.some((c) => isStaple(c.key))).toBe(false);
  });

  it("finds by name, any word order, ignoring case and accents", () => {
    const egg = searchIngredients("EGG");
    expect(egg.length).toBeGreaterThan(0);
    expect(egg[0].name.toLowerCase()).toMatch(/egg/);
    expect(searchIngredients("beef ground").some((c) => c.key === "ground-beef-lean")).toBe(true);
    expect(searchIngredients("zzzz")).toEqual([]);
    expect(searchIngredients("  ")).toHaveLength(INGREDIENT_CHOICES.length);
  });

  it("puts names that start with the query first", () => {
    const res = searchIngredients("chicken");
    expect(res[0].name.toLowerCase().startsWith("chicken") || res[0].name.toLowerCase().split(" ").some((w) => w.startsWith("chicken"))).toBe(true);
  });

  it("groups by aisle in store order", () => {
    const groups = groupByAisle(INGREDIENT_CHOICES);
    expect(groups[0].category).toBe("meat");
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(INGREDIENT_CHOICES.length);
  });

  it("names stored keys, keeping unknown ones visible", () => {
    const out = namesOf(["ground-beef-lean", "made-up-thing"]);
    expect(out[0].name).toMatch(/beef/i);
    expect(out[1].name.length).toBeGreaterThan(0);
  });

  it("toggles values without mutating", () => {
    const a = ["x"];
    expect(toggled(a, "y")).toEqual(["x", "y"]);
    expect(toggled(a, "x")).toEqual([]);
    expect(toggled(a, "x", true)).toEqual(["x"]);
    expect(a).toEqual(["x"]);
  });
});

describe("learning wording", () => {
  it("says what was done with a recipe, counting repeats", () => {
    expect(evidenceText([{ event: "thumbs_up", reason: null }])).toBe("liked");
    expect(
      evidenceText([
        { event: "kept", reason: null },
        { event: "kept", reason: null },
        { event: "thumbs_up", reason: null },
      ]),
    ).toBe("kept twice, liked");
    expect(evidenceText([{ event: "regenerated", reason: "too_complicated" }])).toBe("swapped out: too complicated");
  });

  it("maps weights to 1–5 pips", () => {
    expect(strengthPips(0.1)).toBe(1);
    expect(strengthPips(-3)).toBe(5);
    expect(strengthPips(1.5)).toBe(3);
  });
});

describe("learned evidence groups", () => {
  it("merges features taught by the same meals, keeping the strongest weight", () => {
    const a = [{ recipe_key: "lib:a" }];
    const ab = [{ recipe_key: "lib:b" }, { recipe_key: "lib:a" }];
    const groups = groupByEvidence([
      { feature: "ing:bacon", label: "Bacon", weight: 0.4, recipes: a },
      { feature: "protein:beef", label: "Beef", weight: 1.2, recipes: ab },
      { feature: "ing:eggs", label: "Large eggs", weight: 0.6, recipes: [{ recipe_key: "lib:a" }] },
      { feature: "cuisine:mexican", label: "Mexican food", weight: 0.3, recipes: [{ recipe_key: "lib:a" }, { recipe_key: "lib:b" }] },
    ]);
    expect(groups.map((g) => g.labels)).toEqual([["Bacon", "Large eggs"], ["Beef", "Mexican food"]]);
    expect(groups[0].weight).toBe(0.6);
    expect(groups[1].weight).toBe(1.2);
  });
});
