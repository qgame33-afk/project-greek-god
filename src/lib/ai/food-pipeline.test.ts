import { describe, expect, it } from "vitest";
import usdaGeneric from "@/lib/food/__fixtures__/usda-generic-chicken.json";
import offFairlife from "@/lib/food/__fixtures__/off-fairlife.json";
import { normalizeUSDAFood, type USDAFood } from "@/lib/food/usda";
import { normalizeOFFHit, type OFFHit } from "@/lib/food/off";
import type { FoodSearchResult, LookupKind, SearchResponse } from "@/lib/food/types";
import { buildHandoffPrompt, extractJsonBlock, handoffUrl, parseHandoffResult } from "@/lib/food/handoff";
import {
  agreesWithEstimate,
  alignReplyKcal,
  macrosForPortion,
  resolveItems,
  sanitizeChatOutput,
  sanitizeItem,
  sanitizePhotoOutput,
  stripResearchClaims,
  totalsOf,
  type LookupFn,
} from "./food-pipeline";
import { mockChat, mockPhoto } from "./food-mock";

const chicken = (usdaGeneric.foods as USDAFood[]).map(normalizeUSDAFood).filter(Boolean) as FoodSearchResult[];
const fairlife = (offFairlife.hits as OFFHit[]).map(normalizeOFFHit).filter(Boolean) as FoodSearchResult[];

const fakeLookup =
  (calls: { q: string; kind: LookupKind }[] = []): LookupFn =>
  async (q, kind) => {
    calls.push({ q, kind });
    const res: SearchResponse = { results: [], status: "ok", sources: { usda: "ok", off: kind === "generic" ? "skipped" : "ok" } };
    if (/chicken/i.test(q)) res.results = chicken;
    if (/fairlife|protein shake/i.test(q) && kind === "packaged") res.results = fairlife;
    return res;
  };

describe("sanitising model output", () => {
  it("strips a fabricated URL from every text field and ignores unknown keys", () => {
    const raw = {
      items: [
        {
          name: "Pepperoni pizza https://dominos.com/fake",
          portion_description: "see [nutrition](https://fake.example/n) 2 slices",
          estimated_grams: 220,
          kind: "restaurant",
          brand: "Domino's",
          est_calories: 560,
          est_protein: 22,
          est_carbs: 62,
          est_fat: 24,
          confidence: 0.6,
          search_query: "pizza pepperoni",
          source_url: "https://www.dominos.com/en/pages/content/nutritional/cal-o-meter",
          source: "Domino's official",
        },
      ],
      overall_confidence: 0.6,
      caveats: ["Values from http://made-up.example/page"],
      questions: [],
    };
    const out = sanitizePhotoOutput(raw);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/https?:|www\.|dominos\.com|example/);
    expect(out.items[0].name).toBe("Pepperoni pizza");
    expect(out.items[0].portion).toBe("see nutrition 2 slices");
    expect(out.caveats[0]).toBe("Values from");
    expect(Object.keys(out.items[0])).not.toContain("source_url");
  });

  it("bounds numbers, strings and lists", () => {
    const s = sanitizeItem({
      name: "x".repeat(300),
      estimated_grams: 90000,
      est_calories: -5,
      est_protein: "12.5",
      est_carbs: "abc",
      est_fat: 1e9,
      confidence: 7,
      quantity: 0,
      kind: "spaceship",
    })!;
    expect(s.name.length).toBeLessThanOrEqual(80);
    expect(s.grams).toBeNull();
    expect(s.estimate).toEqual({ calories: 0, protein: 12.5, carbs: 0, fat: 600 });
    expect(s.confidence).toBe(1);
    expect(s.quantity).toBe(1);
    expect(s.kind).toBe("generic");
    expect(sanitizeItem({ name: "   " })).toBeNull();
    expect(sanitizeItem("not an object")).toBeNull();
  });

  it("keeps at most 3 valid questions with 2+ options and skips answered ones", () => {
    const qs = sanitizePhotoOutput(
      {
        items: [],
        questions: [
          { id: "chicken_method", question: "Fried or grilled?", options: ["Fried", "Grilled"] },
          { id: "bad", question: "Only one option?", options: ["Yes"] },
          { id: "sauce", question: "Sauce?", options: ["Creamy", "Tomato", "Creamy"] },
          { id: "a", question: "A?", options: ["1", "2"] },
          { id: "b", question: "B?", options: ["1", "2"] },
        ],
      },
      new Set(["chicken_method"]),
    ).questions;
    expect(qs.map((q) => q.id)).toEqual(["sauce", "a", "b"]);
    expect(qs[0].options).toEqual(["Creamy", "Tomato"]);
  });

  it("only accepts saved_food_id values the server supplied", () => {
    expect(sanitizeItem({ name: "Shake", saved_food_id: "abc" }, new Set(["xyz"]))!.savedFoodId).toBeNull();
    expect(sanitizeItem({ name: "Shake", saved_food_id: "xyz" }, new Set(["xyz"]))!.savedFoodId).toBe("xyz");
  });

  it("removes sentences that claim research the model cannot do", () => {
    expect(stripResearchClaims("I looked it up on Domino's website. A medium is about 1,840 kcal.")).toBe("A medium is about 1,840 kcal.");
    expect(stripResearchClaims("According to the official nutrition guide it's 200 kcal. Estimate only.")).toBe("Estimate only.");
    expect(stripResearchClaims("About 820 kcal with 82 g protein.")).toBe("About 820 kcal with 82 g protein.");
    const chat = sanitizeChatOutput({ reply: "I checked the official values at [Domino's](https://dominos.com). About **2,500 kcal**.", items: [] });
    expect(chat.reply).toBe("About **2,500 kcal**.");
  });
});

describe("reply total vs card total", () => {
  it("rewrites the model's whole-meal total to the database-backed total", () => {
    expect(alignReplyKcal("About **1,000 kcal** and 60 g protein.", 971, 947)).toBe("About **947 kcal** and 60 g protein.");
    expect(alignReplyKcal("About 820 kcal with 82 g protein.", 824, 824)).toBe("About 820 kcal with 82 g protein.");
    expect(alignReplyKcal("About 820 calories.", 824, 1012)).toBe("About 1,012 calories.");
  });
  it("leaves per-item numbers and unrelated numbers alone", () => {
    const r = "About 2,560 kcal. The pizza alone is 1,840 kcal; 250 g chicken.";
    expect(alignReplyKcal(r, 2560, 2400)).toBe("About 2,400 kcal. The pizza alone is 1,840 kcal; 250 g chicken.");
    expect(alignReplyKcal("Nothing to total here.", 500, 520)).toBe("Nothing to total here.");
  });
});

describe("database resolution", () => {
  it("computes macros from per-100 g × grams with a real database link", async () => {
    const calls: { q: string; kind: LookupKind }[] = [];
    const items = sanitizePhotoOutput(mockPhoto([{ questionId: "chicken_method", answer: "Grilled" }])).items;
    const { items: out, lookup } = await resolveItems(items, { lookup: fakeLookup(calls) });
    const chickenItem = out.find((i) => /chicken/i.test(i.name))!;
    expect(chickenItem.provenance).toBe("database");
    expect(chickenItem.source?.url).toBe("https://fdc.nal.usda.gov/food-details/171477/nutrients");
    expect(chickenItem.per100g).toEqual({ calories: 165, protein: 31, carbs: 0, fat: 3.6 });
    expect(chickenItem.macros).toEqual({ calories: 281, protein: 52.7, carbs: 0, fat: 6.1 }); // 170 g
    // no match for rice in the fake database → the model's estimate stays, labelled as such
    const rice = out.find((i) => /rice/i.test(i.name))!;
    expect(rice.provenance).toBe("estimate");
    expect(rice.source).toBeNull();
    expect(calls.every((c) => c.kind === "generic")).toBe(true);
    expect(lookup.usda).toBe("ok");
    expect(totalsOf(out).calories).toBe(out.reduce((a, i) => a + i.macros.calories, 0));
  });

  it("never looks restaurant items up and suggests the research handoff", async () => {
    const calls: { q: string; kind: LookupKind }[] = [];
    const chat = sanitizeChatOutput(mockChat("Medium Domino's pepperoni pizza and eight boneless wings", null));
    const { items } = await resolveItems(chat.items, { lookup: fakeLookup(calls) });
    expect(calls).toHaveLength(0);
    expect(items.every((i) => i.provenance === "estimate" && i.handoff && i.source === null)).toBe(true);
    expect(items[0].note).toBe("Estimate. Published nutrition from Domino's wasn't retrieved.");
  });

  it("rejects a database density that disagrees wildly with the estimate", async () => {
    expect(agreesWithEstimate({ calories: 900, protein: 0, carbs: 0, fat: 0 }, { calories: 250, protein: 0, carbs: 0, fat: 0 })).toBe(false);
    const s = sanitizeItem({
      name: "Chicken salad",
      estimated_grams: 200,
      est_calories: 1200,
      est_protein: 30,
      est_carbs: 10,
      est_fat: 120,
      search_query: "chicken breast roasted",
    })!;
    const { items } = await resolveItems([s], { lookup: fakeLookup() });
    expect(items[0].provenance).toBe("estimate"); // every candidate is ≤ 400 kcal for 200 g vs 1,200 estimated
  });

  it("matches packaged items by brand in Open Food Facts", async () => {
    const s = sanitizeItem({
      name: "Fairlife protein shake",
      kind: "packaged",
      brand: "Fairlife",
      estimated_grams: 340,
      est_calories: 150,
      est_protein: 30,
      est_carbs: 4,
      est_fat: 2.5,
      search_query: "fairlife protein shake",
    })!;
    const { items } = await resolveItems([s], { lookup: fakeLookup() });
    expect(items[0].provenance).toBe("database");
    expect(items[0].source?.url).toMatch(/^https:\/\/world\.openfoodfacts\.org\/product\//);
    expect(items[0].source?.name).toBe("Open Food Facts");
  });

  it("degrades to labelled estimates when lookups fail or are disabled", async () => {
    const items = sanitizePhotoOutput(mockPhoto()).items;
    const failing: LookupFn = async () => {
      throw new Error("network");
    };
    const a = await resolveItems(items, { lookup: failing });
    expect(a.items.every((i) => i.provenance === "estimate" && i.source === null)).toBe(true);
    const b = await resolveItems(items, { lookup: null });
    expect(b.items.map((i) => i.macros)).toEqual(items.map((i) => i.estimate));
  });

  it("uses the user's saved food numbers when referenced", async () => {
    const saved = [
      { id: "sf1", name: "Usual shake", serving_amount: 1, serving_unit: "serving", grams: 330, calories: 160, protein_g: 30, carbs_g: 6, fat_g: 3 },
    ];
    const s = sanitizeItem({ name: "Usual shake", quantity: 2, unit: "serving", saved_food_id: "sf1", est_calories: 100 }, new Set(["sf1"]))!;
    const { items } = await resolveItems([s], { lookup: fakeLookup(), saved });
    expect(items[0].provenance).toBe("saved");
    expect(items[0].macros).toEqual({ calories: 320, protein: 60, carbs: 12, fat: 6 });
  });
});

describe("portion edits", () => {
  it("rescales database items from per-100 g and estimates linearly", () => {
    const per100g = { calories: 165, protein: 31, carbs: 0, fat: 3.6 };
    const base = { grams: 170, macros: { calories: 281, protein: 52.7, carbs: 0, fat: 6.1 }, quantity: 1 };
    expect(macrosForPortion({ per100g, grams: 170, macros: base.macros, quantity: 1 }, base, { grams: 212.5, quantity: 1 })).toEqual({
      calories: 351,
      protein: 65.9,
      carbs: 0,
      fat: 7.7,
    });
    const est = { grams: 200, macros: { calories: 260, protein: 5.4, carbs: 56, fat: 0.6 }, quantity: 1 };
    expect(macrosForPortion({ per100g: null, grams: 200, macros: est.macros, quantity: 1 }, est, { grams: 100, quantity: 1 })).toEqual({
      calories: 130,
      protein: 2.7,
      carbs: 28,
      fat: 0.3,
    });
    const pieces = { grams: null, macros: { calories: 600, protein: 24, carbs: 72, fat: 24 }, quantity: 8 };
    expect(macrosForPortion({ per100g: null, grams: null, macros: pieces.macros, quantity: 8 }, pieces, { grams: null, quantity: 6 })).toEqual({
      calories: 450,
      protein: 18,
      carbs: 54,
      fat: 18,
    });
  });
});

describe("research handoff", () => {
  const reply = `Here are Domino's US values.

\`\`\`json
{
  "restaurant": "Domino's",
  "country": "United States",
  "items": [
    { "name": "Medium Hand Tossed Pepperoni, 1 slice", "quantity": 6, "unit": "slice", "calories_per_unit": 230, "protein_g_per_unit": 9, "carbs_g_per_unit": 26, "fat_g_per_unit": 10,
      "source_name": "Domino's Nutrition Guide", "source_url": "https://www.dominos.com/en/pages/content/nutritional/cal-o-meter", "notes": "8 slices per medium" },
    { "name": "Boneless Chicken, 1 piece", "quantity": "8", "unit": "piece", "calories_per_unit": "50", "protein_g_per_unit": 3, "carbs_g_per_unit": 3, "fat_g_per_unit": 2.5, "source_url": "", "notes": "estimate" },
    { "name": "Broken", "calories_per_unit": null },
  ]
}
\`\`\``;

  it("parses the fenced JSON into reviewable items with reported links", () => {
    const r = parseHandoffResult(reply);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.restaurant).toBe("Domino's");
    expect(r.items).toHaveLength(2);
    expect(r.skipped).toBe(1);
    expect(r.items[0].total).toEqual({ calories: 1380, protein: 54, carbs: 156, fat: 60 });
    expect(r.items[0].sourceUrl).toBe("https://www.dominos.com/en/pages/content/nutritional/cal-o-meter");
    expect(r.items[0].estimate).toBe(false);
    expect(r.items[1].sourceUrl).toBeNull();
    expect(r.items[1].estimate).toBe(true);
    expect(r.items[1].total.calories).toBe(400);
  });

  it("rejects non-http links, placeholder links and malformed replies", () => {
    const evil = parseHandoffResult(
      '```json\n{"items":[{"name":"x","quantity":1,"calories_per_unit":100,"source_url":"javascript:alert(1)"},{"name":"y","calories_per_unit":100,"source_url":"https://example.com/exact-page-you-used"}]}\n```',
    );
    expect(evil.ok && evil.items.every((i) => i.sourceUrl === null)).toBe(true);
    expect(parseHandoffResult("no json here at all").ok).toBe(false);
    expect(parseHandoffResult("```json\n{not json}\n```").ok).toBe(false);
    expect(parseHandoffResult('```json\n{"foo": 1}\n```').ok).toBe(false);
    expect(extractJsonBlock('text {"items": []} more')).toBe('{"items": []}');
  });

  it("builds a precise prompt and prefill links", () => {
    const prompt = buildHandoffPrompt({
      description: "medium Domino's pepperoni pizza, 6 slices",
      country: "United States",
      restaurant: "Domino's",
      items: [{ name: "Pepperoni pizza", quantity: 6, unit: "slice", restaurant: "Domino's" }],
    });
    expect(prompt).toContain("official");
    expect(prompt).toContain("Country: United States");
    expect(prompt).toContain("- Pepperoni pizza (from Domino's): 6 slices");
    expect(prompt).toContain("```json");
    expect(prompt).toContain("Never invent a URL");
    expect(handoffUrl("chatgpt", prompt)).toMatch(/^https:\/\/chatgpt\.com\/\?q=/);
    expect(handoffUrl("claude", "a b")).toBe("https://claude.ai/new?q=a%20b");
  });
});

describe("diary rows written on confirm", () => {
  let n = 0;
  const ctx = {
    meal: "lunch" as const,
    localDate: "2026-10-16",
    eatenAt: "2026-10-16T12:30:00.000Z",
    groupId: "g-1",
    source: "photo_ai" as const,
    newId: () => `id-${++n}`,
  };

  it("writes database items by weight with per-100 g bases for rescaling", async () => {
    const { entriesFromItems } = await import("./food-log");
    const items = (await resolveItems(sanitizePhotoOutput(mockPhoto([{ questionId: "chicken_method", answer: "Grilled" }])).items, { lookup: fakeLookup() }))
      .items;
    const rows = entriesFromItems(items, ctx);
    const chicken = rows.find((r) => /chicken/i.test(r.name))!;
    expect(chicken).toMatchObject({
      amount: 170,
      unit: "g",
      grams: 170,
      calories: 281,
      protein_g: 52.7,
      base_amount: 100,
      base_calories: 165,
      base_protein_g: 31,
      source: "photo_ai",
      confidence: "database",
      source_name: "USDA FoodData Central",
      source_url: "https://fdc.nal.usda.gov/food-details/171477/nutrients",
      meal_group_id: "g-1",
      meal: "lunch",
      local_date: "2026-10-16",
    });
    const rice = rows.find((r) => /rice/i.test(r.name))!;
    expect(rice).toMatchObject({ confidence: "estimate", source_url: null, base_amount: 200, base_calories: 260 });
    expect(new Set(rows.map((r) => r.meal_group_id))).toEqual(new Set(["g-1"]));
  });

  it("keeps edited photo portions as grams (not fractional servings)", async () => {
    const { entryFromItem } = await import("./food-log");
    const { toEditable, withGrams } = await import("./food-edit");
    const items = (await resolveItems(sanitizePhotoOutput(mockPhoto([{ questionId: "chicken_method", answer: "Grilled" }])).items, { lookup: fakeLookup() }))
      .items;
    const edited = withGrams(toEditable(items[0], "k"), 100);
    expect(entryFromItem(edited, ctx)).toMatchObject({ amount: 100, unit: "g", grams: 100, calories: 165, base_amount: 100, base_calories: 165 });
  });

  it("writes counted chat items by quantity and keeps the brand", async () => {
    const { entryFromItem } = await import("./food-log");
    const chat = sanitizeChatOutput(mockChat("Medium Domino's pepperoni pizza and eight boneless wings", null));
    const { items } = await resolveItems(chat.items, { lookup: null });
    const row = entryFromItem(items[0], { ...ctx, source: "chat_ai" });
    expect(row).toMatchObject({
      amount: 8,
      unit: "slice",
      grams: 640,
      brand: "Domino's",
      base_amount: 8,
      base_calories: 1840,
      calories: 1840,
      confidence: "estimate",
      source: "chat_ai",
    });
  });

  it("labels handoff rows as reported by the assistant, never verified", async () => {
    const { entryFromHandoff } = await import("./food-log");
    const parsed = parseHandoffResult(
      '```json\n{"restaurant":"Domino\'s","items":[{"name":"Pepperoni slice","quantity":6,"unit":"slice","calories_per_unit":230,"protein_g_per_unit":9,"carbs_g_per_unit":26,"fat_g_per_unit":10,"source_name":"Domino\'s Nutrition","source_url":"https://www.dominos.com/nutrition"}]}\n```',
    );
    if (!parsed.ok) throw new Error("parse failed");
    const row = entryFromHandoff(parsed.items[0], "chatgpt", parsed.restaurant, { ...ctx, source: "assistant_handoff" });
    expect(row).toMatchObject({
      source: "assistant_handoff",
      confidence: "estimate",
      amount: 6,
      base_amount: 1,
      base_calories: 230,
      calories: 1380,
      source_name: "Domino's Nutrition · via ChatGPT",
      source_url: "https://www.dominos.com/nutrition",
      brand: "Domino's",
    });
  });
});

describe("review edits", () => {
  it("steps portions by 0.25× and recalculates from the original analysis", async () => {
    const { toEditable, withMultiplier, withGrams, multLabel } = await import("./food-edit");
    const { items } = await resolveItems(sanitizePhotoOutput(mockPhoto([{ questionId: "chicken_method", answer: "Grilled" }])).items, { lookup: fakeLookup() });
    const chicken = toEditable(
      items.find((i) => /chicken/i.test(i.name))!,
      "k1",
    );
    const up = withMultiplier(chicken, 1.25);
    expect(up.grams).toBe(213);
    expect(up.macros).toEqual({ calories: 351, protein: 66, carbs: 0, fat: 7.7 });
    expect(multLabel(up.mult)).toBe("1.25×");
    expect(withMultiplier(up, 1).macros).toEqual(chicken.macros); // back to the original, no drift
    expect(withMultiplier(chicken, 0).mult).toBe(0.25);
    const typed = withGrams(chicken, 85);
    expect(typed.mult).toBe(0.5);
    expect(typed.macros.calories).toBe(140);
    const pizza = toEditable(
      { ...chicken, per100g: null, grams: null, quantity: 8, unit: "slice", macros: { calories: 1840, protein: 76, carbs: 200, fat: 80 } },
      "k2",
    );
    pizza.base = { grams: null, quantity: 8, macros: pizza.macros };
    expect(withMultiplier(pizza, 0.75)).toMatchObject({ quantity: 6, macros: { calories: 1380, protein: 57, carbs: 150, fat: 60 } });
  });
});

describe("rejecting a database match", () => {
  it("returns to the model estimate at the current portion", async () => {
    const { toEditable, withMultiplier, withEstimate } = await import("./food-edit");
    const { items } = await resolveItems(sanitizePhotoOutput(mockPhoto([{ questionId: "chicken_method", answer: "Grilled" }])).items, { lookup: fakeLookup() });
    const chicken = withMultiplier(toEditable(items[0], "k"), 2);
    expect(chicken.provenance).toBe("database");
    const est = withEstimate(chicken);
    expect(est).toMatchObject({ provenance: "estimate", source: null, per100g: null, grams: 340 });
    expect(est.macros).toEqual({ calories: 562, protein: 106, carbs: 0, fat: 12 }); // 2 × the model's 281 / 53 / 0 / 6
  });
});
