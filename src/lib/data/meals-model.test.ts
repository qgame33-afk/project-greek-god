import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, type MealPrefs } from "@/lib/meals/types";
import {
  applyMealPatch,
  cleanGroceryInput,
  customGroceryKey,
  defaultEatenAt,
  feedbackFromRow,
  feedbackToRow,
  groceryOutOfDate,
  inWeek,
  isCustomGroceryKey,
  isExplicitFeedback,
  loggedByPlannedMeal,
  mealToSlot,
  mergeGroceryItems,
  optimisticPlanMeal,
  plannedMealFoodEntry,
  plannedMealFromRow,
  plannedMealPatchToRow,
  planReplacement,
  prefsFromRow,
  prefsPatchToRow,
  recipeFromRow,
  recipeToRow,
  shiftWeek,
  slotToMeal,
  sortGroceryItems,
  sortPlanMeals,
  toNewPlannedMeal,
  userRecipeId,
  userRecipeKey,
  validateNewMeals,
  weekDays,
  weekStart,
  HISTORY_CAP,
  type GroceryItem,
  type MealPrefsRow,
  type PlanMeal,
  type PlannedMealRow,
  type UserRecipeRow,
} from "./meals-model";

const ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const ID2 = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";

describe("weeks", () => {
  it("starts on Monday and covers Mon–Sun", () => {
    expect(weekStart("2026-10-16")).toBe("2026-10-12"); // Friday → Monday
    expect(weekStart("2026-10-12")).toBe("2026-10-12"); // Monday stays
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday belongs to the week before
    expect(weekDays("2026-10-12")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });
  it("shifts by whole weeks across month, year and DST edges", () => {
    expect(shiftWeek("2026-10-16", 1)).toBe("2026-10-19");
    expect(shiftWeek("2026-10-16", -1)).toBe("2026-10-05");
    expect(shiftWeek("2026-12-31", 1)).toBe("2027-01-04");
    expect(shiftWeek("2026-10-30", 1)).toBe("2026-11-02"); // Nov 1 DST change in Toronto
    expect(weekDays("2026-10-26")[6]).toBe("2026-11-01");
  });
  it("knows which dates are in a week", () => {
    expect(inWeek("2026-10-12", "2026-10-12")).toBe(true);
    expect(inWeek("2026-10-18", "2026-10-12")).toBe(true);
    expect(inWeek("2026-10-19", "2026-10-12")).toBe(false);
    expect(inWeek("2026-10-11", "2026-10-12")).toBe(false);
  });
});

describe("preferences", () => {
  it("defaults when nothing is stored, without sharing the default arrays", () => {
    const p = prefsFromRow(null);
    expect(p).toEqual(DEFAULT_PREFS);
    p.equipment.push("grill");
    expect(DEFAULT_PREFS.equipment).not.toContain("grill");
  });
  it("maps columns, coerces numerics and drops unknown values", () => {
    const row = {
      user_id: "u",
      difficulty: "everyday",
      budget: "weird",
      weekly_budget_cad: "85.50" as unknown as number,
      max_minutes: 25,
      allergies: ["peanut", "kryptonite", "peanut"],
      diets: ["halal"],
      disliked_ingredients: ["mushrooms"],
      liked_ingredients: [],
      liked_cuisines: ["mexican"],
      disliked_cuisines: [],
      equipment: ["oven", "laser"],
      pantry: ["rice-dry"],
      snacks_per_day: 3,
      created_at: "",
      updated_at: "",
    } satisfies Record<keyof MealPrefsRow, unknown>;
    const p = prefsFromRow(row as MealPrefsRow);
    expect(p.difficulty).toBe("everyday");
    expect(p.budget).toBe("normal");
    expect(p.weeklyBudgetCad).toBe(85.5);
    expect(p.maxMinutes).toBe(25);
    expect(p.allergies).toEqual(["peanut"]);
    expect(p.diets).toEqual(["halal"]);
    expect(p.equipment).toEqual(["oven"]);
    expect(p.snacksPerDay).toBe(3);
    expect(prefsFromRow({ snacks_per_day: 9 }).snacksPerDay).toBe(2);
  });
  it("turns a valid patch into columns and refuses bad values", () => {
    expect(prefsPatchToRow({ allergies: ["egg", "egg", "dairy"], snacksPerDay: 1, weeklyBudgetCad: null })).toEqual({
      allergies: ["egg", "dairy"],
      snacks_per_day: 1,
      weekly_budget_cad: null,
    });
    expect(prefsPatchToRow({})).toEqual({});
    expect(() => prefsPatchToRow({ snacksPerDay: 5 })).toThrow(/snacksPerDay/);
    expect(() => prefsPatchToRow({ allergies: ["nuts" as never] })).toThrow(/isn't valid/);
    expect(() => prefsPatchToRow({ maxMinutes: 2 })).toThrow();
    // a full round trip keeps everything
    const full: MealPrefs = { ...DEFAULT_PREFS, difficulty: "i_like_cooking", likedCuisines: ["italian"], pantry: ["egg"] };
    const cols = prefsPatchToRow(full);
    expect(prefsFromRow({ ...cols, user_id: "u" } as MealPrefsRow)).toEqual(full);
  });
});

const row = (over: Partial<PlannedMealRow> = {}): PlannedMealRow => ({
  id: ID,
  user_id: "u",
  plan_id: "p",
  local_date: "2026-10-12",
  slot: "dinner",
  position: 0,
  recipe_key: "lib:spaghetti-bolognese",
  servings: 1.5,
  locked: false,
  reason: [{ kind: "macro_fit", text: "Fits dinner: 920 kcal", weight: 1.2 }],
  history: [],
  created_at: "c",
  updated_at: "u",
  ...over,
});

const meal = (over: Partial<PlanMeal> = {}): PlanMeal => plannedMealFromRow(row(over as Partial<PlannedMealRow>));

describe("planned meals", () => {
  it("parses stored rows defensively", () => {
    const m = plannedMealFromRow(
      row({
        servings: "1.75" as unknown as number,
        reason: [{ kind: "macro_fit", text: "ok", weight: "2" }, { kind: "made_up", text: "x" }, null] as never,
        history: [{ recipe_key: "lib:a", servings: 2, reason: null }, { nope: 1 }, "x"] as never,
      }),
    );
    expect(m.servings).toBe(1.75);
    expect(m.reason).toEqual([{ kind: "macro_fit", text: "ok", weight: 2 }]);
    expect(m.history).toEqual([{ recipe_key: "lib:a", servings: 2, reason: null }]);
    expect(plannedMealFromRow(row({ reason: null, history: {} as never })).reason).toBeNull();
  });
  it("sorts by day, slot order, then position", () => {
    const list = sortPlanMeals([
      meal({ id: "d", local_date: "2026-10-13", slot: "breakfast" }),
      meal({ id: "s2", slot: "snack", position: 1 }),
      meal({ id: "s1", slot: "snack", position: 0 }),
      meal({ id: "b", slot: "breakfast" }),
      meal({ id: "l", slot: "lunch" }),
    ]);
    expect(list.map((m) => m.id)).toEqual(["b", "l", "s1", "s2", "d"]);
  });
  it("validates patches and caps the Undo history (newest kept)", () => {
    const history = Array.from({ length: HISTORY_CAP + 5 }, (_, i) => ({ recipe_key: `lib:r${i}`, servings: 1, reason: null }));
    const out = plannedMealPatchToRow({ servings: 1.336, history, locked: true });
    expect(out.servings).toBe(1.34);
    expect(out.locked).toBe(true);
    const kept = out.history as { recipe_key: string }[];
    expect(kept).toHaveLength(HISTORY_CAP);
    expect(kept.at(-1)?.recipe_key).toBe(`lib:r${HISTORY_CAP + 4}`);
    expect(() => plannedMealPatchToRow({ servings: 0 })).toThrow(/between 0.25 and 6/);
    expect(() => plannedMealPatchToRow({ servings: 7 })).toThrow();
    expect(() => plannedMealPatchToRow({ slot: "brunch" as never })).toThrow();
    expect(() => plannedMealPatchToRow({ recipe_key: "" })).toThrow();
    expect(plannedMealPatchToRow({ position: 99 }).position).toBe(20);
  });
  it("applies a patch to one meal and keeps the week sorted", () => {
    const week = { plan: null, meals: [meal({ id: "a", slot: "breakfast" }), meal({ id: "b", slot: "dinner" })] };
    const next = applyMealPatch(week, "b", { slot: "lunch", servings: 2 }, "now");
    expect(next.meals.map((m) => [m.id, m.slot, m.servings])).toEqual([
      ["a", "breakfast", 1.5],
      ["b", "lunch", 2],
    ]);
    expect(next.meals[1].updated_at).toBe("now");
    expect(week.meals[1].slot).toBe("dinner"); // not mutated
  });
  it("checks a new week before it's written", () => {
    const ok = validateNewMeals([{ local_date: "2026-10-18", slot: "snack", position: 1.4, recipe_key: "lib:shake", servings: 1 }], "2026-10-12");
    expect(ok[0].position).toBe(1);
    expect(ok[0].history).toEqual([]);
    expect(() => validateNewMeals([], "2026-10-13")).toThrow(/Monday/);
    expect(() => validateNewMeals([{ local_date: "2026-10-19", slot: "lunch", recipe_key: "lib:x", servings: 1 }], "2026-10-12")).toThrow(/isn't in the week/);
    expect(() => validateNewMeals([{ local_date: "2026-10-12", slot: "lunch", recipe_key: "lib:x", servings: 0.1 }], "2026-10-12")).toThrow(/Servings/);
  });
});

describe("planReplacement (mirror of replace_meal_plan)", () => {
  const existing = [
    meal({ id: "locked", slot: "breakfast", locked: true }),
    meal({ id: "logged", slot: "lunch" }),
    meal({ id: "free", slot: "dinner" }),
  ];
  const incoming = [
    { local_date: "2026-10-12", slot: "breakfast" as const, recipe_key: "lib:new-b", servings: 1 },
    { local_date: "2026-10-12", slot: "lunch" as const, recipe_key: "lib:new-l", servings: 1 },
    { local_date: "2026-10-12", slot: "dinner" as const, recipe_key: "lib:new-d", servings: 1 },
    { local_date: "2026-10-12", slot: "dinner" as const, recipe_key: "lib:dupe-place", servings: 1 },
    { id: "locked", local_date: "2026-10-13", slot: "dinner" as const, recipe_key: "lib:dupe-id", servings: 1 },
  ];
  it("keeps locked and logged meals and drops incoming meals in their place", () => {
    const r = planReplacement(existing, incoming, { loggedIds: new Set(["logged"]) });
    expect(r.kept.map((m) => m.id)).toEqual(["locked", "logged"]);
    expect(r.removed.map((m) => m.id)).toEqual(["free"]);
    expect(r.added.map((m) => m.recipe_key)).toEqual(["lib:new-d"]);
  });
  it("replaces everything when asked not to keep", () => {
    const r = planReplacement(existing, incoming.slice(0, 3), { keepLocked: false, keepLogged: false, loggedIds: new Set(["logged"]) });
    expect(r.kept).toEqual([]);
    expect(r.added).toHaveLength(3);
  });
  it("round-trips stored meals for Undo", () => {
    const m = meal({ id: "x", locked: true, history: [{ recipe_key: "lib:a", servings: 1, reason: null }] });
    const back = optimisticPlanMeal(toNewPlannedMeal(m), "p", "ignored", "t");
    expect({ ...back, created_at: m.created_at, updated_at: m.updated_at }).toEqual(m);
    expect(optimisticPlanMeal({ local_date: "2026-10-12", slot: "lunch", recipe_key: "k", servings: 1 }, "p", "gen", "t").id).toBe("gen");
  });
  it("groups food-log links by planned meal", () => {
    expect(
      loggedByPlannedMeal([
        { planned_meal_id: "a", local_date: "2026-10-13" },
        { planned_meal_id: "a", local_date: "2026-10-12" },
        { planned_meal_id: "a", local_date: "2026-10-12" },
        { planned_meal_id: null, local_date: "2026-10-12" },
        { planned_meal_id: "b", local_date: "2026-10-14" },
      ]),
    ).toEqual({ a: ["2026-10-12", "2026-10-13"], b: ["2026-10-14"] });
  });
});

describe("feedback", () => {
  it("builds rows with a features snapshot and refuses unknown events", () => {
    const r = feedbackToRow({ recipe_key: "lib:tacos", event: "thumbs_down", reason: "too_complicated", features: ["time:long", "time:long", ""] }, ID);
    expect(r).toEqual({ id: ID, recipe_key: "lib:tacos", event: "thumbs_down", reason: "too_complicated", ingredient: null, features: ["time:long"] });
    expect(feedbackToRow({ id: ID2, recipe_key: "lib:x", event: "viewed", features: [] }, ID).id).toBe(ID2);
    expect(() => feedbackToRow({ recipe_key: "lib:x", event: "loved" as never, features: [] }, ID)).toThrow();
    expect(() => feedbackToRow({ recipe_key: "lib:x", event: "viewed", reason: "meh" as never, features: [] }, ID)).toThrow();
  });
  it("reads stored rows and skips unknown events", () => {
    const base = { id: ID, user_id: "u", recipe_key: "lib:x", reason: null, ingredient: null, features: ["a"], created_at: "t" };
    expect(feedbackFromRow({ ...base, event: "kept" })?.event).toBe("kept");
    expect(feedbackFromRow({ ...base, event: "nope" })).toBeNull();
  });
  it("treats thumbs, favourites and reasons as explicit", () => {
    expect(isExplicitFeedback({ event: "thumbs_up" })).toBe(true);
    expect(isExplicitFeedback({ event: "regenerated", reason: "too_long" })).toBe(true);
    expect(isExplicitFeedback({ event: "viewed" })).toBe(false);
  });
});

describe("user recipes", () => {
  const recipe = {
    key: "draft",
    name: "  Easy Chicken Wrap ",
    slots: ["lunch" as const],
    minutes: 10,
    difficulty: "super_easy" as const,
    cost: 1 as const,
    servings: 1 as const,
    ingredients: [{ key: "tortilla", qty: 1, unit: "piece" as const }],
    steps: [{ text: "Wrap it." }],
    equipment: ["microwave" as const],
    tags: ["protein:chicken"],
    blurb: "Fast.",
    origin: "simplified" as const,
    baseKey: "lib:chicken-wrap",
  };
  it("keys user recipes as usr:<uuid>", () => {
    expect(userRecipeKey(ID)).toBe(`usr:${ID}`);
    expect(userRecipeId(`usr:${ID}`)).toBe(ID);
    expect(userRecipeId("lib:tacos")).toBeNull();
    expect(userRecipeId("usr:not-a-uuid")).toBeNull();
  });
  it("round-trips through a row", () => {
    const r = recipeToRow(recipe, ID);
    expect(r).toMatchObject({ id: ID, origin: "simplified", base_key: "lib:chicken-wrap", name: "Easy Chicken Wrap" });
    const stored: UserRecipeRow = { ...r, user_id: "u", created_at: "t", base_key: r.base_key ?? null, data: r.data };
    const back = recipeFromRow(stored);
    expect(back?.key).toBe(`usr:${ID}`);
    expect(back?.name).toBe("Easy Chicken Wrap");
    expect(back?.ingredients).toEqual(recipe.ingredients);
  });
  it("refuses library recipes, nameless recipes and broken JSON", () => {
    expect(() => recipeToRow({ ...recipe, origin: "library" }, ID)).toThrow(/AI, simplified or custom/);
    expect(() => recipeToRow({ ...recipe, name: " " }, ID)).toThrow(/name/);
    expect(recipeFromRow({ id: ID, user_id: "u", origin: "ai", base_key: null, name: "x", data: { name: "x" }, created_at: "t" })).toBeNull();
    expect(recipeFromRow({ id: ID, user_id: "u", origin: "ai", base_key: null, name: "x", data: [] as never, created_at: "t" })).toBeNull();
  });
});

const item = (over: Partial<GroceryItem>): GroceryItem => ({
  id: "i",
  user_id: "u",
  plan_id: "p",
  key: "egg",
  name: "Eggs",
  category: "dairy_eggs",
  qty: 12,
  unit: "piece",
  label: "1 dozen",
  checked: false,
  have: false,
  removed: false,
  custom: false,
  est_cost_cad: 4.5,
  position: 0,
  created_at: "c",
  updated_at: "u",
  ...over,
});

describe("grocery list", () => {
  it("cleans generated input: unique, no custom keys, bounded values", () => {
    const out = cleanGroceryInput([
      { key: "egg", name: "Eggs", category: "dairy_eggs", qty: 12.004 },
      { key: "egg", name: "Eggs again", category: "dairy_eggs" },
      { key: "custom:x", name: "Nope", category: "other" },
      { key: "salt", name: "", category: "spices" as never, est_cost_cad: -2 },
    ]);
    expect(out.map((i) => i.key)).toEqual(["egg", "salt"]);
    expect(out[0].qty).toBe(12);
    expect(out[1]).toMatchObject({ name: "salt", category: "other", est_cost_cad: 0, position: 1 });
  });
  it("merges a regenerated list keeping checked/have/removed and custom items", () => {
    const existing = [
      item({ id: "e", key: "egg", checked: true, have: true }),
      item({ id: "t", key: "tortilla", name: "Tortillas", category: "bread_grains", removed: true }),
      item({ id: "s", key: "salt", name: "Salt", category: "pantry" }),
      item({ id: "c", key: customGroceryKey(ID), name: "Paper towel", category: "other", custom: true }),
    ];
    let n = 0;
    const merged = mergeGroceryItems(
      existing,
      [
        { key: "egg", name: "Eggs", category: "dairy_eggs", qty: 18, label: "1.5 dozen", position: 0 },
        { key: "tortilla", name: "Tortillas", category: "bread_grains", qty: 8, position: 1 },
        { key: "ground-beef-lean", name: "Lean ground beef", category: "meat", qty: 454, unit: "g", have: true, position: 2 },
      ],
      { planId: "p", userId: "u", now: "now", newId: () => `new${n++}` },
    );
    const by = Object.fromEntries(merged.map((i) => [i.key, i]));
    expect(Object.keys(by).sort()).toEqual(["custom:" + ID, "egg", "ground-beef-lean", "tortilla"].sort());
    expect(by.egg).toMatchObject({ id: "e", checked: true, have: true, qty: 18, label: "1.5 dozen" });
    expect(by.tortilla).toMatchObject({ id: "t", removed: true, qty: 8 });
    expect(by["ground-beef-lean"]).toMatchObject({ id: "new0", have: true, checked: false, removed: false, custom: false });
    // meat aisle first, custom "other" last
    expect(merged[0].key).toBe("ground-beef-lean");
    expect(merged.at(-1)?.custom).toBe(true);
  });
  it("tells when the stored list no longer matches the plan", () => {
    const stored = [item({ key: "egg", qty: 12 }), item({ key: customGroceryKey(ID), custom: true, qty: null })];
    const same = [{ key: "egg", name: "Eggs", category: "dairy_eggs" as const, qty: 12, unit: "piece" }];
    expect(groceryOutOfDate(stored, same)).toBe(false);
    expect(groceryOutOfDate(stored, [{ ...same[0], qty: 18 }])).toBe(true);
    expect(groceryOutOfDate(stored, [{ ...same[0], unit: "g" }])).toBe(true);
    expect(groceryOutOfDate(stored, [...same, { key: "milk", name: "Milk", category: "dairy_eggs" as const }])).toBe(true);
    expect(groceryOutOfDate(stored, [])).toBe(true);
  });
  it("recognises custom keys and sorts by aisle", () => {
    expect(isCustomGroceryKey(customGroceryKey(ID))).toBe(true);
    expect(isCustomGroceryKey("egg")).toBe(false);
    const sorted = sortGroceryItems([
      { category: "pantry", position: 0, name: "Rice" },
      { category: "meat", position: 2, name: "Beef" },
      { category: "meat", position: 1, name: "Chicken" },
    ]);
    expect(sorted.map((s) => s.name)).toEqual(["Chicken", "Beef", "Rice"]);
  });
});

describe("food log entry for a planned meal", () => {
  const recipe = {
    key: "lib:spaghetti-bolognese",
    name: "Easy Spaghetti Bolognese",
    ingredients: [
      { key: "pasta-dry", qty: 125, unit: "g" as const, grams: 125 },
      { key: "ground-beef-lean", qty: 150, unit: "g" as const, grams: 150 },
      { key: "pasta-sauce-jarred", qty: 180, unit: "ml" as const, grams: 185 },
      { key: "parmesan", qty: 1, unit: "tbsp" as const, grams: 5, optional: true },
    ],
  };
  const input = {
    id: ID,
    plannedMealId: ID2,
    recipe,
    servings: 1.5,
    date: "2026-10-16",
    meal: "dinner" as const,
    macros: { kcal: 1350, protein: 82.5, carbs: 150, fat: 40.5 },
  };
  it("is one row: servings of the recipe, per-serving base, meal-plan estimate, linked", () => {
    const now = new Date("2026-10-16T22:15:00Z");
    const e = plannedMealFoodEntry(input, { todayDate: "2026-10-16", now });
    expect(e).toMatchObject({
      id: ID,
      planned_meal_id: ID2,
      name: "Easy Spaghetti Bolognese",
      amount: 1.5,
      unit: "serving",
      meal: "dinner",
      local_date: "2026-10-16",
      eaten_at: now.toISOString(),
      calories: 1350,
      protein_g: 82.5,
      base_amount: 1,
      base_calories: 900,
      base_protein_g: 55,
      base_carbs_g: 100,
      base_fat_g: 27,
      source: "meal_plan",
      confidence: "estimate",
      grams: 690, // (125 + 150 + 185) × 1.5, optional parmesan left out
    });
  });
  it("stamps another day at the meal's usual time and works without a planned meal", () => {
    const e = plannedMealFoodEntry({ ...input, plannedMealId: undefined, date: "2026-10-14", meal: "snacks" }, { todayDate: "2026-10-16" });
    expect(e.planned_meal_id).toBeNull();
    expect(new Date(e.eaten_at!).getHours()).toBe(15);
    expect(new Date(e.eaten_at!).getMinutes()).toBe(30);
    expect(e.local_date).toBe("2026-10-14");
  });
  it("leaves grams empty when an ingredient weight is unknown", () => {
    const e = plannedMealFoodEntry({ ...input, recipe: { name: "Wrap", ingredients: [{ key: "x", qty: 1, unit: "piece" }] } }, { todayDate: "2026-10-16" });
    expect(e.grams).toBeNull();
    expect(plannedMealFoodEntry({ ...input, recipe: { name: "" } }, { todayDate: "2026-10-16" }).name).toBe("Planned meal");
  });
  it("refuses impossible values", () => {
    const opts = { todayDate: "2026-10-16" };
    expect(() => plannedMealFoodEntry({ ...input, servings: 0 }, opts)).toThrow(/Servings/);
    expect(() => plannedMealFoodEntry({ ...input, servings: NaN }, opts)).toThrow(/Servings/);
    expect(() => plannedMealFoodEntry({ ...input, macros: { ...input.macros, kcal: -1 } }, opts)).toThrow(/Calories/);
    expect(() => plannedMealFoodEntry({ ...input, macros: { ...input.macros, protein: Infinity } }, opts)).toThrow(/Protein/);
    expect(() => plannedMealFoodEntry({ ...input, id: "not-a-uuid" }, opts)).toThrow(/id/);
    expect(() => plannedMealFoodEntry({ ...input, date: "16/10/2026" }, opts)).toThrow(/date/);
  });
  it("maps slots to food-log meals and back", () => {
    expect(slotToMeal("snack")).toBe("snacks");
    expect(slotToMeal("dinner")).toBe("dinner");
    expect(mealToSlot("snacks")).toBe("snack");
    expect(mealToSlot("breakfast")).toBe("breakfast");
    expect(defaultEatenAt("2026-10-16", "2026-10-16", "lunch", new Date("2026-10-16T17:00:00Z"))).toBe("2026-10-16T17:00:00.000Z");
  });

  it("stamps another day's meal at his own time when the day schedule is given", () => {
    const schedule = { meals: { breakfast: "06:50", lunch: "11:45", dinner: "19:15", snacks: ["10:00", "16:20", "21:00"] as [string, string, string] } };
    const at = (meal: "breakfast" | "lunch" | "dinner" | "snacks") => new Date(defaultEatenAt("2026-10-14", "2026-10-16", meal, new Date(), schedule));
    expect([at("breakfast").getHours(), at("breakfast").getMinutes()]).toEqual([6, 50]);
    expect([at("dinner").getHours(), at("dinner").getMinutes()]).toEqual([19, 15]);
    expect([at("snacks").getHours(), at("snacks").getMinutes()]).toEqual([16, 20]);
    // today is still "now"; a broken time falls back to the usual hours
    expect(defaultEatenAt("2026-10-16", "2026-10-16", "lunch", new Date("2026-10-16T17:00:00Z"), schedule)).toBe("2026-10-16T17:00:00.000Z");
    const broken = new Date(defaultEatenAt("2026-10-14", "2026-10-16", "lunch", new Date(), { meals: { ...schedule.meals, lunch: "25:99" } }));
    expect([broken.getHours(), broken.getMinutes()]).toEqual([12, 30]);
    // and the planner's log row uses it
    const row = plannedMealFoodEntry(
      { id: "8f6b1d2c-3a4e-4f5a-9b6c-7d8e9f0a1b2c", recipe: { name: "Oats" }, servings: 1, date: "2026-10-14", meal: "breakfast", macros: { kcal: 400, protein: 30, carbs: 50, fat: 8 } },
      { todayDate: "2026-10-16", schedule },
    );
    expect(new Date(row.eaten_at!).getHours()).toBe(6);
  });
});
