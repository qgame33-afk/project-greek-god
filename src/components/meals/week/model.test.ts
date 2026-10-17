import { describe, expect, it } from "vitest";
import { buildPool, generateWeek } from "@/lib/meals/engine";
import { getLibraryRecipe, LIBRARY } from "@/lib/meals/library";
import { ingredientCount, recipeConflicts, recipeCostCad } from "@/lib/meals/recipe";
import { DEFAULT_PREFS, type Recipe } from "@/lib/meals/types";
import {
  planSplit,
  midWeekNote,
  conflictLines,
  conflictTitle,
  conflictsInWeek,
  conflictText,
  currentThumb,
  dayFit,
  ingredientChoices,
  missingMainSlots,
  notedText,
  plannerContext,
  reasonWantsRepick,
  REGEN_REASONS,
  thumbRows,
  weekNotes,
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

describe("strip and week notes", () => {
  it("names the second pick only when there was one", () => {
    expect(notedText("too_complicated")).toBe("Noted. Simpler meals from now on.");
    expect(notedText("too_complicated", "Tuna Melts")).toBe("Noted. Swapped in something simpler: Tuna Melts.");
    expect(notedText("dislike_ingredient", "Beef Tacos")).toBe("Added to your dislikes. Swapped in Beef Tacos.");
    // taste reasons never re-pick, so a name is ignored
    expect(notedText("ate_recently", "Beef Tacos")).toBe("Noted. It'll rest for 2 weeks.");
  });

  it("says nothing when the week came out whole", () => {
    const days = Array.from({ length: 7 }, () => ({ meals: 5, proteinOk: true }));
    expect(weekNotes({ meals: Array(35), kept: [], days }, 5)).toBeNull();
  });

  it("counts empty places and low-protein days honestly", () => {
    const days = Array.from({ length: 7 }, (_, i) => ({ meals: 5, proteinOk: i > 1 }));
    const text = weekNotes({ meals: Array(31), kept: Array(2), days }, 5);
    expect(text).toBe("2 meals have nothing that fits your settings, and 2 days are under 90% of your protein goal. Loosening a preference gives the planner more to pick from.");
    expect(weekNotes({ meals: Array(34), kept: [], days: days.map((d) => ({ ...d, proteinOk: true })) }, 5)).toMatch(/^1 meal has nothing/);
  });

  it("finds every thumbs row for a recipe and nothing else", () => {
    const rows = [
      { recipe_key: "lib:a", event: "thumbs_up" as const },
      { recipe_key: "lib:a", event: "kept" as const },
      { recipe_key: "lib:a", event: "thumbs_down" as const },
      { recipe_key: "lib:b", event: "thumbs_up" as const },
    ];
    expect(thumbRows(rows, "lib:a").map((r) => r.event)).toEqual(["thumbs_up", "thumbs_down"]);
  });
});

describe("planned vs logged", () => {
  const M = (kcal: number) => ({ kcal, protein: 0, carbs: 0, fat: 0 });
  it("says not eaten only while nothing that day is logged", () => {
    expect(planSplit(M(3277), M(3277), 5, 0)).toEqual({ label: "Planned — not eaten", detail: null, loggedKcal: 0 });
  });
  it("splits logged from still planned", () => {
    expect(planSplit(M(4062), M(1450), 5, 2)).toEqual({ label: "Planned", detail: "Logged 2,612 · still planned 1,450 kcal", loggedKcal: 2612 });
  });
  it("says so when every meal is logged", () => {
    expect(planSplit(M(3300), undefined, 4, 4)).toEqual({ label: "Planned", detail: "All in your food log", loggedKcal: 3300 });
  });
  it("handles a day with no meals", () => {
    expect(planSplit(undefined, undefined, 0, 0).detail).toBeNull();
  });
});

describe("conflict lines for the recipe and cooking screens", () => {
  const pb = getLibraryRecipe("lib:pb-banana-oatmeal")!;
  it("lists every conflict, allergies first, and titles by the most serious", () => {
    const c = recipeConflicts(pb, { allergies: ["peanut"], diets: ["vegetarian"], dislikedIngredients: ["banana"], equipment: ["microwave"] });
    const lines = conflictLines(c);
    expect(lines[0]).toMatch(/^Contains peanuts/);
    expect(lines.some((l) => /dislikes/.test(l))).toBe(true);
    expect(new Set(lines).size).toBe(lines.length);
    expect(conflictTitle(c)).toBe("On your allergy list");
  });
  it("has nothing to say when the recipe fits", () => {
    const c = recipeConflicts(pb, { allergies: [], diets: [], dislikedIngredients: [], equipment: ["microwave", "stovetop", "oven", "toaster", "blender", "kettle", "air_fryer", "grill"] });
    expect(conflictLines(c)).toEqual([]);
    expect(conflictTitle(c)).toBeNull();
  });
});

describe("planning from today mid-week", () => {
  const ws = "2026-10-12";
  it("says which days were planned and which stayed", () => {
    expect(midWeekNote(ws, "2026-10-16")?.text).toBe("Planned from Friday. Monday to Thursday stay as they were.");
    expect(midWeekNote(ws, "2026-10-13")?.text).toBe("Planned from Tuesday. Monday stays as it was.");
    expect(midWeekNote(ws, "2026-10-16")?.earlier).toBe("Monday to Thursday");
    expect(midWeekNote(ws, "2026-10-16", false)?.text).toBe("Planned from Friday. Monday to Thursday aren't planned.");
    expect(midWeekNote(ws, "2026-10-13", false)?.text).toBe("Planned from Tuesday. Monday isn't planned.");
  });
  it("is quiet for a whole week or a week already over", () => {
    expect(midWeekNote(ws, ws)).toBeNull();
    expect(midWeekNote(ws, "2026-10-19")).toBeNull();
  });
  it("passes today and the whole-week choice to the engine, which plans only the days ahead", () => {
    const pool = buildPool([]);
    const base = { weekStart: ws, goals: { kcal: 3300, protein: 185 }, prefs: DEFAULT_PREFS, pool, feedback: [], favourites: [], history: [], meals: [], loggedIds: [], seed: "t" };
    const fromToday = plannerContext({ ...base, today: "2026-10-16" })!;
    expect(fromToday.today).toBe("2026-10-16");
    const res = generateWeek(fromToday);
    expect(res.from).toBe("2026-10-16");
    expect(new Set(res.meals.map((m) => m.local_date))).toEqual(new Set(["2026-10-16", "2026-10-17", "2026-10-18"]));
    const whole = generateWeek(plannerContext({ ...base, today: "2026-10-16", wholeWeek: true })!);
    expect(whole.from).toBe(ws);
    expect(new Set(whole.meals.map((m) => m.local_date)).size).toBe(7);
  });
});
