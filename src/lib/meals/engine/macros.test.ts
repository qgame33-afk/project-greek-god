// Generated days land on the profile's macro targets: kcal within about ±5%, protein at goal or
// a little over (185–200 g on 185 g), fat at or under goal (never 15% over), carbs the rest.
// Measured the way the owner reads the Food screen: each day's planned totals against the
// profile's four goals, over many seeds, for his targets and for other targets and settings.

import { describe, expect, it } from "vitest";
import { getLibraryRecipe } from "../library";
import { recipeFeatures, recipeMacros } from "../recipe";
import { DEFAULT_PREFS, type FeedbackRow, type Macros, type MealPrefs } from "../types";
import { buildPool, dayMiss, dayOnAim, dayTarget, DAY_AIM, generateWeek, regenerateMeal, type EngineMeal, type PlanContext } from "./plan";
import { slotTarget, type Goals } from "./score";

const NOW = "2026-10-16T12:00:00Z";
const WEEK = "2026-10-12";
const POOL = buildPool([]);
const byKey = new Map(POOL.map((r) => [r.key, r]));
const lookup = (k: string) => byKey.get(k);

/** Quinton's profile: 3,300 kcal, 185 g protein, 449 g carbs, 85 g fat. */
const QUINTON: Required<Goals> = { kcal: 3300, protein: 185, carbs: 449, fat: 85 };
const CUT: Required<Goals> = { kcal: 2400, protein: 150, carbs: 270, fat: 80 };
const HIGH_PROTEIN: Required<Goals> = { kcal: 2800, protein: 200, carbs: 310, fat: 85 };

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({ weekStart: WEEK, goals: QUINTON, prefs: DEFAULT_PREFS, pool: POOL, now: NOW, ...over });

const fb = (key: string, event: FeedbackRow["event"]): FeedbackRow => ({
  recipe_key: key,
  event,
  reason: null,
  ingredient: null,
  features: recipeFeatures(getLibraryRecipe(key)!),
  created_at: "2026-10-14T12:00:00Z",
});

interface Days {
  totals: Macros[];
  /** Fat from breakfast + lunch, per day. */
  midday: number[];
}

function plan(goals: Required<Goals>, seeds: number, over: Partial<PlanContext> = {}): Days {
  const out: Days = { totals: [], midday: [] };
  for (let i = 0; i < seeds; i++) {
    const w = generateWeek(ctx({ goals, seed: `macro-${i}`, ...over }));
    for (const d of w.days) {
      out.totals.push(d.planned);
      const mid = w.meals.filter((m) => m.local_date === d.date && (m.slot === "breakfast" || m.slot === "lunch"));
      out.midday.push(mid.reduce((s, m) => s + recipeMacros(lookup(m.recipe_key)!, m.servings).fat, 0));
    }
  }
  return out;
}

const share = (xs: readonly number[], ok: (x: number) => boolean) => xs.filter(ok).length / xs.length;
const median = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** The bounds every well-served profile meets: the goal of this work, as numbers. */
function expectOnTarget(days: Days, g: Required<Goals>, label: string, slack = { kcal: 0.95, protein: 0.85, fat: 0.97 }) {
  const k = days.totals.map((t) => t.kcal / g.kcal);
  const p = days.totals.map((t) => t.protein / g.protein);
  const c = days.totals.map((t) => t.carbs / g.carbs);
  const f = days.totals.map((t) => t.fat / g.fat);
  // calories within about ±5%
  expect(share(k, (x) => Math.abs(x - 1) <= 0.05), `${label} kcal ±5%`).toBeGreaterThanOrEqual(slack.kcal);
  expect(Math.min(...k), `${label} lowest kcal`).toBeGreaterThan(0.88);
  expect(Math.max(...k), `${label} highest kcal`).toBeLessThan(1.1);
  // protein at goal or a little over, never far over
  expect(share(p, (x) => x >= 0.98 && x <= 1.08 + 1e-9), `${label} protein 98–108%`).toBeGreaterThanOrEqual(slack.protein);
  expect(median(p), `${label} median protein`).toBeGreaterThanOrEqual(1.0);
  expect(median(p), `${label} median protein`).toBeLessThanOrEqual(1.06);
  expect(Math.max(...p), `${label} highest protein`).toBeLessThan(1.13);
  // fat at or under goal: within 10% nearly always, never 15% over
  expect(share(f, (x) => x <= 1.1), `${label} fat ≤ 110%`).toBeGreaterThanOrEqual(slack.fat);
  expect(Math.max(...f), `${label} highest fat`).toBeLessThan(1.15);
  expect(median(f), `${label} median fat`).toBeLessThanOrEqual(1.01);
  expect(median(f), `${label} median fat`).toBeGreaterThanOrEqual(0.85);
  // carbs make up the rest
  expect(Math.abs(median(c) - 1), `${label} median carbs`).toBeLessThanOrEqual(0.08);
}

describe("dayTarget: what a meal should bring, from what the day still needs", () => {
  it("is the slot's share of every goal on an empty day", () => {
    const open = ["breakfast", "lunch", "dinner", "snack", "snack"] as const;
    const t = dayTarget(QUINTON, 2, "breakfast", { kcal: 0, protein: 0, carbs: 0, fat: 0 }, open);
    const base = slotTarget("breakfast", QUINTON, 2);
    for (const k of ["kcal", "protein", "carbs", "fat"] as const) expect(t[k]).toBeCloseTo(base[k]);
  });

  it("after a fatty breakfast, lunch gets less fat and more carbs to bring", () => {
    const fatty = recipeMacros(getLibraryRecipe("lib:sausage-eggs-hash-browns")!, 1); // ~51 g fat
    const lunch = dayTarget(QUINTON, 2, "lunch", fatty, ["lunch", "dinner", "snack", "snack"]);
    const base = slotTarget("lunch", QUINTON, 2);
    expect(lunch.fat).toBeLessThan(0.6 * base.fat);
    expect(lunch.carbs).toBeGreaterThan(base.carbs);
    // what's left of the day's fat, shared by slot: breakfast + lunch can't pass the day's goal
    expect(fatty.fat + lunch.fat).toBeLessThan(QUINTON.fat);
  });

  it("asks for the rest of the day when it is the last place open, within sane plate sizes", () => {
    const have = { kcal: 2500, protein: 150, carbs: 300, fat: 70 };
    const t = dayTarget(QUINTON, 2, "dinner", have, ["dinner"]);
    expect(t.kcal).toBeCloseTo(800);
    expect(t.protein).toBeCloseTo(35);
    expect(t.fat).toBeCloseTo(15);
    const huge = dayTarget(QUINTON, 2, "dinner", { kcal: 0, protein: 0, carbs: 0, fat: 0 }, ["dinner"]);
    expect(huge.kcal).toBeCloseTo(1.6 * 990);
    const over = dayTarget(QUINTON, 2, "snack", { kcal: 3400, protein: 200, carbs: 450, fat: 95 }, ["snack"]);
    expect(over.kcal).toBeCloseTo(0.6 * 247.5);
    expect(over.fat).toBeGreaterThan(0);
  });
});

describe("dayMiss / dayOnAim: how far a day is from its goals", () => {
  it("is zero on the goals and grows with every miss outside the aim", () => {
    expect(dayMiss(QUINTON, QUINTON)).toBe(0);
    expect(dayOnAim(QUINTON, QUINTON)).toBe(true);
    expect(dayOnAim({ ...QUINTON, protein: 199 }, QUINTON)).toBe(true);
    expect(dayOnAim({ ...QUINTON, protein: 226 }, QUINTON)).toBe(false);
    expect(dayOnAim({ ...QUINTON, fat: 88 }, QUINTON)).toBe(false);
    expect(dayOnAim({ ...QUINTON, protein: 180 }, QUINTON)).toBe(false);
    expect(dayOnAim({ ...QUINTON, kcal: 3150 }, QUINTON)).toBe(false);
    // the reported day: 226 g protein and fat well over is far off; 10% over on fat weighs more than 5% short on calories
    expect(dayMiss({ kcal: 3300, protein: 226, carbs: 340, fat: 110 }, QUINTON)).toBeGreaterThan(10);
    expect(dayMiss({ ...QUINTON, fat: 93.5 }, QUINTON)).toBeGreaterThan(dayMiss({ ...QUINTON, kcal: 3135 }, QUINTON));
    // 10 g under the goal and 10 g over the 200 g top of the band both clearly count
    for (const protein of [175, 210]) expect(dayMiss({ ...QUINTON, protein }, QUINTON), String(protein)).toBeGreaterThan(2);
    expect(dayMiss({ ...QUINTON, protein: 195 }, QUINTON)).toBe(0);
    expect(DAY_AIM.proteinMax * QUINTON.protein).toBeCloseTo(199.8);
  });
});

describe("generated days hit the profile's targets (many seeds)", () => {
  it("Quinton's targets: kcal ±5%, protein 185–200 g, fat at or under 85 g, carbs the rest", () => {
    const days = plan(QUINTON, 24);
    expectOnTarget(days, QUINTON, "quinton");
    // the reported bug: breakfast + lunch alone over the whole day's fat
    expect(days.midday.every((f) => f <= QUINTON.fat)).toBe(true);
    // and no more 226 g protein days
    expect(Math.max(...days.totals.map((t) => t.protein))).toBeLessThan(210);
  }, 60_000);

  it("other targets: a 2,400 kcal cut and a 2,800 kcal high-protein day", () => {
    expectOnTarget(plan(CUT, 12), CUT, "cut");
    expectOnTarget(plan(HIGH_PROTEIN, 12), HIGH_PROTEIN, "high protein");
  }, 60_000);

  it("other settings: one or three snacks, Everyday cooking on a tight budget, a taste for fatty food", () => {
    const prefs = (p: Partial<MealPrefs>): MealPrefs => ({ ...DEFAULT_PREFS, ...p });
    expectOnTarget(plan(QUINTON, 10, { prefs: prefs({ snacksPerDay: 1 }) }), QUINTON, "1 snack");
    expectOnTarget(plan(QUINTON, 10, { prefs: prefs({ snacksPerDay: 3 }) }), QUINTON, "3 snacks", { kcal: 0.85, protein: 0.75, fat: 0.97 });
    expectOnTarget(plan(QUINTON, 10, { prefs: prefs({ difficulty: "everyday", budget: "tight", maxMinutes: 25 }) }), QUINTON, "everyday tight");
    // liking nachos and cheeseburgers shapes the picks, never the totals
    const fans = ["lib:loaded-beef-nachos", "lib:double-cheeseburger", "lib:beef-tacos", "lib:sausage-eggs-hash-browns"].flatMap((k) => [fb(k, "thumbs_up"), fb(k, "logged")]);
    expectOnTarget(plan(QUINTON, 10, { feedback: fans }), QUINTON, "fatty favourites", { kcal: 0.9, protein: 0.8, fat: 0.97 });
  }, 120_000);

  it("goals without carbs and fat still plan a sensible split (fat 25% of kcal)", () => {
    const days = plan({ kcal: 3300, protein: 185, carbs: 0, fat: 0 }, 6, { goals: { kcal: 3300, protein: 185 } });
    const fatGoal = (3300 * 0.25) / 9;
    expect(Math.max(...days.totals.map((t) => t.fat / fatGoal))).toBeLessThan(1.15);
    expect(median(days.totals.map((t) => t.protein / 185))).toBeLessThanOrEqual(1.06);
  }, 60_000);
});

describe("balancing works around what the user fixed", () => {
  it("a locked fatty dinner stays, and the rest of that day gets leaner", () => {
    const first = generateWeek(ctx({ seed: "lock" })).meals.map((m, i) => ({ ...m, id: `m${i}` }));
    const nachos = "lib:loaded-beef-nachos"; // ~1,000 kcal and 60 g fat: 70% of the day's fat in one meal
    const meals: EngineMeal[] = first.map((m) => (m.slot === "dinner" && (m.local_date === "2026-10-13" || m.local_date === "2026-10-15") ? { ...m, recipe_key: nachos, servings: 1, locked: true } : m));
    const w = generateWeek(ctx({ seed: "lock-2", meals }));
    for (const date of ["2026-10-13", "2026-10-15"]) {
      expect(w.save.find((m) => m.local_date === date && m.slot === "dinner")!.recipe_key).toBe(nachos);
      const d = w.days.find((x) => x.date === date)!;
      // the rest of the day is lean (under 20% of its kcal from fat, against ~23% normally)
      const rest = w.meals.filter((m) => m.local_date === date).map((m) => recipeMacros(lookup(m.recipe_key)!, m.servings));
      const fat = rest.reduce((s, m) => s + m.fat, 0);
      const kcal = rest.reduce((s, m) => s + m.kcal, 0);
      expect((9 * fat) / kcal, date).toBeLessThan(0.2);
      expect(d.planned.fat / QUINTON.fat, date).toBeLessThan(1.25);
      expect(Math.abs(d.planned.kcal / QUINTON.kcal - 1), date).toBeLessThanOrEqual(0.1);
      expect(d.planned.protein / QUINTON.protein, date).toBeGreaterThanOrEqual(0.95);
    }
    // the days without a locked meal are on target as usual
    for (const d of w.days.filter((x) => x.date !== "2026-10-13" && x.date !== "2026-10-15")) expect(d.planned.fat / QUINTON.fat, d.date).toBeLessThan(1.1);
  });

  it("regenerating one meal picks for what the day still needs", () => {
    for (const seed of ["r1", "r2", "r3", "r4"]) {
      const meals = generateWeek(ctx({ seed })).meals.map((m, i) => ({ ...m, id: `m${i}` }));
      for (const slot of ["lunch", "dinner"] as const) {
        const meal = meals.find((m) => m.local_date === "2026-10-14" && m.slot === slot)!;
        const res = regenerateMeal(ctx({ seed, meals }), meal);
        if (!res.ok) throw new Error(res.message);
        const day = meals.filter((m) => m.local_date === "2026-10-14").map((m) => (m.id === meal.id ? res.meal : m));
        const fat = day.reduce((s, m) => s + recipeMacros(lookup(m.recipe_key)!, m.servings).fat, 0);
        const kcal = day.reduce((s, m) => s + recipeMacros(lookup(m.recipe_key)!, m.servings).kcal, 0);
        expect(fat / QUINTON.fat, `${seed} ${slot}`).toBeLessThan(1.2);
        expect(Math.abs(kcal / QUINTON.kcal - 1), `${seed} ${slot}`).toBeLessThanOrEqual(0.15);
      }
    }
  });
});
