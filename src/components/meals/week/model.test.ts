import { describe, expect, it } from "vitest";
import { buildPool, generateWeek } from "@/lib/meals/engine";
import { getLibraryRecipe, LIBRARY } from "@/lib/meals/library";
import { ingredientCount, recipeCostCad } from "@/lib/meals/recipe";
import { DEFAULT_PREFS, type Recipe } from "@/lib/meals/types";
import {
  conflictsInWeek,
  conflictText,
  currentThumb,
  dayFit,
  ingredientChoices,
  missingMainSlots,
  plannerContext,
  reasonWantsRepick,
  REGEN_REASONS,
  weekRangeLabel,
} from "./model";

const lib = (k: string) => {
  const r = getLibraryRecipe(k);
  if (!r) throw new Error(`missing ${k}`);
  return r;
};
const lookup = (k: string) => getLibraryRecipe(k);

describe("week labels", () => {
  it("writes the week's range, naming the month again only when it changes", () => {
    expect(weekRangeLabel("2026-10-12")).toBe("Oct 12 – 18");
    expect(weekRangeLabel("2026-10-26")).toBe("Oct 26 – Nov 1");
    expect(weekRangeLabel("2026-12-28")).toBe("Dec 28 – Jan 3");
  });
});

describe("regenerate reasons", () => {
  it("offers the six reasons from the spec, in order", () => {
    expect(REGEN_REASONS.map((r) => r.label)).toEqual([
      "I don't like this",
      "Too complicated",
      "Takes too long",
      "Too expensive",
      "Already ate this recently",
      "Don't like an ingredient",
    ]);
  });

  it("asks for a second pick only when the replacement is no better on the reason's axis", () => {
    const byTime = [...LIBRARY].sort((a, b) => a.minutes - b.minutes);
    const quick = byTime[0];
    const slow = byTime[byTime.length - 1];
    expect(reasonWantsRepick("too_long", slow, quick)).toBe(false);
    expect(reasonWantsRepick("too_long", quick, slow)).toBe(true);

    const byCost = [...LIBRARY].sort((a, b) => recipeCostCad(a) - recipeCostCad(b));
    expect(reasonWantsRepick("too_expensive", byCost[byCost.length - 1], byCost[0])).toBe(false);
    expect(reasonWantsRepick("too_expensive", byCost[0], byCost[byCost.length - 1])).toBe(true);

    const byEffort = [...LIBRARY].sort((a, b) => ingredientCount(a) + a.steps.length - (ingredientCount(b) + b.steps.length));
    expect(reasonWantsRepick("too_complicated", byEffort[byEffort.length - 1], byEffort[0])).toBe(false);
    expect(reasonWantsRepick("too_complicated", byEffort[0], byEffort[byEffort.length - 1])).toBe(true);

    // taste reasons never need one
    expect(reasonWantsRepick("dont_like", quick, slow)).toBe(false);
    expect(reasonWantsRepick("ate_recently", quick, slow)).toBe(false);
    expect(reasonWantsRepick("too_long", undefined, slow)).toBe(false);
  });

  it("repicks when the replacement still has the ingredient the user just disliked", () => {
    const bolognese = lib("lib:spaghetti-bolognese");
    const ing = bolognese.ingredients[0].key;
    const withIt = LIBRARY.find((r) => r.key !== bolognese.key && r.ingredients.some((l) => l.key === ing))!;
    const without = LIBRARY.find((r) => !r.ingredients.some((l) => l.key === ing))!;
    expect(reasonWantsRepick("dislike_ingredient", bolognese, withIt, ing)).toBe(true);
    expect(reasonWantsRepick("dislike_ingredient", bolognese, without, ing)).toBe(false);
    expect(reasonWantsRepick("dislike_ingredient", bolognese, withIt, null)).toBe(false);
  });

  it("lists a recipe's dislikeable ingredients once each, without staples", () => {
    const r = lib("lib:spaghetti-bolognese");
    const choices = ingredientChoices(r);
    expect(choices.length).toBeGreaterThan(0);
    expect(new Set(choices.map((c) => c.key)).size).toBe(choices.length);
    expect(choices.some((c) => ["salt", "black-pepper", "olive-oil", "water"].includes(c.key))).toBe(false);
    expect(choices.every((c) => c.name.length > 0)).toBe(true);
    expect(ingredientChoices(undefined)).toEqual([]);
  });
});

describe("conflicts with the user's hard constraints", () => {
  const meals = [
    { id: "a", recipe_key: "lib:spaghetti-bolognese" },
    { id: "b", recipe_key: "lib:protein-shake" },
    { id: "c", recipe_key: "lib:does-not-exist" },
  ];

  it("finds nothing under the default preferences", () => {
    expect(conflictsInWeek(meals, lookup, DEFAULT_PREFS)).toEqual([]);
  });

  it("flags planned meals that break an allergy added later, with a plain reason", () => {
    const res = conflictsInWeek(meals, lookup, { ...DEFAULT_PREFS, allergies: ["gluten"] });
    expect(res.map((r) => r.meal.id)).toContain("a");
    expect(res.find((r) => r.meal.id === "a")!.text).toMatch(/^Contains gluten/);
    expect(res.some((r) => r.meal.id === "c")).toBe(false); // unknown recipes are skipped
  });

  it("flags diets, dislikes and missing equipment", () => {
    const veg = conflictsInWeek(meals, lookup, { ...DEFAULT_PREFS, diets: ["vegetarian"] });
    expect(veg.find((r) => r.meal.id === "a")!.text).toMatch(/^Not vegetarian/);
    const beefFree = conflictsInWeek(meals, lookup, { ...DEFAULT_PREFS, diets: ["no_beef"] });
    expect(beefFree.find((r) => r.meal.id === "a")!.text).toMatch(/^Has beef/);
    const ing = lib("lib:spaghetti-bolognese").ingredients[0].key;
    const disliked = conflictsInWeek(meals, lookup, { ...DEFAULT_PREFS, dislikedIngredients: [ing] });
    expect(disliked.find((r) => r.meal.id === "a")!.text).toMatch(/on your dislikes$/);
    const noStove = conflictsInWeek(meals, lookup, { ...DEFAULT_PREFS, equipment: [] });
    expect(noStove.length).toBeGreaterThan(0);
    expect(noStove[0].text).toMatch(/^Needs /);
  });

  it("puts an allergy before anything else", () => {
    expect(
      conflictText([
        { kind: "equipment", value: "oven" },
        { kind: "allergy", value: "peanut", ingredient: "peanut-butter" },
      ]),
    ).toMatch(/^Contains peanuts/);
    expect(conflictText([])).toBeNull();
  });
});

describe("days", () => {
  it("names the missing main meals of a day", () => {
    expect(missingMainSlots([{ slot: "breakfast" }, { slot: "snack" }])).toEqual(["lunch", "dinner"]);
    expect(missingMainSlots([{ slot: "breakfast" }, { slot: "lunch" }, { slot: "dinner" }])).toEqual([]);
  });

  it("says whether a day's plan fits the goals", () => {
    const goals = { kcal: 3300, protein: 185 };
    expect(dayFit(undefined, goals, 0)).toBe("empty");
    expect(dayFit({ kcal: 3250, protein: 190, carbs: 0, fat: 0 }, goals, 5)).toBe("fits");
    expect(dayFit({ kcal: 2500, protein: 190, carbs: 0, fat: 0 }, goals, 5)).toBe("off");
    expect(dayFit({ kcal: 3300, protein: 150, carbs: 0, fat: 0 }, goals, 5)).toBe("off");
    expect(dayFit({ kcal: 3300, protein: 190, carbs: 0, fat: 0 }, null, 5)).toBe("off");
  });
});

describe("thumbs", () => {
  it("reads the newest thumbs event for a recipe", () => {
    const fb = [
      { id: "1", recipe_key: "lib:x", event: "thumbs_down" as const, created_at: "2026-10-01T10:00:00Z" },
      { id: "2", recipe_key: "lib:x", event: "thumbs_up" as const, created_at: "2026-10-03T10:00:00Z" },
      { id: "3", recipe_key: "lib:x", event: "saved" as const, created_at: "2026-10-05T10:00:00Z" },
      { id: "4", recipe_key: "lib:y", event: "thumbs_down" as const, created_at: "2026-10-06T10:00:00Z" },
    ];
    expect(currentThumb(fb, "lib:x")).toEqual({ thumb: "up", id: "2" });
    expect(currentThumb(fb, "lib:y")).toEqual({ thumb: "down", id: "4" });
    expect(currentThumb(fb, "lib:z")).toEqual({ thumb: null, id: null });
  });
});

describe("planner context", () => {
  const base = {
    weekStart: "2026-10-12",
    prefs: DEFAULT_PREFS,
    pool: buildPool([]) as Recipe[],
    feedback: [],
    favourites: [],
    history: [],
    meals: [],
    loggedIds: [],
  };

  it("needs calorie and protein goals", () => {
    expect(plannerContext({ ...base, goals: null })).toBeNull();
    expect(plannerContext({ ...base, goals: { kcal: 0, protein: 185 } })).toBeNull();
  });

  it("builds a context the engine plans a full week from, keeping logged meals fixed", () => {
    const ctx = plannerContext({ ...base, goals: { kcal: 3300, protein: 185 }, loggedIds: ["m1"], seed: "s" })!;
    expect(ctx.fixedIds).toEqual(["m1"]);
    expect(ctx.seed).toBe("s");
    const week = generateWeek(ctx);
    expect(new Set(week.meals.map((m) => m.local_date)).size).toBe(7);
    expect(week.meals.filter((m) => m.slot === "dinner")).toHaveLength(7);
  });
});
