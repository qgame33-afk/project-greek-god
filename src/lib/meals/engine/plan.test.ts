import { describe, expect, it } from "vitest";
import { LIBRARY, getLibraryRecipe } from "../library";
import { ingredientCount, recipeConflicts, recipeFeatures, recipeMacros } from "../recipe";
import { DEFAULT_PREFS, type FeedbackEvent, type FeedbackReason, type FeedbackRow, type MealPrefs, type Recipe } from "../types";
import { buildPool, dayTotals, generateWeek, lockMeal, moveMeal, regenerateMeal, repeatMeal, setServings, undoRegenerate, type EngineMeal, type PlanContext } from "./plan";

const NOW = "2026-10-16T12:00:00Z";
const WEEK = "2026-10-12"; // a Monday
const GOALS = { kcal: 3300, protein: 185 };
const POOL = buildPool([]);
const byKey = new Map(POOL.map((r) => [r.key, r]));
const lookup = (k: string) => byKey.get(k);
const SEEDS = Array.from({ length: 12 }, (_, i) => `seed-${i}`);

function ctx(over: Partial<PlanContext> = {}): PlanContext {
  return { weekStart: WEEK, goals: GOALS, prefs: DEFAULT_PREFS, pool: POOL, now: NOW, seed: "s", ...over };
}

const withIds = (meals: EngineMeal[]) => meals.map((m, i) => ({ ...m, id: `m${i}` }));
const fb = (key: string, event: FeedbackEvent, reason: FeedbackReason | null = null, daysAgo = 1): FeedbackRow => ({
  recipe_key: key,
  event,
  reason,
  ingredient: null,
  features: recipeFeatures(getLibraryRecipe(key)!),
  created_at: new Date(Date.parse(NOW) - daysAgo * 86_400_000).toISOString(),
});
const tagged = (m: EngineMeal, re: RegExp) => lookup(m.recipe_key)!.tags.some((t) => re.test(t));

describe("generateWeek", () => {
  const week = generateWeek(ctx());

  it("plans 7 days × breakfast, lunch, dinner and snacksPerDay snacks", () => {
    expect(week.meals).toHaveLength(7 * 5);
    expect(week.kept).toEqual([]);
    for (const d of week.days) expect(d.meals).toBe(5);
    const three = generateWeek(ctx({ prefs: { ...DEFAULT_PREFS, snacksPerDay: 3 } }));
    expect(three.meals).toHaveLength(7 * 6);
    for (const m of week.meals) {
      expect(m.local_date >= WEEK && m.local_date <= "2026-10-18").toBe(true);
      expect(lookup(m.recipe_key)!.slots).toContain(m.slot);
      expect([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]).toContain(m.servings);
      expect(m.locked).toBe(false);
      expect(m.history).toEqual([]);
      expect(m.reason?.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic for a seed and varies across seeds", () => {
    expect(generateWeek(ctx())).toEqual(week);
    const other = generateWeek(ctx({ seed: "another" }));
    expect(other.meals.map((m) => m.recipe_key)).not.toEqual(week.meals.map((m) => m.recipe_key));
  });

  it("keeps every day within ±12% of the calorie goal and at ≥ 90% protein (many seeds)", () => {
    for (const seed of SEEDS) {
      const w = generateWeek(ctx({ seed }));
      for (const d of w.days) {
        expect(Math.abs(d.planned.kcal - GOALS.kcal) / GOALS.kcal, `${seed} ${d.date} ${d.planned.kcal}`).toBeLessThanOrEqual(0.12);
        expect(d.planned.protein, `${seed} ${d.date}`).toBeGreaterThanOrEqual(0.9 * GOALS.protein);
        expect(d.kcalOk && d.proteinOk).toBe(true);
      }
      // the day summaries match the meals
      const totals = dayTotals(w.meals, lookup);
      for (const d of w.days) expect(totals[d.date].kcal).toBe(d.planned.kcal);
    }
  });

  it("scales to other goals", () => {
    const small = generateWeek(ctx({ goals: { kcal: 2400, protein: 150 } }));
    for (const d of small.days) expect(Math.abs(d.planned.kcal - 2400) / 2400).toBeLessThanOrEqual(0.12);
  });

  it("never repeats a recipe within the week, and keeps variety", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const w = generateWeek(ctx({ seed }));
      const keys = w.meals.map((m) => m.recipe_key);
      expect(new Set(keys).size, seed).toBe(keys.length);
      const dinnerProteins = new Set(w.meals.filter((m) => m.slot === "dinner").flatMap((m) => lookup(m.recipe_key)!.tags.filter((t) => t.startsWith("protein:"))));
      expect(dinnerProteins.size).toBeGreaterThanOrEqual(4);
    }
  });

  it("refuses to plan without goals", () => {
    expect(() => generateWeek(ctx({ goals: { kcal: 0, protein: 0 } }))).toThrow(/goals/);
  });

  it("explains picks with reasons that are true for the pick", () => {
    for (const m of week.meals) {
      const r = lookup(m.recipe_key)!;
      for (const reason of m.reason ?? []) {
        if (reason.kind === "macro_fit") expect(reason.text).toContain(`${recipeMacros(r, m.servings).kcal.toLocaleString("en-US")} kcal`);
        if (reason.kind === "difficulty_fit") expect(reason.text).toContain(`${r.minutes} min, ${ingredientCount(r)} ingredients`);
        // nothing liked yet, nothing new-for-you without history
        expect(["liked_similar", "favourite", "new_for_you"]).not.toContain(reason.kind);
      }
    }
  });
});

describe("hard constraints are never violated (many seeds)", () => {
  const scenarios: [string, Partial<MealPrefs>][] = [
    ["gluten-free", { diets: ["gluten_free"] }],
    ["vegetarian", { diets: ["vegetarian"] }],
    ["dairy allergy, no pork", { allergies: ["dairy"], diets: ["no_pork"] }],
    ["fish + shellfish + egg allergy", { allergies: ["fish", "shellfish", "egg"] }],
    ["peanut + tree nut + sesame", { allergies: ["peanut", "tree_nut", "sesame"] }],
    ["halal, pescatarian", { diets: ["halal", "pescatarian"] }],
    ["dislikes beef, eggs, onion", { dislikedIngredients: ["ground-beef-lean", "eggs", "onion"] }],
    ["microwave + toaster only", { equipment: ["microwave", "toaster", "kettle"] }],
  ];
  for (const [name, over] of scenarios) {
    it(name, () => {
      const prefs = { ...DEFAULT_PREFS, ...over };
      for (const seed of SEEDS.slice(0, 8)) {
        const w = generateWeek(ctx({ prefs, seed }));
        for (const m of w.meals) expect(recipeConflicts(lookup(m.recipe_key)!, prefs), `${seed} ${m.recipe_key}`).toEqual([]);
        // every place is filled, or honestly reported
        expect(w.meals.length + w.warnings.filter((x) => x.startsWith("Nothing")).length).toBe(35);
      }
    });
  }

  it("blocks thumbs-downed recipes for 90 days", () => {
    const feedback = [fb("lib:double-cheeseburger", "thumbs_down"), fb("lib:beef-tacos", "thumbs_down")];
    for (const seed of SEEDS) {
      const keys = generateWeek(ctx({ feedback, seed })).meals.map((m) => m.recipe_key);
      expect(keys).not.toContain("lib:double-cheeseburger");
      expect(keys).not.toContain("lib:beef-tacos");
    }
  });

  it("respects the time cap", () => {
    const prefs = { ...DEFAULT_PREFS, difficulty: "i_like_cooking" as const, maxMinutes: 15 };
    for (const m of generateWeek(ctx({ prefs })).meals) expect(lookup(m.recipe_key)!.minutes).toBeLessThanOrEqual(15);
  });
});

describe("learning moves the plan in the right direction, variety remains", () => {
  const count = (feedback: FeedbackRow[], pred: (m: EngineMeal) => boolean) => {
    let n = 0;
    for (const seed of SEEDS) n += generateWeek(ctx({ feedback, seed })).meals.filter(pred).length;
    return n;
  };
  const pastaOrBurger = (m: EngineMeal) => (m.slot === "lunch" || m.slot === "dinner") && tagged(m, /^(base:pasta|style:burger)$/);
  const seafood = (m: EngineMeal) => tagged(m, /^protein:(fish|salmon|shrimp|tuna)$/);

  it("likes for pasta and burgers → more pasta and burgers, still varied", () => {
    const likes = ["lib:spaghetti-bolognese", "lib:chicken-alfredo", "lib:double-cheeseburger", "lib:cheeseburger-oven-fries", "lib:one-pot-cheesy-beef-pasta"].flatMap((k) => [fb(k, "thumbs_up"), fb(k, "logged", null, 3)]);
    const before = count([], pastaOrBurger);
    const after = count(likes, pastaOrBurger);
    expect(after).toBeGreaterThan(before * 1.4);
    for (const seed of SEEDS.slice(0, 4)) {
      const w = generateWeek(ctx({ feedback: likes, seed }));
      const keys = w.meals.map((m) => m.recipe_key);
      expect(new Set(keys).size).toBe(keys.length);
      // not pasta or burgers every lunch and dinner
      expect(w.meals.filter(pastaOrBurger).length).toBeLessThan(10);
    }
  });

  it("rejecting seafood → fewer seafood meals, including ones never rated", () => {
    const rejected = ["lib:tuna-melts", "lib:spicy-tuna-rice-bowl", "lib:garlic-butter-shrimp-rice", "lib:honey-garlic-salmon"];
    const feedback = rejected.map((k, i) => fb(k, i % 2 ? "thumbs_down" : "regenerated", i % 2 ? null : "dont_like"));
    const before = count([], seafood);
    const after = count(feedback, seafood);
    expect(after).toBeLessThan(before * 0.7);
    const unrated = (m: EngineMeal) => seafood(m) && !rejected.includes(m.recipe_key) && tagged(m, /^protein:tuna$/);
    expect(count(feedback, unrated)).toBeLessThan(count([], unrated));
  });

  it("'too complicated' on big recipes → fewer ingredients and quicker meals", () => {
    const busy = LIBRARY.filter((r) => (r.slots.includes("dinner") || r.slots.includes("lunch")) && ingredientCount(r) >= 6).slice(0, 8);
    const feedback = busy.map((r) => fb(r.key, "regenerated", "too_complicated"));
    const prefs = { ...DEFAULT_PREFS, difficulty: "everyday" as const };
    const avg = (fbRows: FeedbackRow[]) => {
      let n = 0;
      let ing = 0;
      let min = 0;
      for (const seed of SEEDS) {
        for (const m of generateWeek(ctx({ feedback: fbRows, seed, prefs })).meals) {
          if (m.slot !== "lunch" && m.slot !== "dinner") continue;
          ing += ingredientCount(lookup(m.recipe_key)!);
          min += lookup(m.recipe_key)!.minutes;
          n++;
        }
      }
      return { ing: ing / n, min: min / n };
    };
    const before = avg([]);
    const after = avg(feedback);
    expect(after.ing).toBeLessThan(before.ing - 0.3);
    expect(after.min).toBeLessThan(before.min);
  });

  it("names the liked recipes behind a pick", () => {
    const likes = ["lib:spaghetti-bolognese", "lib:double-cheeseburger", "lib:beef-tacos"].map((k) => fb(k, "thumbs_up"));
    const reasons = SEEDS.flatMap((seed) => generateWeek(ctx({ feedback: likes, seed })).meals.flatMap((m) => m.reason ?? []));
    const liked = reasons.filter((r) => r.kind === "liked_similar");
    expect(liked.length).toBeGreaterThan(0);
    for (const r of liked) expect(r.text).toMatch(/^(You liked (Easy Spaghetti Bolognese|Double Cheeseburger|Beef Tacos)( and (Easy Spaghetti Bolognese|Double Cheeseburger|Beef Tacos))? \(.+\)|You gave this a thumbs up)$/);
    expect(liked.some((r) => r.text.startsWith("You liked "))).toBe(true);
  });
});

describe("locked meals", () => {
  it("survive regenerating the week, untouched and not duplicated", () => {
    const first = withIds(generateWeek(ctx({ seed: "one" })).meals);
    const lockedIds = new Set(["m2", "m7", "m12"]);
    const current = first.map((m) => (lockedIds.has(m.id!) ? { ...m, ...lockMeal(true) } : m));
    const next = generateWeek(ctx({ seed: "two", meals: current }));
    expect(next.kept.map((m) => m.id).sort()).toEqual([...lockedIds].sort());
    expect(next.meals).toHaveLength(35 - 3);
    const lockedPlaces = current.filter((m) => m.locked).map((m) => `${m.local_date}|${m.slot}|${m.position}`);
    for (const m of next.meals) expect(lockedPlaces).not.toContain(`${m.local_date}|${m.slot}|${m.position}`);
    const lockedKeys = current.filter((m) => m.locked).map((m) => m.recipe_key);
    for (const m of next.meals) expect(lockedKeys).not.toContain(m.recipe_key);
    // logged (fixed) meals stay too
    const fixed = generateWeek(ctx({ seed: "three", meals: current, fixedIds: ["m20"] }));
    expect(fixed.kept.map((m) => m.id)).toContain("m20");
  });

  it("regenerating the week gives every unlocked place a different recipe than it had", () => {
    for (const seed of SEEDS) {
      const current = withIds(generateWeek(ctx({ seed: `${seed}:a` })).meals);
      const next = generateWeek(ctx({ seed: `${seed}:b`, meals: current }));
      expect(next.meals).toHaveLength(35);
      for (const m of next.meals) {
        const was = current.find((c) => c.local_date === m.local_date && c.slot === m.slot && c.position === m.position)!;
        expect(m.recipe_key, `${seed} ${m.local_date} ${m.slot}`).not.toBe(was.recipe_key);
      }
    }
  });
});

describe("regenerateMeal", () => {
  const week = withIds(generateWeek(ctx({ seed: "r" })).meals);
  const dinner = week.find((m) => m.slot === "dinner" && m.local_date === "2026-10-14")!;

  it("changes that one meal only, never to the current or an already-shown recipe", () => {
    const res = regenerateMeal(ctx({ meals: week }), dinner);
    if (!res.ok) throw new Error(res.message);
    expect(res.meal.id).toBe(dinner.id);
    expect(res.meal.local_date).toBe(dinner.local_date);
    expect(res.meal.slot).toBe("dinner");
    expect(res.recipe.key).not.toBe(dinner.recipe_key);
    expect(Object.keys(res.patch).sort()).toEqual(["history", "reason", "recipe_key", "servings"]);
    expect(res.meal.history.at(-1)).toEqual({ recipe_key: dinner.recipe_key, servings: dinner.servings, reason: dinner.reason });
    expect(res.feedback).toMatchObject({ recipe_key: dinner.recipe_key, event: "regenerated", reason: null });
    expect(res.feedback.features).toEqual(recipeFeatures(lookup(dinner.recipe_key)!));
    // not a recipe already in the week
    expect(week.filter((m) => m.id !== dinner.id).map((m) => m.recipe_key)).not.toContain(res.recipe.key);
    // the day stays balanced
    const day = week.map((m) => (m.id === dinner.id ? res.meal : m)).filter((m) => m.local_date === dinner.local_date);
    const kcal = day.reduce((s, m) => s + recipeMacros(lookup(m.recipe_key)!, m.servings).kcal, 0);
    expect(Math.abs(kcal - GOALS.kcal) / GOALS.kcal).toBeLessThanOrEqual(0.15);
    // Undo brings the old pick back
    expect(undoRegenerate(res.meal)).toEqual({ recipe_key: dinner.recipe_key, servings: dinner.servings, reason: dinner.reason, history: [] });
  });

  it("steps through new recipes on repeated taps (shown list), deterministically", () => {
    let meal: EngineMeal = dinner;
    let shown: string[] = [];
    const seen = [dinner.recipe_key];
    for (let i = 0; i < 6; i++) {
      const res = regenerateMeal(ctx({ meals: week.map((m) => (m.id === meal.id ? meal : m)) }), meal, shown);
      if (!res.ok) throw new Error(res.message);
      expect(seen).not.toContain(res.recipe.key);
      seen.push(res.recipe.key);
      meal = res.meal;
      shown = res.shown;
    }
    expect(meal.history).toHaveLength(6);
    const again = regenerateMeal(ctx({ meals: week }), dinner);
    const again2 = regenerateMeal(ctx({ meals: week }), dinner);
    expect(again).toEqual(again2);
  });

  it("says so honestly when nothing else fits", () => {
    const tiny = [getLibraryRecipe("lib:spaghetti-bolognese")!, getLibraryRecipe("lib:beef-tacos")!];
    const meal: EngineMeal = { id: "x", local_date: WEEK, slot: "dinner", position: 0, recipe_key: "lib:spaghetti-bolognese", servings: 1, locked: false, reason: null, history: [] };
    const res = regenerateMeal(ctx({ pool: tiny, meals: [meal] }), meal, ["lib:beef-tacos"]);
    expect(res).toMatchObject({ ok: false, reason: "no_alternative" });
  });

  it("respects allergies when regenerating", () => {
    const prefs = { ...DEFAULT_PREFS, allergies: ["gluten" as const] };
    const res = regenerateMeal(ctx({ prefs, meals: week }), dinner);
    if (!res.ok) throw new Error(res.message);
    expect(recipeConflicts(res.recipe, prefs)).toEqual([]);
  });
});

describe("move, repeat, lock, servings", () => {
  const week = withIds(generateWeek(ctx({ seed: "mv" })).meals);
  const monDinner = week.find((m) => m.slot === "dinner" && m.local_date === WEEK)!;
  const tueDinner = week.find((m) => m.slot === "dinner" && m.local_date === "2026-10-13")!;
  const monSnack = week.find((m) => m.slot === "snack" && m.local_date === WEEK)!;

  it("moves a dinner to another day by swapping with the dinner there", () => {
    const res = moveMeal(week, monDinner.id!, { local_date: "2026-10-13" }, lookup);
    expect(res).toEqual({
      ok: true,
      patches: [
        { id: monDinner.id, patch: { local_date: "2026-10-13", slot: "dinner", position: 0 } },
        { id: tueDinner.id, patch: { local_date: WEEK, slot: "dinner", position: 0 } },
      ],
    });
  });

  it("never displaces a locked meal, stays in the week and refuses the wrong slot", () => {
    const locked = week.map((m) => (m.id === tueDinner.id ? { ...m, locked: true } : m));
    expect(moveMeal(locked, monDinner.id!, { local_date: "2026-10-13" }, lookup)).toMatchObject({ ok: false, reason: "locked" });
    expect(moveMeal(week, monDinner.id!, { local_date: "2026-10-20" }, lookup)).toMatchObject({ ok: false, reason: "other_week" });
    const breakfastOnly = week.find((m) => m.slot === "breakfast" && !lookup(m.recipe_key)!.slots.includes("dinner"))!;
    expect(moveMeal(week, breakfastOnly.id!, { local_date: WEEK, slot: "dinner" }, lookup)).toMatchObject({ ok: false, reason: "wrong_slot" });
  });

  it("appends a moved snack after that day's snacks", () => {
    const res = moveMeal(week, monSnack.id!, { local_date: "2026-10-15" }, lookup);
    expect(res).toEqual({ ok: true, patches: [{ id: monSnack.id, patch: { local_date: "2026-10-15", slot: "snack", position: 2 } }] });
  });

  it("repeats a meal: replaces the dinner there (Undo-able) and records 'repeated'", () => {
    const res = repeatMeal(week, monDinner.id!, { local_date: "2026-10-16" }, lookup);
    if (!res.ok || res.kind !== "replace") throw new Error("expected replace");
    const fri = week.find((m) => m.slot === "dinner" && m.local_date === "2026-10-16")!;
    expect(res.id).toBe(fri.id);
    expect(res.patch.recipe_key).toBe(monDinner.recipe_key);
    expect(res.patch.history?.at(-1)?.recipe_key).toBe(fri.recipe_key);
    expect(res.patch.reason?.[0]).toMatchObject({ kind: "repeat" });
    expect(res.feedback).toMatchObject({ recipe_key: monDinner.recipe_key, event: "repeated" });
    const snack = repeatMeal(week, monSnack.id!, { local_date: WEEK }, lookup);
    expect(snack).toMatchObject({ ok: true, kind: "add", meal: { local_date: WEEK, slot: "snack", position: 2, recipe_key: monSnack.recipe_key } });
  });

  it("clamps servings to ¼ steps between 0.25 and 6", () => {
    expect(setServings(1.3)).toEqual({ servings: 1.25 });
    expect(setServings(0)).toEqual({ servings: 0.25 });
    expect(setServings(99)).toEqual({ servings: 6 });
    expect(setServings(Number.NaN)).toEqual({ servings: 1 });
  });
});

describe("buildPool", () => {
  it("adds valid user recipes and skips invalid ones", () => {
    const base = getLibraryRecipe("lib:protein-shake")!;
    const good: Recipe = { ...base, key: "usr:2b0c8f9e-1111-4c1c-9a7b-1a2b3c4d5e6f", origin: "ai", name: "AI Shake", nutrition: { kcal: 1, protein: 1, carbs: 1, fat: 1 } };
    const bad: Recipe = { ...base, key: "usr:3b0c8f9e-1111-4c1c-9a7b-1a2b3c4d5e6f", origin: "ai", name: "Bad", ingredients: [{ key: "unicorn", qty: 1, unit: "g" }] };
    const pool = buildPool([good, bad]);
    expect(pool).toHaveLength(LIBRARY.length + 1);
    const added = pool.find((r) => r.key === good.key)!;
    // nutrition is recomputed, never trusted
    expect(added.nutrition).toEqual(recipeMacros(base, 1));
  });
});
