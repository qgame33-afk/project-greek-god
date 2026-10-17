// End-to-end learning checks over many seeded weeks, measured the way the independent
// verifier measures them: generate N weeks with and without feedback (default prefs, Super
// Easy) and count picks of recipes the user never rated. Deterministic: fixed seeds and clock.

import { describe, expect, it } from "vitest";
import { recipeFeatures } from "../recipe";
import { DEFAULT_PREFS, type FeedbackEvent, type FeedbackRow, type Recipe } from "../types";
import { buildPool, generateWeek } from "./plan";
import { learnPrefs, summarizeLearning } from "./prefs";

const pool = buildPool([]);
const byKey = new Map(pool.map((r) => [r.key, r]));
const NOW = new Date("2026-10-17T00:30:00Z");
const SEEDS = 12;

function rows(keys: string[], event: FeedbackEvent, offsetMin = 0): FeedbackRow[] {
  return keys.map((k, i) => ({
    recipe_key: k,
    event,
    reason: null,
    ingredient: null,
    features: recipeFeatures(byKey.get(k)!),
    created_at: new Date(Date.parse("2026-10-16T12:00:00Z") + (i + offsetMin) * 60_000).toISOString(),
  }));
}

interface Tally {
  /** Picks matching `pred` among recipes the user did not rate. */
  unrated: number;
  /** Picks that aren't Super Easy (the user's level). */
  harder: number;
  /** Fewest different recipes in one week. */
  minDistinct: number;
  /** Most times one recipe appears in one week. */
  maxRepeat: number;
}

function tally(feedback: FeedbackRow[], pred: (r: Recipe) => boolean, rated: string[]): Tally {
  const t: Tally = { unrated: 0, harder: 0, minDistinct: Infinity, maxRepeat: 0 };
  for (let i = 0; i < SEEDS; i++) {
    const res = generateWeek({ weekStart: "2026-10-19", goals: { kcal: 3300, protein: 185 }, prefs: DEFAULT_PREFS, pool, feedback, favourites: [], history: [], meals: [], seed: `q${i}`, now: NOW });
    const count = new Map<string, number>();
    for (const m of res.meals) {
      const r = byKey.get(m.recipe_key)!;
      count.set(r.key, (count.get(r.key) ?? 0) + 1);
      if (r.difficulty !== "super_easy") t.harder++;
      if (pred(r) && !rated.includes(r.key)) t.unrated++;
    }
    t.minDistinct = Math.min(t.minDistinct, count.size);
    t.maxRepeat = Math.max(t.maxRepeat, ...count.values());
  }
  return t;
}

const has = (re: RegExp) => (r: Recipe) => r.tags.some((t) => re.test(t));
const SEAFOOD = ["lib:tuna-melts", "lib:tuna-salad-wraps", "lib:spicy-tuna-rice-bowl", "lib:garlic-butter-shrimp-rice", "lib:honey-garlic-salmon"];
const LIKES = ["lib:spaghetti-bolognese", "lib:chicken-alfredo", "lib:one-pot-cheesy-beef-pasta", "lib:double-cheeseburger", "lib:spaghetti-meatballs"];
const first3 = (re: RegExp, superEasyOnly = false) =>
  pool
    .filter((r) => has(re)(r) && (!superEasyOnly || r.difficulty === "super_easy"))
    .slice(0, 3)
    .map((r) => r.key);

describe("learning from feedback, over many planned weeks", () => {
  it("5 seafood thumbs-down: unrated seafood falls and the plan stays Super Easy", () => {
    const sea = has(/^protein:(tuna|shrimp|salmon|fish|cod)$/);
    const before = tally([], sea, SEAFOOD);
    const after = tally(rows(SEAFOOD, "thumbs_down"), sea, SEAFOOD);
    expect(before.unrated).toBeGreaterThan(10);
    expect(after.unrated).toBeLessThanOrEqual(before.unrated * 0.5);
    expect(after.harder).toBeLessThanOrEqual(before.harder);
    expect(after.harder).toBe(0);
  }, 60_000);

  it("3 dislikes of tuna, pork, Mexican or Asian dishes lower the matching unrated recipes, never toward harder meals", () => {
    const cases: [string, RegExp, string[]][] = [
      ["tuna", /^protein:tuna$/, ["lib:tuna-melts", "lib:tuna-salad-wraps", "lib:spicy-tuna-rice-bowl"]],
      ["pork", /^protein:pork$/, first3(/^protein:pork$/)],
      ["mexican", /^cuisine:mexican$/, first3(/^cuisine:mexican$/, true)],
      ["asian", /^cuisine:asian$/, first3(/^cuisine:asian$/, true)],
    ];
    for (const [label, re, keys] of cases) {
      const before = tally([], has(re), keys);
      const after = tally(rows(keys, "thumbs_down"), has(re), keys);
      expect(after.unrated, label).toBeLessThan(before.unrated * 0.8);
      expect(after.harder, label).toBeLessThanOrEqual(before.harder);
    }
  }, 120_000);

  it("likes raise what was liked in recipes never rated, and every week stays varied", () => {
    const beefLikes = ["lib:double-cheeseburger", "lib:sloppy-joes", "lib:meatball-sub"];
    const beef = has(/^protein:beef$/);
    const before = tally([], beef, beefLikes);
    const after = tally(rows(beefLikes, "thumbs_up"), beef, beefLikes);
    expect(after.unrated).toBeGreaterThan(before.unrated * 1.2);
    expect(after.minDistinct).toBeGreaterThanOrEqual(33);
    expect(after.maxRepeat).toBe(1);
    // liked Everyday pasta dishes come back for a Super Easy cook (they asked), still varied
    const pasta = tally(rows(LIKES, "thumbs_up"), has(/^base:pasta$/), []);
    expect(pasta.unrated).toBeGreaterThan(tally([], has(/^base:pasta$/), []).unrated);
    expect(pasta.minDistinct).toBeGreaterThanOrEqual(33);
    expect(pasta.maxRepeat).toBe(1);
  }, 60_000);

  it("dislikes plus likes together: seafood still falls, and the panel never says 'less of quick meals'", () => {
    const sea = has(/^protein:(tuna|shrimp|salmon|fish|cod)$/);
    const feedback = [...rows(SEAFOOD, "thumbs_down"), ...rows(LIKES, "thumbs_up", 10)];
    const before = tally([], sea, SEAFOOD);
    const after = tally(feedback, sea, SEAFOOD);
    expect(after.unrated).toBeLessThan(before.unrated * 0.6);
    const s = summarizeLearning(learnPrefs(feedback, NOW));
    for (const f of [...s.liked, ...s.disliked]) expect(f.feature, f.label).not.toMatch(/^(time|effort|cost):/);
    expect(s.disliked.map((f) => f.feature)).toEqual(expect.arrayContaining(["group:seafood", "protein:tuna"]));
  }, 60_000);

  it("'too complicated' still steers away from harder meals the user liked", () => {
    const liked = rows(["lib:spaghetti-bolognese", "lib:chicken-alfredo"], "thumbs_up");
    const harder = (r: Recipe) => r.difficulty !== "super_easy";
    const before = tally(liked, harder, []);
    const complicated = rows(["lib:spaghetti-bolognese", "lib:chicken-alfredo"], "regenerated", 5).map((r) => ({ ...r, reason: "too_complicated" as const }));
    const after = tally([...liked, ...complicated], harder, []);
    expect(before.harder).toBeGreaterThan(0);
    expect(after.harder).toBeLessThan(before.harder);
  }, 60_000);
});
