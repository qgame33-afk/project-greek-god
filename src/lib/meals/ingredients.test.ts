import { describe, expect, it } from "vitest";
import {
  INGREDIENTS,
  dislikeCovers,
  getIngredient,
  gramsFor,
  gramsToPackUnits,
  ingredientCostCad,
  ingredientInline,
  SHOP_SWAPS,
  shopKey,
  shortcutFor,
} from "./ingredients";
import { GROCERY_CATEGORY_LABEL } from "./types";

// Dried spices and herbs: USDA counts their (very high) fibre inside carbs, so 4/4/9 Atwater
// overshoots their listed energy by 20–40 %. They are used a gram or two at a time.
const SPICES = new Set(["black-pepper", "paprika", "chili-powder", "cumin", "italian-seasoning", "cinnamon", "red-pepper-flakes"]);

describe("ingredient database", () => {
  it("has about 150 entries with unique kebab-case keys and unique names", () => {
    expect(INGREDIENTS.length).toBeGreaterThanOrEqual(145);
    const keys = INGREDIENTS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const names = INGREDIENTS.map((i) => i.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("macros are plausible per 100 g and agree with 4/4/9 within ~15 %", () => {
    for (const e of INGREDIENTS) {
      const { kcal, protein, carbs, fat } = e.per100;
      for (const v of [kcal, protein, carbs, fat]) expect(v, e.key).toBeGreaterThanOrEqual(0);
      expect(protein + carbs + fat, e.key).toBeLessThanOrEqual(100.5);
      expect(kcal, e.key).toBeLessThanOrEqual(900);
      if (SPICES.has(e.key)) continue;
      const derived = protein * 4 + carbs * 4 + fat * 9;
      // Relative for real foods; a small absolute allowance for watery vegetables (fibre).
      expect(Math.abs(derived - kcal), `${e.key}: ${kcal} kcal vs ${derived.toFixed(0)} from macros`).toBeLessThanOrEqual(
        Math.max(0.16 * kcal, 15),
      );
    }
  });

  it("matches USDA FoodData Central for the forms recipes measure", () => {
    expect(getIngredient("chicken-breast-raw")!.per100).toEqual({ kcal: 120, protein: 22.5, carbs: 0, fat: 2.6 });
    expect(getIngredient("ground-beef-lean")!.per100).toEqual({ kcal: 176, protein: 20, carbs: 0, fat: 10 }); // 90/10 raw
    expect(getIngredient("pasta-dry")!.per100.kcal).toBe(371);
    expect(getIngredient("rice-dry")!.per100.kcal).toBe(365);
    expect(getIngredient("eggs")!.per100).toEqual({ kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 });
    expect(getIngredient("milk-2")!.per100.kcal).toBe(50);
    expect(getIngredient("greek-yogurt-0")!.per100.protein).toBeCloseTo(10.2);
    expect(getIngredient("oats")!.per100.kcal).toBe(379);
    expect(getIngredient("banana")!.per100.kcal).toBe(89);
    // Cooked forms are denser than raw ones.
    expect(getIngredient("chicken-breast-cooked")!.per100.protein).toBeGreaterThan(getIngredient("chicken-breast-raw")!.per100.protein);
  });

  it("every entry has a grocery category, kinds and consistent allergens", () => {
    for (const e of INGREDIENTS) {
      expect(GROCERY_CATEGORY_LABEL[e.category], e.key).toBeTruthy();
      expect(e.kinds.length, e.key).toBeGreaterThan(0);
      if (e.kinds.includes("dairy")) expect(e.allergens, e.key).toContain("dairy");
      if (e.kinds.includes("egg")) expect(e.allergens, e.key).toContain("egg");
      if (e.kinds.includes("fish")) expect(e.allergens, e.key).toContain("fish");
      if (e.kinds.includes("shellfish")) expect(e.allergens, e.key).toContain("shellfish");
      if (e.kinds.some((k) => k === "beef" || k === "pork" || k === "poultry")) expect(e.kinds, e.key).toContain("meat");
    }
    expect(getIngredient("peanut-butter")!.allergens).toEqual(["peanut"]);
    expect(getIngredient("hummus")!.allergens).toContain("sesame");
    expect(getIngredient("caesar-dressing")!.kinds).toContain("fish"); // anchovy: not vegetarian
    expect(getIngredient("chicken-broth")!.kinds).toContain("meat");
    expect(getIngredient("ham-deli")!.kinds).toContain("pork");
  });

  it("everything you buy has a Canadian pack with a price; staples are flagged", () => {
    for (const e of INGREDIENTS) {
      if (e.key === "water") continue;
      expect(e.pack, e.key).toBeTruthy();
      expect(e.pack!.size, e.key).toBeGreaterThan(0);
      expect(e.pack!.priceCad, e.key).toBeGreaterThan(0);
      expect(e.pack!.priceCad, e.key).toBeLessThan(100);
      if (e.pack!.unit === "piece") expect(e.unitGrams?.piece, `${e.key} sold by the piece needs a piece weight`).toBeGreaterThan(0);
      if (e.pack!.unit === "ml") expect(e.density, `${e.key} sold by volume needs a density`).toBeGreaterThan(0);
    }
    for (const k of ["salt", "black-pepper", "olive-oil", "canola-oil", "garlic-powder", "water"]) expect(getIngredient(k)!.staple, k).toBe(true);
    for (const k of ["chicken-breast-raw", "pasta-dry", "eggs", "whey-protein"]) expect(getIngredient(k)!.staple, k).toBeFalsy();
  });

  it("unit weights and densities are sane, and count units have nouns", () => {
    for (const e of INGREDIENTS) {
      for (const [u, g] of Object.entries(e.unitGrams ?? {})) {
        expect(g, `${e.key} ${u}`).toBeGreaterThan(0);
        expect(g, `${e.key} ${u}`).toBeLessThan(1000);
      }
      if (e.density != null) {
        expect(e.density, e.key).toBeGreaterThan(0.5);
        expect(e.density, e.key).toBeLessThan(1.5);
      }
      if (e.unitGrams?.piece) expect(e.nouns?.piece ?? e.pack?.unit, `${e.key} piece noun`).toBeTruthy();
    }
    // The spec's natural units.
    expect(gramsFor("eggs", 1, "piece")).toBe(50);
    expect(gramsFor("bread-white", 1, "slice")).toBe(32);
    expect(gramsFor("bagel", 1, "piece")).toBe(95);
    expect(gramsFor("tortilla-flour", 1, "piece")).toBe(45);
    expect(gramsFor("whey-protein", 1, "scoop")).toBe(31);
  });

  it("shortcuts point at real, different ingredients with a positive factor", () => {
    let n = 0;
    for (const e of INGREDIENTS) {
      if (!e.shortcut) continue;
      n++;
      expect(getIngredient(e.shortcut), e.key).toBeTruthy();
      expect(e.shortcut).not.toBe(e.key);
      expect(e.shortcutFactor ?? 1).toBeGreaterThan(0);
    }
    expect(n).toBeGreaterThanOrEqual(8);
    expect(shortcutFor("chicken-breast-raw")).toEqual({ key: "chicken-breast-cooked", factor: 0.75 });
    expect(shortcutFor("rice-dry")?.key).toBe("rice-cooked-microwave");
    expect(shortcutFor("potatoes")?.key).toBe("fries-frozen");
    expect(shortcutFor("cream")?.key).toBe("alfredo-sauce-jarred");
    expect(shortcutFor("broccoli")?.key).toBe("frozen-broccoli");
    expect(shortcutFor("eggs")).toBeNull();
  });
});

describe("conversions", () => {
  it("converts kitchen units with Canadian metric volumes", () => {
    expect(gramsFor("milk-2", 1, "cup")).toBeCloseTo(257.5); // 250 mL × 1.03
    expect(gramsFor("milk-2", 100, "ml")).toBeCloseTo(103);
    expect(gramsFor("oats", 1, "cup")).toBe(81);
    expect(gramsFor("olive-oil", 1, "tbsp")).toBe(13.5);
    expect(gramsFor("pasta-sauce-jarred", 0.5, "cup")).toBeCloseTo(130);
    expect(gramsFor("tuna-canned", 1, "can")).toBe(120);
    expect(gramsFor("pasta-dry", 125, "g")).toBe(125);
  });

  it("refuses conversions that make no sense", () => {
    expect(gramsFor("chicken-breast-raw", 1, "cup")).toBeNull();
    expect(gramsFor("eggs", 1, "tbsp")).toBeNull();
    expect(gramsFor("not-a-food", 1, "g")).toBeNull();
    expect(gramsFor("eggs", -1, "piece")).toBeNull();
    expect(gramsFor("eggs", Number.NaN, "piece")).toBeNull();
  });

  it("converts grams to pack units and prorates the price", () => {
    expect(gramsToPackUnits("eggs", 600)).toEqual({ qty: 12, unit: "piece" });
    expect(gramsToPackUnits("milk-2", 1030)!.qty).toBeCloseTo(1000);
    expect(gramsToPackUnits("pasta-dry", 450)).toEqual({ qty: 450, unit: "g" });
    expect(ingredientCostCad("eggs", 600)).toBeCloseTo(4.79);
    expect(ingredientCostCad("pasta-dry", 450)).toBeCloseTo(1.245);
    expect(ingredientCostCad("salt", 10)).toBe(0); // staples are "check you have", not a buy
  });

  it("uses natural names inside sentences", () => {
    expect(ingredientInline("ground-beef-lean")).toBe("extra-lean ground beef");
    expect(ingredientInline("greek-yogurt-0")).toBe("plain Greek yogurt (0%)");
    expect(ingredientInline("bread-whole-wheat")).toBe("whole-wheat bread");
  });

  it("a dislike covers other forms of the food and mixes that contain it", () => {
    expect([...dislikeCovers("broccoli")].sort()).toEqual(["broccoli", "frozen-broccoli", "frozen-stirfry-veg"]);
    expect(dislikeCovers("onion").has("frozen-peppers-onions")).toBe(true);
    expect(dislikeCovers("eggs").has("egg-whites")).toBe(true);
    expect([...dislikeCovers("mushrooms")]).toEqual(["mushrooms"]);
  });

  it("interchangeable shopping variants never differ in allergens or diet kinds", () => {
    for (const g of SHOP_SWAPS) {
      const [first, ...rest] = g.keys.map((k) => getIngredient(k)!);
      for (const e of rest) {
        expect([...e.allergens].sort(), `${first.key} vs ${e.key}`).toEqual([...first.allergens].sort());
        expect([...e.kinds].sort(), `${first.key} vs ${e.key}`).toEqual([...first.kinds].sort());
        expect(e.category).toBe(first.category);
      }
      if (g.always) expect(g.keys).toContain(g.always);
      for (const k of g.keys) expect(shopKey(k)).toBe(g.keys[0]);
    }
    expect(shopKey("eggs")).toBe("eggs");
  });

  it("every shopper unit converts to grams", () => {
    for (const e of INGREDIENTS) if (e.shopUnit) expect(gramsFor(e.key, 1, e.shopUnit), e.key).toBeGreaterThan(0);
  });
});
