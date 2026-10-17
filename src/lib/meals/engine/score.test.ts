import { describe, expect, it } from "vitest";
import { getLibraryRecipe, LIBRARY } from "../library";
import { recipeFeatures, recipeMacros } from "../recipe";
import { DEFAULT_PREFS, type FeedbackRow, type MealPrefs, type Recipe } from "../types";
import { candidatesFor, exclusions, hardAllowed } from "./constraints";
import { explainPick } from "./explain";
import { EMPTY_MODEL, learnPrefs } from "./prefs";
import { rngFor } from "./rng";
import { bestServings, rankCandidates, scoreRecipe, selectCandidate, slotTarget, type ScoreContext } from "./score";

const NOW = "2026-10-16T12:00:00Z";
const GOALS = { kcal: 3300, protein: 185 };
const R = (k: string) => getLibraryRecipe(k)!;

function sctx(over: Partial<ScoreContext> = {}): ScoreContext {
  return {
    slot: "dinner",
    date: "2026-10-14",
    position: 0,
    prefs: DEFAULT_PREFS,
    learned: EMPTY_MODEL,
    goals: GOALS,
    target: slotTarget("dinner", GOALS, 2),
    dayMeals: [],
    nearby: [],
    seed: "t",
    ...over,
  };
}

describe("targets and servings", () => {
  it("splits the day 25/30/30/15 with snacks shared", () => {
    expect(slotTarget("breakfast", GOALS, 2).kcal).toBeCloseTo(825);
    expect(slotTarget("lunch", GOALS, 2).kcal).toBeCloseTo(990);
    expect(slotTarget("dinner", GOALS, 2).kcal).toBeCloseTo(990);
    expect(slotTarget("snack", GOALS, 2).kcal).toBeCloseTo(247.5);
    expect(slotTarget("snack", GOALS, 3).kcal).toBeCloseTo(165);
    expect(slotTarget("dinner", GOALS, 2).protein).toBeCloseTo(55.5);
  });

  it("picks the serving step closest to the target", () => {
    const shake = R("lib:protein-shake"); // ~281 kcal
    expect(bestServings(shake, 280)).toBe(1);
    expect(bestServings(shake, 560)).toBe(2);
    expect(bestServings(shake, 140)).toBe(0.5);
    expect(bestServings(shake, 10_000)).toBe(3);
  });
});

describe("hard filters (constraints.ts)", () => {
  const ctx = { slot: "dinner" as const, date: "2026-10-14", prefs: DEFAULT_PREFS };

  it("filters slot, allergies, diets, dislikes and equipment", () => {
    expect(exclusions(R("lib:protein-shake"), ctx)).toEqual([{ kind: "slot" }]);
    const bolognese = R("lib:spaghetti-bolognese");
    expect(exclusions(bolognese, { ...ctx, prefs: { ...DEFAULT_PREFS, allergies: ["gluten"] } }).map((e) => e.kind)).toContain("conflict");
    expect(hardAllowed(bolognese, { ...DEFAULT_PREFS, diets: ["vegetarian"] })).toBe(false);
    expect(hardAllowed(bolognese, { ...DEFAULT_PREFS, dislikedIngredients: ["ground-beef-lean"] })).toBe(false);
    expect(hardAllowed(bolognese, { ...DEFAULT_PREFS, equipment: ["microwave"] })).toBe(false);
    expect(hardAllowed(bolognese, DEFAULT_PREFS)).toBe(true);
  });

  it("blocks thumbs-downed recipes and explicit exclusions", () => {
    const learned = learnPrefs([{ recipe_key: "lib:beef-tacos", event: "thumbs_down", reason: null, ingredient: null, features: [], created_at: NOW }], NOW);
    expect(exclusions(R("lib:beef-tacos"), { ...ctx, learned }).map((e) => e.kind)).toEqual(["blocked"]);
    expect(exclusions(R("lib:beef-tacos"), { ...ctx, exclude: new Set(["lib:beef-tacos"]) }).map((e) => e.kind)).toEqual(["excluded"]);
  });

  it("allows a recipe once a week, favourites with repeat_ok again 3+ days apart", () => {
    const used = [{ recipe_key: "lib:beef-tacos", local_date: "2026-10-12" }];
    expect(exclusions(R("lib:beef-tacos"), { ...ctx, weekUses: used }).map((e) => e.kind)).toEqual(["used_this_week"]);
    const favourites = new Map([["lib:beef-tacos", { recipe_key: "lib:beef-tacos", repeat_ok: true }]]);
    expect(exclusions(R("lib:beef-tacos"), { ...ctx, date: "2026-10-15", weekUses: used, favourites })).toEqual([]);
    expect(exclusions(R("lib:beef-tacos"), { ...ctx, weekUses: used, favourites }).map((e) => e.kind)).toEqual(["used_this_week"]);
    const noRepeat = new Map([["lib:beef-tacos", { recipe_key: "lib:beef-tacos", repeat_ok: false }]]);
    expect(exclusions(R("lib:beef-tacos"), { ...ctx, weekUses: used, favourites: noRepeat }).map((e) => e.kind)).toEqual(["used_this_week"]);
  });

  it("relaxes repeats and the time cap when nothing fits, never allergies", () => {
    const prefs = { ...DEFAULT_PREFS, allergies: ["gluten" as const], maxMinutes: 5 };
    const { recipes, relaxed } = candidatesFor(LIBRARY, { ...ctx, prefs });
    expect(relaxed).toBe(2);
    expect(recipes.length).toBeGreaterThan(0);
    for (const r of recipes) expect(hardAllowed(r, prefs)).toBe(true);
  });
});

describe("scoreRecipe", () => {
  it("records every term, and the parts add up to the total", () => {
    for (const r of LIBRARY.filter((x) => x.slots.includes("dinner")).slice(0, 15)) {
      const c = scoreRecipe(r, sctx());
      const sum = c.parts.reduce((s, p) => s + p.value, 0);
      expect(c.total).toBeCloseTo(sum, 2);
      expect(c.total).toBeCloseTo(c.terms.fit + c.terms.taste + c.terms.variety + c.terms.macro + c.terms.explore, 6);
      expect(c.macros).toEqual(recipeMacros(r, c.servings));
    }
  });

  it("fit: a Super Easy cook prefers Super Easy recipes; an 'I like cooking' cook doesn't mind", () => {
    const easy = R("lib:easy-chicken-fajitas");
    const hard = R("lib:chicken-fajitas");
    const fit = (r: Recipe, difficulty: MealPrefs["difficulty"]) => scoreRecipe(r, sctx({ prefs: { ...DEFAULT_PREFS, difficulty } })).parts.find((p) => p.key === "difficulty")!.value;
    expect(fit(easy, "super_easy")).toBeGreaterThan(fit(hard, "super_easy") + 0.5);
    expect(fit(hard, "super_easy")).toBeLessThan(0);
    expect(fit(hard, "everyday")).toBeGreaterThan(0);
    expect(fit(hard, "i_like_cooking")).toBeGreaterThan(0);
  });

  it("taste: learned weights and explicit likes raise the score", () => {
    const tacos = R("lib:beef-tacos");
    const base = scoreRecipe(tacos, sctx()).terms.taste;
    const rows: FeedbackRow[] = [{ recipe_key: "lib:double-cheeseburger", event: "thumbs_up", reason: null, ingredient: null, features: recipeFeatures(R("lib:double-cheeseburger")), created_at: NOW }];
    const liked = scoreRecipe(tacos, sctx({ learned: learnPrefs(rows, NOW) })).terms.taste;
    expect(liked).toBeGreaterThan(base);
    const cuisine = scoreRecipe(tacos, sctx({ prefs: { ...DEFAULT_PREFS, likedCuisines: ["mexican"] } })).terms.taste;
    expect(cuisine).toBeGreaterThan(base);
    const disliked = scoreRecipe(tacos, sctx({ prefs: { ...DEFAULT_PREFS, dislikedCuisines: ["mexican"] } })).terms.taste;
    expect(disliked).toBeLessThan(base);
  });

  it("variety: same protein the same day, the same dish within 5 days, recent repeats", () => {
    const tacos = R("lib:beef-tacos");
    const base = scoreRecipe(tacos, sctx()).terms.variety;
    expect(base).toBe(0);
    const sameDay = scoreRecipe(tacos, sctx({ dayMeals: [{ recipe: R("lib:double-cheeseburger"), servings: 1 }] }));
    expect(sameDay.parts.map((p) => p.key)).toContain("same_protein:beef");
    const dish = scoreRecipe(R("lib:chicken-quesadillas"), sctx({ nearby: [{ recipe: R("lib:bean-cheese-quesadillas"), local_date: "2026-10-12", slot: "lunch" }] }));
    expect(dish.parts.map((p) => p.key)).toContain("same_dish");
    const recent = scoreRecipe(tacos, sctx({ nearby: [{ recipe: tacos, local_date: "2026-10-08", slot: "dinner" }] }));
    expect(recent.parts.map((p) => p.key)).toContain("cooldown");
    const streak = scoreRecipe(tacos, sctx({ nearby: [{ recipe: R("lib:sloppy-joes"), local_date: "2026-10-13", slot: "dinner" }] }));
    expect(streak.parts.map((p) => p.key)).toContain("protein_streak:beef");
  });

  it("macro fit rewards landing near the slot target with protein", () => {
    const c = scoreRecipe(R("lib:spaghetti-bolognese"), sctx());
    expect(Math.abs(c.macros.kcal - 990)).toBeLessThan(0.15 * 990);
    expect(c.parts.find((p) => p.key === "kcal")!.value).toBeGreaterThan(0.2);
    const fruit = scoreRecipe(R("lib:fresh-fruit-bowl"), sctx({ slot: "snack", target: slotTarget("snack", GOALS, 2) }));
    expect(fruit.parts.find((p) => p.key === "protein")!.value).toBeLessThan(0);
  });

  it("exploration noise is seeded: same seed same score, different seed different", () => {
    const r = R("lib:beef-tacos");
    expect(scoreRecipe(r, sctx()).total).toBe(scoreRecipe(r, sctx()).total);
    const totals = new Set(["a", "b", "c", "d"].map((seed) => scoreRecipe(r, sctx({ seed })).total));
    expect(totals.size).toBeGreaterThan(1);
  });

  it("'new for you' only once the user has history", () => {
    const r = R("lib:beef-tacos");
    expect(scoreRecipe(r, sctx()).newForYou).toBe(false);
    expect(scoreRecipe(r, sctx({ hasHistory: true })).newForYou).toBe(true);
  });
});

describe("selectCandidate", () => {
  const scored = LIBRARY.filter((r) => r.slots.includes("dinner")).map((r) => scoreRecipe(r, sctx()));

  it("draws only from the top 8, with probabilities that sum to 1", () => {
    const top8 = rankCandidates(scored).slice(0, 8).map((c) => c.recipe.key);
    for (let i = 0; i < 50; i++) {
      const sel = selectCandidate(scored, rngFor("sel", i))!;
      expect(top8).toContain(sel.pick.recipe.key);
      expect(sel.top.reduce((s, t) => s + t.p, 0)).toBeCloseTo(1, 2);
    }
  });

  it("follows a softmax over the top 8 at temperature 0.6: favours the best, still varies", () => {
    const base = scored[0];
    const totals = [2, 1.7, 1.4, 1.1, 0.8, 0.5, 0.2, -0.1, -0.4, -5];
    const synthetic = totals.map((t, i) => ({ ...base, recipe: { ...base.recipe, key: `lib:x${i}` }, total: t }));
    const expected = totals.slice(0, 8).map((t) => Math.exp((t - 2) / 0.6));
    const sum = expected.reduce((a, b) => a + b, 0);
    const counts = new Map<string, number>();
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const k = selectCandidate(synthetic, rngFor("softmax", i))!.pick.recipe.key;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.has("lib:x8")).toBe(false); // 9th and 10th are never drawn
    expect(counts.has("lib:x9")).toBe(false);
    for (let i = 0; i < 8; i++) expect((counts.get(`lib:x${i}`) ?? 0) / N).toBeCloseTo(expected[i] / sum, 1);
    const sel = selectCandidate(synthetic, rngFor("p"))!;
    expect(sel.top.map((t) => t.p)).toEqual(expected.map((e) => Math.round((e / sum) * 1000) / 1000));
  });

  it("is deterministic for the same rng and empty-safe", () => {
    expect(selectCandidate(scored, rngFor("x"))!.pick.recipe.key).toBe(selectCandidate(scored, rngFor("x"))!.pick.recipe.key);
    expect(selectCandidate([], rngFor("x"))).toBeNull();
  });
});

describe("explainPick", () => {
  const nameOf = (k: string) => getLibraryRecipe(k)?.name;

  it("only gives reasons that raised the score, with real numbers", () => {
    const r = R("lib:beef-tacos");
    const c = scoreRecipe(r, sctx());
    const reasons = explainPick(c, { slot: "dinner", learned: EMPTY_MODEL, nameOf });
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.length).toBeLessThanOrEqual(4);
    for (const w of reasons) expect(w.weight).toBeGreaterThan(0);
    expect(reasons.map((x) => x.kind)).not.toContain("liked_similar");
    const diff = reasons.find((x) => x.kind === "difficulty_fit");
    expect(diff?.text).toBe("Super Easy: 15 min, 6 ingredients");
    const macro = reasons.find((x) => x.kind === "macro_fit");
    expect(macro?.text).toBe(`Fits dinner: ${c.macros.kcal.toLocaleString("en-US")} kcal, ${Math.round(c.macros.protein)} g protein`);
  });

  it("names the liked recipes that drove a feature", () => {
    const rows: FeedbackRow[] = ["lib:double-cheeseburger", "lib:sloppy-joes"].map((k) => ({ recipe_key: k, event: "thumbs_up", reason: null, ingredient: null, features: recipeFeatures(R(k)), created_at: NOW }));
    const learned = learnPrefs(rows, NOW);
    const c = scoreRecipe(R("lib:beef-tacos"), sctx({ learned }));
    const reasons = explainPick(c, { slot: "dinner", learned, nameOf });
    const liked = reasons.find((x) => x.kind === "liked_similar");
    expect(liked?.text).toMatch(/^You liked (Double Cheeseburger and Sloppy Joes|Sloppy Joes and Double Cheeseburger) \(/);
    expect(liked?.text).toContain("beef");
  });

  it("keeps two liked names apart when one has its own 'and'", () => {
    const rows: FeedbackRow[] = ["lib:double-cheeseburger", "lib:cheeseburger-oven-fries"].map((k, i) => ({ recipe_key: k, event: "thumbs_up", reason: null, ingredient: null, features: recipeFeatures(R(k)), created_at: new Date(Date.parse(NOW) - i * 86_400_000).toISOString() }));
    const learned = learnPrefs(rows, NOW);
    const c = scoreRecipe(R("lib:sloppy-joes"), sctx({ learned }));
    const liked = explainPick(c, { slot: "dinner", learned, nameOf }).find((x) => x.kind === "liked_similar");
    expect(liked?.text).toMatch(/^You liked (Double Cheeseburger, and Cheeseburger and Oven Fries|Cheeseburger and Oven Fries, and Double Cheeseburger) \(/);
  });

  it("says 'One of your favourites', liked cuisines and pantry items only when true", () => {
    const tacos = R("lib:beef-tacos");
    const favourites = new Map([[tacos.key, { recipe_key: tacos.key, repeat_ok: true }]]);
    const prefs = { ...DEFAULT_PREFS, likedCuisines: ["mexican"], pantry: ["taco-shells", "salsa"] };
    const c = scoreRecipe(tacos, sctx({ favourites, prefs }));
    const texts = explainPick(c, { slot: "dinner", learned: EMPTY_MODEL, nameOf }).map((x) => x.text);
    expect(texts).toContain("One of your favourites");
    expect(texts.join(" | ")).toMatch(/You like Mexican food|Uses what you have: (hard taco shells|salsa)/);
  });
});
