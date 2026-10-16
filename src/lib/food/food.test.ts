import { describe, expect, it } from "vitest";
import usdaGeneric from "./__fixtures__/usda-generic-chicken.json";
import usdaBranded from "./__fixtures__/usda-branded-chicken.json";
import usda429 from "./__fixtures__/usda-429.json";
import offFairlife from "./__fixtures__/off-fairlife.json";
import offDominos from "./__fixtures__/off-dominos.json";
import offBagel from "./__fixtures__/off-bagel.json";
import { normalizeUSDAFood, searchUSDA, usdaEnergyKcal, type USDAFood } from "./usda";
import { normalizeOFFHit, searchOFF, type OFFHit } from "./off";
import { bestMatch, rankResults, tokens } from "./match";
import { cleanText, macrosForGrams, plausiblePer100g, stripUrls, sumMacroSets, tidyBrand, tidyName } from "./normalize";
import { overallStatus, searchFoods } from "./search";
import type { FetchLike, FoodSearchResult } from "./types";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const usdaFoods = (usdaGeneric.foods as USDAFood[]).map(normalizeUSDAFood).filter(Boolean) as FoodSearchResult[];
const brandedFoods = (usdaBranded.foods as USDAFood[]).map(normalizeUSDAFood).filter(Boolean) as FoodSearchResult[];
const fairlife = (offFairlife.hits as OFFHit[]).map(normalizeOFFHit).filter(Boolean) as FoodSearchResult[];
const dominos = (offDominos.hits as OFFHit[]).map(normalizeOFFHit).filter(Boolean) as FoodSearchResult[];
const bagels = (offBagel.hits as OFFHit[]).map(normalizeOFFHit).filter(Boolean) as FoodSearchResult[];

describe("USDA normalisation (recorded FoodData Central responses)", () => {
  it("maps a generic SR Legacy food to per-100 g macros with a real FDC link", () => {
    const r = usdaFoods.find((f) => f.id === "usda:171477")!;
    expect(r).toBeTruthy();
    expect(r.name).toBe("Chicken, broilers or fryers, breast, meat only, cooked, roasted");
    expect(r.brand).toBeNull();
    expect(r.source).toBe("usda");
    expect(r.sourceName).toBe("USDA FoodData Central");
    expect(r.sourceUrl).toBe("https://fdc.nal.usda.gov/food-details/171477/nutrients");
    expect(r.per100g).toEqual({ calories: 165, protein: 31, carbs: 0, fat: 3.6 });
    expect(r.servingAmount).toBe(100);
    expect(r.servingUnit).toBe("g");
    expect(r.servingGrams).toBe(100);
    expect(r.perServing).toEqual(r.per100g);
  });

  it("maps branded foods with the label serving and a tidy brand", () => {
    const r = brandedFoods.find((f) => f.id === "usda:2187885")!;
    expect(r.name).toBe("Chicken breast");
    expect(r.brand).toBe("Giant Eagle");
    expect(r.per100g).toEqual({ calories: 165, protein: 20.4, carbs: 1.1, fat: 8.1 });
    expect(r.servingAmount).toBe(284);
    expect(r.servingGrams).toBe(284);
    expect(r.perServing.calories).toBe(469); // 165 × 2.84
    expect(r.servingLabel).toBe("1 chicken breast (284 g)");
  });

  it("derives energy from Atwater (Foundation) or kJ when kcal is missing", () => {
    const foundation: USDAFood = {
      fdcId: 1,
      description: "Eggs, Grade A, Large, egg whole",
      dataType: "Foundation",
      foodNutrients: [
        { nutrientId: 1003, unitName: "G", value: 12.4 },
        { nutrientId: 1004, unitName: "G", value: 9.96 },
        { nutrientId: 1005, unitName: "G", value: 0.96 },
        { nutrientId: 2047, unitName: "KCAL", value: 148 },
        { nutrientId: 2048, unitName: "KCAL", value: 143 },
      ],
    };
    expect(usdaEnergyKcal(foundation, { protein: 12.4, carbs: 0.96, fat: 9.96 })).toBe(143);
    const kjOnly: USDAFood = { fdcId: 2, description: "X", foodNutrients: [{ nutrientId: 1062, unitName: "kJ", value: 418.4 }] };
    expect(usdaEnergyKcal(kjOnly, { protein: 0, carbs: 0, fat: 0 })).toBeCloseTo(100);
  });

  it("drops records without usable nutrients", () => {
    expect(normalizeUSDAFood({ fdcId: 3, description: "Mystery", foodNutrients: [] })).toBeNull();
  });
});

describe("Open Food Facts normalisation (recorded search-a-licious responses)", () => {
  it("maps a product with nutriments to per-100 g and its OFF page", () => {
    const r = fairlife.find((f) => f.id === "off:38986253")!;
    expect(r.name).toBe("Fairlife vanilla protein shake");
    expect(r.brand).toBe("Fairlife");
    expect(r.sourceName).toBe("Open Food Facts");
    expect(r.sourceUrl).toBe("https://world.openfoodfacts.org/product/38986253");
    expect(r.per100g).toEqual({ calories: 44, protein: 8.8, carbs: 0.9, fat: 0.7 });
  });

  it("skips products with no nutrition data", () => {
    expect(fairlife.some((f) => f.name === "Fairlife Chocolate Protein Shake")).toBe(false);
  });

  it("rejects implausible crowd-sourced records", () => {
    expect(
      normalizeOFFHit({ code: "1", product_name: "Bad", nutriments: { "energy-kcal_100g": 2000, proteins_100g: 10, carbohydrates_100g: 10, fat_100g: 10 } }),
    ).toBeNull();
    expect(plausiblePer100g({ calories: 0, protein: 0, carbs: 0, fat: 0 })).toBe(true); // water
    expect(plausiblePer100g({ calories: 300, protein: 40, carbs: 40, fat: 40 })).toBe(false); // > 100 g per 100 g
  });

  it("uses the label serving when the legacy API provides one", () => {
    const r = normalizeOFFHit({
      code: "3017620422003",
      product_name: "Nutella",
      brands: "Nutella, Ferrero",
      serving_quantity: 15,
      serving_size: "15 g",
      nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
    })!;
    expect(r.brand).toBe("Nutella");
    expect(r.servingAmount).toBe(15);
    expect(r.perServing).toEqual({ calories: 81, protein: 0.9, carbs: 8.6, fat: 4.6 });
  });
});

describe("matching", () => {
  it("tokenises names the same way on both sides", () => {
    expect(tokens("Domino's Pepperoni Pizzas, from raw")).toEqual(["domino", "pepperoni", "pizza"]);
    expect(tokens("dominos pizza")).toEqual(tokens("Domino's Pizza"));
    expect(tokens("Chicken breast, oven-roasted")).toEqual(["chicken", "breast", "oven", "roasted"]);
  });

  it("picks plain roasted breast over deli rolls and skin-on records", () => {
    const m = bestMatch("chicken breast roasted", usdaFoods, { kind: "generic" });
    expect(m?.result.id).toBe("usda:171477");
    const ranked = rankResults("chicken breast roasted", usdaFoods, { kind: "generic" }).map((x) => x.result.id);
    expect(ranked.indexOf("usda:174608")).toBeGreaterThan(ranked.indexOf("usda:171477"));
  });

  it("refuses raw records for cooked foods", () => {
    const raw: FoodSearchResult = {
      ...usdaFoods[0],
      id: "usda:raw",
      name: "Rice, white, long-grain, raw",
      per100g: { calories: 365, protein: 7.1, carbs: 80, fat: 0.7 },
    };
    expect(bestMatch("white rice cooked", [raw], { kind: "generic" })).toBeNull();
  });

  it("requires the named brand for packaged items", () => {
    expect(bestMatch("fairlife protein shake", fairlife, { kind: "packaged", brand: "Fairlife" })?.result.name).toMatch(/^Fairlife/);
    expect(bestMatch("Premier protein shake", fairlife, { kind: "packaged", brand: "Premier" })).toBeNull();
  });

  it("never matches a Domino's pizza to unrelated Domino's products", () => {
    expect(bestMatch("pepperoni pizza", dominos, { kind: "packaged", brand: "Domino's" })).toBeNull();
  });

  it("matches a plain bagel to bagel products", () => {
    expect(bestMatch("bagel", bagels, { kind: "packaged" })?.result.name.toLowerCase()).toContain("bagel");
  });
});

describe("macro maths", () => {
  it("computes macros deterministically from per-100 g × grams", () => {
    expect(macrosForGrams({ calories: 165, protein: 31, carbs: 0, fat: 3.6 }, 180)).toEqual({ calories: 297, protein: 55.8, carbs: 0, fat: 6.5 });
    expect(macrosForGrams({ calories: 165, protein: 31, carbs: 0, fat: 3.6 }, 0)).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(
      sumMacroSets([
        { calories: 297, protein: 55.8, carbs: 0, fat: 6.5 },
        { calories: 260, protein: 5.4, carbs: 56.4, fat: 0.6 },
      ]),
    ).toEqual({ calories: 557, protein: 61.2, carbs: 56.4, fat: 7.1 });
  });
});

describe("text sanitising", () => {
  it("strips links and markup", () => {
    expect(stripUrls("See [Domino's](https://dominos.com/nutrition) or www.fake.com now")).toBe("See Domino's or  now");
    expect(cleanText("  **Chicken** <b>breast</b> https://evil.example/x  ", 80)).toBe("Chicken breast");
    expect(cleanText("x".repeat(200), 10)).toHaveLength(10);
    expect(tidyName("CHICKEN BREAST")).toBe("Chicken breast");
    expect(tidyBrand("GIANT EAGLE")).toBe("Giant Eagle");
    expect(tidyBrand("McDonald's")).toBe("McDonald's");
  });
});

describe("search clients degrade gracefully", () => {
  it("reports DEMO_KEY usage and parses results", async () => {
    let url = "";
    const fetchImpl: FetchLike = async (u) => {
      url = u;
      return jsonResponse(usdaGeneric);
    };
    const r = await searchUSDA("chicken breast roasted", { kind: "generic", fetchImpl });
    expect(url).toContain("api_key=DEMO_KEY");
    expect(r.status).toBe("demo_key");
    expect(r.results.length).toBeGreaterThan(3);
    const ok = await searchUSDA("chicken", { apiKey: "abc", fetchImpl });
    expect(ok.status).toBe("ok");
  });

  it("returns rate_limited on USDA 429 and timeout on a hung request", async () => {
    expect((await searchUSDA("egg", { fetchImpl: async () => jsonResponse(usda429, 429) })).status).toBe("rate_limited");
    const hang: FetchLike = (_u, init) =>
      new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    expect((await searchUSDA("egg", { fetchImpl: hang, timeoutMs: 20 })).status).toBe("timeout");
  });

  it("falls back to the legacy OFF search when search-a-licious fails", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (u) => {
      calls.push(u);
      if (u.includes("search.openfoodfacts.org")) return new Response("<html>busy</html>", { status: 503, headers: { "content-type": "text/html" } });
      return jsonResponse({ products: offBagel.hits });
    };
    const r = await searchOFF("plain bagel", { fetchImpl });
    expect(calls).toHaveLength(2);
    expect(r.status).toBe("ok");
    expect(r.results.length).toBeGreaterThan(2);
  });

  it("combines sources and reports a partial outage honestly", async () => {
    const fetchImpl: FetchLike = async (u) => (u.includes("nal.usda.gov") ? jsonResponse(usda429, 429) : jsonResponse(offFairlife));
    const r = await searchFoods("fairlife protein shake", { kind: "packaged", fetchImpl, noCache: true });
    expect(r.sources).toEqual({ usda: "rate_limited", off: "ok" });
    expect(r.status).toBe("partial");
    expect(r.results[0].source).toBe("off");
    expect(overallStatus("demo_key", "ok", 5)).toBe("demo_key");
    expect(overallStatus("error", "timeout", 0)).toBe("unavailable");
    expect(overallStatus("demo_key", "skipped", 3)).toBe("demo_key");
  });

  it("does not query Open Food Facts for generic foods", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (u) => {
      calls.push(u);
      return jsonResponse(usdaGeneric);
    };
    await searchFoods("chicken breast", { kind: "generic", fetchImpl, noCache: true });
    expect(calls.every((u) => u.includes("nal.usda.gov"))).toBe(true);
  });
});

describe("unit labels", () => {
  it("pluralises counted units only", async () => {
    const { unitLabel } = await import("./normalize");
    expect(unitLabel(2, "cup")).toBe("cups");
    expect(unitLabel(1, "slice")).toBe("slice");
    expect(unitLabel(250, "g")).toBe("g");
    expect(unitLabel(3, "patty")).toBe("patties");
    expect(unitLabel(2, "slices")).toBe("slices");
  });
});

describe("general search ordering", () => {
  it("puts matching whole foods first and only spends extra USDA calls with a real key", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (u, init) => {
      calls.push(u + " " + (init?.body ?? ""));
      if (u.includes("nal.usda.gov")) return jsonResponse(String(init?.body).includes("Branded") ? usdaBranded : usdaGeneric);
      return jsonResponse(offFairlife);
    };
    const demo = await searchFoods("chicken breast roasted", { kind: "all", fetchImpl, noCache: true });
    expect(calls.filter((c) => c.includes("nal.usda.gov"))).toHaveLength(1);
    expect(demo.results[0].dataType).not.toBe("Branded");
    expect(demo.results[0].source).toBe("usda");
    calls.length = 0;
    const keyed = await searchFoods("chicken breast roasted", { kind: "all", usdaKey: "real", fetchImpl, noCache: true });
    expect(calls.filter((c) => c.includes("nal.usda.gov"))).toHaveLength(2);
    expect(keyed.results.some((r) => r.dataType === "Branded")).toBe(true);
    expect(keyed.status).toBe("ok");
  });

  it("does not lead a branded query with a generic food that misses the brand", async () => {
    const shake = {
      fdcId: 2710724,
      description: "Nutritional drink or shake, high protein, ready-to-drink (Slim Fast)",
      dataType: "Survey (FNDDS)",
      foodNutrients: [
        { nutrientId: 1003, nutrientName: "Protein", nutrientNumber: "203", unitName: "G", value: 6.7 },
        { nutrientId: 1004, nutrientName: "Total lipid (fat)", nutrientNumber: "204", unitName: "G", value: 3.3 },
        { nutrientId: 1005, nutrientName: "Carbohydrate, by difference", nutrientNumber: "205", unitName: "G", value: 1 },
        { nutrientId: 1008, nutrientName: "Energy", nutrientNumber: "208", unitName: "KCAL", value: 61 },
      ],
    };
    const fetchImpl: FetchLike = async (u) => (u.includes("nal.usda.gov") ? jsonResponse({ foods: [shake] }) : jsonResponse(offFairlife));
    const r = await searchFoods("fairlife protein shake", { kind: "all", fetchImpl, noCache: true });
    expect(r.results[0].source).toBe("off");
    expect(r.results[0].name.toLowerCase()).toContain("fairlife");
    expect(r.results.some((x) => x.source === "usda")).toBe(true);
  });
});
