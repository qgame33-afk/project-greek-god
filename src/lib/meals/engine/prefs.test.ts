import { describe, expect, it } from "vitest";
import { getLibraryRecipe } from "../library";
import { recipeFeatures } from "../recipe";
import type { FeedbackEvent, FeedbackReason, FeedbackRow } from "../types";
import { ATE_RECENTLY_DAYS, decay, featureLabel, featureShort, learnPrefs, likedRecipesWith, summarizeLearning, THUMBS_DOWN_DAYS } from "./prefs";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function row(key: string, event: FeedbackEvent, opts: { reason?: FeedbackReason; ingredient?: string; days?: number; features?: string[] } = {}): FeedbackRow {
  const r = getLibraryRecipe(key);
  return {
    recipe_key: key,
    event,
    reason: opts.reason ?? null,
    ingredient: opts.ingredient ?? null,
    features: opts.features ?? (r ? recipeFeatures(r) : []),
    created_at: daysAgo(opts.days ?? 0),
  };
}

describe("decay", () => {
  it("halves every 60 days and treats the future as now", () => {
    expect(decay(daysAgo(0), NOW)).toBeCloseTo(1, 6);
    expect(decay(daysAgo(60), NOW)).toBeCloseTo(0.5, 6);
    expect(decay(daysAgo(120), NOW)).toBeCloseTo(0.25, 6);
    expect(decay(new Date(NOW + 86_400_000).toISOString(), NOW)).toBe(1);
    expect(decay("not a date", NOW)).toBe(0);
  });
});

describe("learnPrefs: weights per docs/MEALS.md §4", () => {
  it("is empty without feedback", () => {
    const m = learnPrefs([], NOW);
    expect(m.weights).toEqual({});
    expect(m.events).toBe(0);
    expect(m.simplerBias).toBe(0);
  });

  it("thumbs up adds signal / sqrt(|features|) to every feature of the snapshot", () => {
    const m = learnPrefs([row("x", "thumbs_up", { features: ["cuisine:italian", "base:pasta", "time:quick", "cost:1"] })], NOW);
    for (const f of ["cuisine:italian", "base:pasta", "time:quick", "cost:1"]) expect(m.weights[f]).toBeCloseTo(1 / 2, 6);
  });

  it("uses each event's signal and the 60-day decay", () => {
    const feats = ["base:rice"];
    const cases: [FeedbackEvent, number][] = [
      ["thumbs_up", 1],
      ["thumbs_down", -1],
      ["saved", 0.8],
      ["unsaved", -0.3],
      ["repeated", 0.7],
      ["logged", 0.6],
      ["cooked", 0.5],
      ["kept", 0.3],
      ["regenerated", -0.25],
      ["viewed", 0.05],
    ];
    for (const [event, signal] of cases) {
      expect(learnPrefs([row("x", event, { features: feats })], NOW).weights["base:rice"] ?? 0, event).toBeCloseTo(signal, 6);
      expect(learnPrefs([row("x", event, { features: feats, days: 60 })], NOW).weights["base:rice"] ?? 0, event).toBeCloseTo(signal / 2, 6);
    }
  });

  it("clamps to [-3, 3]", () => {
    const rows = Array.from({ length: 10 }, () => row("x", "thumbs_up", { features: ["base:pasta"] }));
    expect(learnPrefs(rows, NOW).weights["base:pasta"]).toBe(3);
    const neg = Array.from({ length: 10 }, () => row("x", "thumbs_down", { features: ["base:pasta"] }));
    expect(learnPrefs(neg, NOW).weights["base:pasta"]).toBe(-3);
  });

  it("'too complicated' moves only effort/time features and builds the simpler bias", () => {
    const feats = ["cuisine:italian", "base:pasta", "effort:many", "time:long", "cost:2"];
    const m = learnPrefs([row("x", "regenerated", { reason: "too_complicated", features: feats })], NOW);
    expect(m.weights["effort:many"]).toBeCloseTo(-0.8, 6);
    expect(m.weights["time:long"]).toBeCloseTo(-0.8, 6);
    expect(m.weights["cuisine:italian"]).toBeUndefined();
    expect(m.weights["base:pasta"]).toBeUndefined();
    expect(m.simplerBias).toBeCloseTo(1, 6);
    expect(m.simplerEvidence[0].recipe_key).toBe("x");
  });

  it("never pushes away from quick, few-ingredient or cheap meals (the simpler bias does the work)", () => {
    const feats = ["cuisine:american", "effort:few", "time:quick", "cost:1"];
    for (const reason of ["too_complicated", "too_long", "too_expensive"] as const) {
      const m = learnPrefs([row("x", "regenerated", { reason, features: feats })], NOW);
      expect(m.weights, reason).toEqual({});
    }
    expect(learnPrefs([row("x", "regenerated", { reason: "too_complicated", features: feats })], NOW).simplerBias).toBeCloseTo(1, 6);
  });

  it("'too long' moves time only; 'too expensive' moves cost only", () => {
    const feats = ["cuisine:italian", "effort:many", "time:long", "cost:3"];
    const long = learnPrefs([row("x", "regenerated", { reason: "too_long", features: feats })], NOW);
    expect(long.weights).toEqual({ "time:long": -0.8 });
    const exp = learnPrefs([row("x", "regenerated", { reason: "too_expensive", features: feats })], NOW);
    expect(exp.weights).toEqual({ "cost:3": -0.8 });
  });

  it("'don't like' is a full -1.0 on every feature and keeps the recipe out for 90 days", () => {
    const feats = ["cuisine:asian", "protein:fish", "base:rice", "time:quick"];
    const m = learnPrefs([row("lib:honey-garlic-salmon", "regenerated", { reason: "dont_like", features: feats })], NOW);
    for (const f of feats) expect(m.weights[f]).toBeCloseTo(-0.5, 6);
    expect(m.blocked["lib:honey-garlic-salmon"]?.reason).toBe("dont_like");
  });

  it("'ate recently' changes no taste weight, only a 14-day cooldown", () => {
    const m = learnPrefs([row("lib:beef-tacos", "regenerated", { reason: "ate_recently", days: 3 })], NOW);
    expect(m.weights).toEqual({});
    expect(m.blocked["lib:beef-tacos"]?.reason).toBe("ate_recently");
    const old = learnPrefs([row("lib:beef-tacos", "regenerated", { reason: "ate_recently", days: ATE_RECENTLY_DAYS + 1 })], NOW);
    expect(old.blocked["lib:beef-tacos"]).toBeUndefined();
  });

  it("'dislike ingredient' penalises that ingredient's feature only", () => {
    const m = learnPrefs([row("lib:beef-tacos", "regenerated", { reason: "dislike_ingredient", ingredient: "salsa" })], NOW);
    expect(m.weights).toEqual({ "ing:salsa": -0.8 });
  });

  it("thumbs down blocks for 90 days; a later thumbs up or favourite lifts it", () => {
    const k = "lib:spaghetti-bolognese";
    expect(learnPrefs([row(k, "thumbs_down", { days: 10 })], NOW).blocked[k]?.reason).toBe("thumbs_down");
    expect(learnPrefs([row(k, "thumbs_down", { days: THUMBS_DOWN_DAYS + 1 })], NOW).blocked[k]).toBeUndefined();
    expect(learnPrefs([row(k, "thumbs_down", { days: 10 }), row(k, "thumbs_up", { days: 2 })], NOW).blocked[k]).toBeUndefined();
    expect(learnPrefs([row(k, "thumbs_down", { days: 10 }), row(k, "saved", { days: 2 })], NOW).blocked[k]).toBeUndefined();
    // a newer thumbs down after a thumbs up blocks again
    expect(learnPrefs([row(k, "thumbs_up", { days: 10 }), row(k, "thumbs_down", { days: 2 })], NOW).blocked[k]?.reason).toBe("thumbs_down");
  });

  it("does not depend on row order and ignores unknown events", () => {
    const rows = [row("lib:beef-tacos", "thumbs_up", { days: 5 }), row("lib:spaghetti-bolognese", "logged", { days: 1 }), { ...row("x", "thumbs_up"), event: "nope" as FeedbackEvent }];
    const a = learnPrefs(rows, NOW);
    const b = learnPrefs([...rows].reverse(), NOW);
    expect(a.weights).toEqual(b.weights);
    expect(a.events).toBe(2);
  });

  it("records likes per recipe for 'You liked …' and every contribution as evidence", () => {
    const m = learnPrefs([row("lib:beef-tacos", "thumbs_up"), row("lib:double-cheeseburger", "logged"), row("lib:double-cheeseburger", "logged", { days: 3 })], NOW);
    expect(m.likeEvents["lib:double-cheeseburger"]).toEqual({ logged: 2 });
    expect(m.contributions["protein:beef"].map((c) => c.recipe_key).sort()).toEqual(["lib:beef-tacos", "lib:double-cheeseburger", "lib:double-cheeseburger"]);
    const liked = likedRecipesWith(m, "protein:beef", (k) => getLibraryRecipe(k)?.name);
    expect(liked.map((l) => l.name).sort()).toEqual(["Beef Tacos", "Double Cheeseburger"]);
  });
});

describe("labels", () => {
  it("names features in plain words", () => {
    expect(featureLabel("cuisine:italian")).toBe("Italian food");
    expect(featureLabel("protein:beef")).toBe("Beef");
    expect(featureLabel("base:pasta")).toBe("Pasta");
    expect(featureLabel("style:burger")).toBe("Burgers");
    expect(featureLabel("ing:ground-beef-lean")).toBe("Extra-lean ground beef (90/10)");
    expect(featureLabel("time:quick")).toBe("Quick meals (15 min or less)");
    expect(featureLabel("effort:many")).toBe("9 or more ingredients");
    expect(featureLabel("cost:1")).toBe("Cheaper meals ($)");
    expect(featureShort("protein:beef")).toBe("beef");
    expect(featureShort("cuisine:mexican")).toBe("Mexican food");
  });
});

describe("summarizeLearning (the 'What the planner has learned' panel)", () => {
  it("shows nothing learned without feedback", () => {
    const s = summarizeLearning(learnPrefs([], NOW));
    expect(s).toMatchObject({ liked: [], disliked: [], blocked: [], events: 0 });
    expect(s.simpler.active).toBe(false);
  });

  it("lists top liked and disliked features with the real recipes and events behind them", () => {
    const rows = [
      row("lib:spaghetti-bolognese", "thumbs_up"),
      row("lib:chicken-alfredo", "thumbs_up", { days: 1 }),
      row("lib:one-pot-cheesy-beef-pasta", "logged", { days: 2 }),
      row("lib:honey-garlic-salmon", "thumbs_down", { days: 1 }),
      row("lib:garlic-butter-shrimp-rice", "regenerated", { reason: "dont_like", days: 2 }),
      row("lib:chicken-fajitas", "regenerated", { reason: "too_complicated", days: 4 }),
    ];
    const s = summarizeLearning(learnPrefs(rows, NOW));
    const liked = s.liked.map((f) => f.feature);
    expect(liked.some((f) => f === "base:pasta" || f === "style:pasta" || f === "ing:pasta-dry")).toBe(true);
    const pasta = s.liked.find((f) => f.feature === "base:pasta" || f.feature === "ing:pasta-dry")!;
    expect(pasta.recipes.map((r) => r.name)).toEqual(expect.arrayContaining(["Easy Spaghetti Bolognese"]));
    expect(pasta.recipes[0].events[0].event).toMatch(/thumbs_up|logged/);
    expect(s.disliked.length).toBeGreaterThan(0);
    for (const f of s.disliked) expect(f.weight).toBeLessThan(0);
    expect(s.blocked.map((b) => b.recipe_key).sort()).toEqual(["lib:garlic-butter-shrimp-rice", "lib:honey-garlic-salmon"]);
    expect(s.simpler.active).toBe(true);
    expect(s.simpler.recipes[0].name).toBe("Chicken Fajitas");
    expect(s.events).toBe(6);
    // labels are not repeated
    const labels = [...s.liked, ...s.disliked].map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
