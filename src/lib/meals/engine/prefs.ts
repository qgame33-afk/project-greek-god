// The learned taste model (docs/MEALS.md §4). Weights are recomputed from the user's stored
// feedback rows every time: nothing is invented and nothing is stored separately, so deleting
// feedback (the "reset" in preferences) resets the model. Pure functions, no I/O.
//
//   w[f] += signal × decay(age) / sqrt(|features|)   for each feature f in the event's snapshot
//   decay = 0.5^(age days / 60), weights clamped to [−3, 3].
//
// Reasons change what is learned: "too complicated" / "too long" / "too expensive" move only the
// effort, time or cost features (not taste) — never toward harder, longer or pricier meals, so
// the easiest bucket of each is left alone — "don't like" is a full −1.0, "ate recently" only
// puts the recipe on a 14-day cooldown.

import { getLibraryRecipe } from "../library";
import { ingredientInline, ingredientName } from "../ingredients";
import type { FeedbackEvent, FeedbackReason, FeedbackRow } from "../types";

/* ------------------------------------------------------------------ constants */

/** Signal per event (docs/MEALS.md §4). "made_easier" teaches only the simpler bias. */
export const SIGNAL: Record<FeedbackEvent, number> = {
  thumbs_up: 1.0,
  thumbs_down: -1.0,
  saved: 0.8,
  unsaved: -0.3,
  repeated: 0.7,
  logged: 0.6,
  cooked: 0.5,
  kept: 0.3,
  regenerated: -0.25,
  viewed: 0.05,
  made_easier: 0,
};

export const HALF_LIFE_DAYS = 60;
export const WEIGHT_LIMIT = 3;
/** A thumbs-down (or "I don't like this") keeps the recipe out of plans this long. */
export const THUMBS_DOWN_DAYS = 90;
/** "Already ate this recently" keeps the recipe out of plans this long. */
export const ATE_RECENTLY_DAYS = 14;
/** Targeted penalty for "too complicated" / "too long" / "too expensive" on the matching features. */
export const REASON_PENALTY = 0.8;
/** Strength of a "don't like" reason, spread over all features like an event signal. */
export const DONT_LIKE_SIGNAL = -1.0;
/** The simpler bias is the decayed count of "too complicated" (plus ½ per "make this easier"), capped. */
export const SIMPLER_CAP = 3;

/** Events that count as the user liking a recipe, for naming liked recipes ("You liked Beef Tacos"). */
const LIKE_EVENTS: ReadonlySet<FeedbackEvent> = new Set(["thumbs_up", "saved", "repeated", "logged", "cooked", "kept"]);
/** Explicit feedback decides blocks: the newest of these wins (a later thumbs-up lifts a thumbs-down). */
const EXPLICIT_EVENTS: ReadonlySet<FeedbackEvent> = new Set(["thumbs_up", "thumbs_down", "saved"]);
/** Reasons that are not about taste: they replace the spread over all features. */
const NON_TASTE: ReadonlySet<FeedbackReason> = new Set(["too_complicated", "too_long", "too_expensive", "ate_recently", "dislike_ingredient"]);

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ types */

/** One event's contribution to one feature weight (the evidence behind "What the planner has learned"). */
export interface FeatureContribution {
  recipe_key: string;
  event: FeedbackEvent;
  reason: FeedbackReason | null;
  created_at: string;
  value: number;
}

export interface BlockedRecipe {
  reason: "thumbs_down" | "dont_like" | "ate_recently";
  /** When the block was set and until when it lasts (ISO timestamps). */
  since: string;
  until: string;
}

export interface LearnedModel {
  /** Clamped feature weights. Missing feature = 0. */
  weights: Readonly<Record<string, number>>;
  /** Every contribution per feature (unclamped), newest first. */
  contributions: Readonly<Record<string, FeatureContribution[]>>;
  /** 0–3: how strongly the user wants simpler meals (fewer ingredients and steps). */
  simplerBias: number;
  simplerEvidence: Omit<FeatureContribution, "value">[];
  /** Recipes that must not be suggested right now. */
  blocked: Readonly<Record<string, BlockedRecipe>>;
  /** Decayed sum of like-type signals per recipe (thumbs up, saved, logged, cooked, repeated, kept). */
  liked: Readonly<Record<string, number>>;
  /** Count of like-type events per recipe and event. */
  likeEvents: Readonly<Record<string, Partial<Record<FeedbackEvent, number>>>>;
  /** Recipes with any feedback at all (for "new for you"). */
  seen: ReadonlySet<string>;
  /** Feedback rows used. */
  events: number;
  /** The moment the model was computed for (ISO). */
  asOf: string;
}

export const EMPTY_MODEL: LearnedModel = {
  weights: {},
  contributions: {},
  simplerBias: 0,
  simplerEvidence: [],
  blocked: {},
  liked: {},
  likeEvents: {},
  seen: new Set(),
  events: 0,
  asOf: new Date(0).toISOString(),
};

/* ------------------------------------------------------------------ learning */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 0.5^(age/60 days). Future timestamps (clock skew) count as now. */
export function decay(createdAt: string, now: number): number {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return 0;
  const ageDays = Math.max(0, (now - t) / DAY_MS);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/**
 * The easiest bucket of each axis. A "too complicated / too long / too expensive" reason never
 * penalises these: pushing weight away from quick, few-ingredient or cheap meals would steer
 * toward exactly what the user is complaining about. (The simpler bias still applies.)
 */
const EASIEST = new Set(["time:quick", "effort:few", "cost:1"]);
const isTimeOrEffort = (f: string) => (f.startsWith("time:") || f.startsWith("effort:")) && !EASIEST.has(f);
const isTime = (f: string) => f.startsWith("time:") && !EASIEST.has(f);
const isCost = (f: string) => f.startsWith("cost:") && !EASIEST.has(f);

/**
 * Recompute the learned model from feedback rows (any order). Rows with an unknown event or an
 * unreadable timestamp are ignored.
 */
export function learnPrefs(rows: readonly FeedbackRow[], now: Date | string | number = new Date()): LearnedModel {
  const nowMs = typeof now === "number" ? now : typeof now === "string" ? Date.parse(now) : now.getTime();
  const raw: Record<string, number> = {};
  const contributions: Record<string, FeatureContribution[]> = {};
  const liked: Record<string, number> = {};
  const likeEvents: Record<string, Partial<Record<FeedbackEvent, number>>> = {};
  const seen = new Set<string>();
  const simplerEvidence: LearnedModel["simplerEvidence"] = [];
  let simpler = 0;
  let events = 0;

  const add = (f: string, value: number, row: FeedbackRow) => {
    if (!value) return;
    raw[f] = (raw[f] ?? 0) + value;
    (contributions[f] ??= []).push({ recipe_key: row.recipe_key, event: row.event, reason: row.reason ?? null, created_at: row.created_at, value });
  };

  // newest first, so contributions and evidence read newest → oldest
  const sorted = [...rows].filter((r) => r && r.event in SIGNAL && Number.isFinite(Date.parse(r.created_at))).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const blocked: Record<string, BlockedRecipe> = {};
  const decided = new Set<string>(); // recipes whose newest explicit thumbs/saved event was already seen

  for (const row of sorted) {
    events++;
    seen.add(row.recipe_key);
    const d = decay(row.created_at, nowMs);
    const feats = [...new Set((row.features ?? []).filter((f) => typeof f === "string" && f.length > 0))];
    const norm = feats.length ? 1 / Math.sqrt(feats.length) : 0;
    const reason = row.reason ?? null;
    const at = Date.parse(row.created_at);

    // taste spread over every feature of the snapshot
    if (!reason || !NON_TASTE.has(reason)) {
      const signal = reason === "dont_like" ? Math.min(DONT_LIKE_SIGNAL, SIGNAL[row.event]) : SIGNAL[row.event];
      for (const f of feats) add(f, signal * d * norm, row);
    }

    // targeted lessons from reasons
    if (reason === "too_complicated") {
      for (const f of feats) if (isTimeOrEffort(f)) add(f, -REASON_PENALTY * d, row);
      simpler += d;
      simplerEvidence.push({ recipe_key: row.recipe_key, event: row.event, reason, created_at: row.created_at });
    } else if (reason === "too_long") {
      for (const f of feats) if (isTime(f)) add(f, -REASON_PENALTY * d, row);
    } else if (reason === "too_expensive") {
      for (const f of feats) if (isCost(f)) add(f, -REASON_PENALTY * d, row);
    } else if (reason === "dislike_ingredient" && row.ingredient) {
      add(`ing:${row.ingredient}`, -REASON_PENALTY * d, row);
    }
    if (row.event === "made_easier") {
      simpler += 0.5 * d;
      simplerEvidence.push({ recipe_key: row.recipe_key, event: row.event, reason, created_at: row.created_at });
    }

    // likes, for naming the recipes behind a feature
    if (LIKE_EVENTS.has(row.event) && !reason) {
      liked[row.recipe_key] = (liked[row.recipe_key] ?? 0) + SIGNAL[row.event] * d;
      const counts = (likeEvents[row.recipe_key] ??= {});
      counts[row.event] = (counts[row.event] ?? 0) + 1;
    }

    // blocks: the newest explicit opinion decides (a later thumbs-up or favourite lifts a
    // thumbs-down); "ate recently" is a cooldown whatever the opinion. The longest block wins.
    const consider = (b: BlockedRecipe) => {
      const cur = blocked[row.recipe_key];
      if (!cur || b.until > cur.until) blocked[row.recipe_key] = b;
    };
    if (reason === "ate_recently") {
      const until = at + ATE_RECENTLY_DAYS * DAY_MS;
      if (until > nowMs) consider({ reason: "ate_recently", since: row.created_at, until: new Date(until).toISOString() });
    } else if (!decided.has(row.recipe_key) && (row.event === "thumbs_down" || reason === "dont_like")) {
      const until = at + THUMBS_DOWN_DAYS * DAY_MS;
      if (until > nowMs) consider({ reason: row.event === "thumbs_down" ? "thumbs_down" : "dont_like", since: row.created_at, until: new Date(until).toISOString() });
    }
    if (EXPLICIT_EVENTS.has(row.event) || reason === "dont_like") decided.add(row.recipe_key);
  }

  const weights: Record<string, number> = {};
  for (const [f, v] of Object.entries(raw)) {
    const w = clamp(v, -WEIGHT_LIMIT, WEIGHT_LIMIT);
    if (Math.abs(w) >= 1e-6) weights[f] = w;
  }

  return {
    weights,
    contributions,
    simplerBias: Math.min(SIMPLER_CAP, simpler),
    simplerEvidence,
    blocked,
    liked,
    likeEvents,
    seen,
    events,
    asOf: new Date(nowMs).toISOString(),
  };
}

/* ------------------------------------------------------------------ labels */

const CUISINE: Record<string, string> = { breakfast: "Breakfast classics", american: "American food", italian: "Italian food", mexican: "Mexican food", asian: "Asian food", mediterranean: "Mediterranean food", canadian: "Canadian classics" };
const PROTEIN: Record<string, string> = { whey: "Protein shakes and whey", dairy: "Dairy (yogurt, cheese, milk)", egg: "Eggs", peanut: "Peanut butter", beans: "Beans" };
const BASE: Record<string, string> = { tortilla: "Tortillas", potato: "Potatoes", fruit: "Fruit", noodles: "Noodles", pancakes: "Pancakes", dumplings: "Perogies and dumplings" };
const STYLE: Record<string, string> = { plate: "Classic plates", bowl: "Bowls", sandwich: "Sandwiches", wrap: "Wraps", shake: "Shakes and smoothies", burger: "Burgers", pasta: "Pasta dishes", pizza: "Pizza", tacos: "Tacos", "stir-fry": "Stir-fries", skillet: "Skillets", quesadilla: "Quesadillas", "snack-plate": "Snack plates", toast: "Toast", salad: "Salads", baked: "Baked dishes", fruit: "Fruit" };
const TIME: Record<string, string> = { quick: "Quick meals (15 min or less)", medium: "16–30 minute meals", long: "Meals over 30 minutes" };
const EFFORT: Record<string, string> = { few: "5 ingredients or fewer", some: "6–8 ingredients", many: "9 or more ingredients" };
const COST: Record<string, string> = { "1": "Cheaper meals ($)", "2": "Mid-price meals ($$)", "3": "Pricier meals ($$$)" };

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const words = (slug: string) => slug.replace(/-/g, " ");

export type FeatureKind = "cuisine" | "protein" | "base" | "style" | "dish" | "ingredient" | "time" | "effort" | "cost" | "other";

export function featureKind(f: string): FeatureKind {
  const p = f.slice(0, f.indexOf(":"));
  if (p === "ing") return "ingredient";
  return (["cuisine", "protein", "base", "style", "dish", "time", "effort", "cost"] as const).find((k) => k === p) ?? "other";
}

/** Human label for a learning feature: "cuisine:italian" → "Italian food", "ing:eggs" → "Large eggs". */
export function featureLabel(f: string): string {
  const i = f.indexOf(":");
  const v = i >= 0 ? f.slice(i + 1) : f;
  switch (featureKind(f)) {
    case "cuisine":
      return CUISINE[v] ?? `${cap(words(v))} food`;
    case "protein":
      return PROTEIN[v] ?? cap(words(v));
    case "base":
      return BASE[v] ?? cap(words(v));
    case "style":
      return STYLE[v] ?? cap(words(v));
    case "dish":
      return cap(words(v));
    case "ingredient":
      return ingredientName(v);
    case "time":
      return TIME[v] ?? cap(words(v));
    case "effort":
      return EFFORT[v] ?? cap(words(v));
    case "cost":
      return COST[v] ?? `Cost ${v}`;
    default:
      return cap(words(v));
  }
}

/**
 * The short, in-sentence form used in "Why this meal?": "You liked Beef Tacos (beef)".
 * Lowercase except proper nouns (cuisines).
 */
export function featureShort(f: string): string {
  const i = f.indexOf(":");
  const v = i >= 0 ? f.slice(i + 1) : f;
  switch (featureKind(f)) {
    case "cuisine":
      return v === "breakfast" ? "breakfast classics" : `${cap(words(v))} food`;
    case "protein":
      return v === "whey" ? "protein shakes" : v === "dairy" ? "dairy" : v === "peanut" ? "peanut butter" : v === "egg" ? "eggs" : words(v);
    case "base":
      return v === "potato" ? "potatoes" : v === "tortilla" ? "tortillas" : words(v);
    case "style":
      return (STYLE[v] ?? words(v)).toLowerCase();
    case "dish":
      return words(v);
    case "ingredient":
      return ingredientInline(v);
    default:
      return featureLabel(f).toLowerCase();
  }
}

/* ------------------------------------------------------------------ summaries */

export interface LearnedRecipeEvidence {
  recipe_key: string;
  name: string;
  /** Summed contribution of this recipe's events to the feature (same sign as the weight). */
  contribution: number;
  events: { event: FeedbackEvent; reason: FeedbackReason | null; created_at: string }[];
}

export interface LearnedFeature {
  feature: string;
  label: string;
  kind: FeatureKind;
  weight: number;
  /** The real feedback behind this weight, strongest first. */
  recipes: LearnedRecipeEvidence[];
}

export interface LearnedSummary {
  liked: LearnedFeature[];
  disliked: LearnedFeature[];
  simpler: { active: boolean; strength: number; recipes: { recipe_key: string; name: string; created_at: string; event: FeedbackEvent }[] };
  blocked: { recipe_key: string; name: string; reason: BlockedRecipe["reason"]; until: string }[];
  /** Feedback rows behind the model. 0 means nothing learned yet. */
  events: number;
}

export type NameOf = (recipeKey: string) => string | undefined;

const defaultName: NameOf = (k) => getLibraryRecipe(k)?.name;

function evidenceFor(model: LearnedModel, f: string, sign: 1 | -1, nameOf: NameOf, max: number): LearnedRecipeEvidence[] {
  const byRecipe = new Map<string, LearnedRecipeEvidence>();
  for (const c of model.contributions[f] ?? []) {
    if (Math.sign(c.value) !== sign) continue;
    const e = byRecipe.get(c.recipe_key) ?? { recipe_key: c.recipe_key, name: nameOf(c.recipe_key) ?? "A recipe you no longer have", contribution: 0, events: [] };
    e.contribution += c.value;
    e.events.push({ event: c.event, reason: c.reason, created_at: c.created_at });
    byRecipe.set(c.recipe_key, e);
  }
  return [...byRecipe.values()].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, max);
}

/**
 * What the planner has learned, for the preferences panel: the strongest liked and disliked
 * features with the recipes and events behind them. Features with near-identical labels are
 * shown once. Empty lists when there is no feedback yet.
 */
export function summarizeLearning(model: LearnedModel, opts: { nameOf?: NameOf; limit?: number; minWeight?: number; recipesPerFeature?: number } = {}): LearnedSummary {
  const nameOf = opts.nameOf ?? defaultName;
  const limit = opts.limit ?? 5;
  const minWeight = opts.minWeight ?? 0.15;
  const per = opts.recipesPerFeature ?? 3;
  const pick = (sign: 1 | -1): LearnedFeature[] => {
    const out: LearnedFeature[] = [];
    const labels = new Set<string>();
    const entries = Object.entries(model.weights)
      .filter(([, w]) => w * sign >= minWeight)
      .sort((a, b) => b[1] * sign - a[1] * sign || a[0].localeCompare(b[0]));
    for (const [feature, weight] of entries) {
      const label = featureLabel(feature);
      const norm = label.toLowerCase().replace(/[^a-z]/g, "").replace(/s$/, "");
      if (labels.has(norm)) continue;
      const recipes = evidenceFor(model, feature, sign, nameOf, per);
      if (!recipes.length) continue;
      labels.add(norm);
      out.push({ feature, label, kind: featureKind(feature), weight: Math.round(weight * 100) / 100, recipes });
      if (out.length >= limit) break;
    }
    return out;
  };
  const simplerRecipes = model.simplerEvidence.slice(0, 3).map((e) => ({ recipe_key: e.recipe_key, name: nameOf(e.recipe_key) ?? "A recipe you no longer have", created_at: e.created_at, event: e.event }));
  return {
    liked: pick(1),
    disliked: pick(-1),
    simpler: { active: model.simplerBias >= 0.4, strength: Math.round(model.simplerBias * 100) / 100, recipes: simplerRecipes },
    blocked: Object.entries(model.blocked)
      .map(([recipe_key, b]) => ({ recipe_key, name: nameOf(recipe_key) ?? "A recipe you no longer have", reason: b.reason, until: b.until }))
      .sort((a, b) => a.until.localeCompare(b.until)),
    events: model.events,
  };
}

/**
 * Recipes the user liked that share feature `f`, strongest first (names resolved), for
 * "You liked Cheeseburgers and Beef Tacos (beef)". Excludes `exceptKey`. "Kept" still teaches
 * the planner, but not swapping a suggestion away isn't saying you liked it, so it never names one.
 */
export function likedRecipesWith(model: LearnedModel, f: string, nameOf: NameOf, exceptKey?: string, max = 2): { recipe_key: string; name: string; strength: number }[] {
  const sums = new Map<string, number>();
  for (const c of model.contributions[f] ?? []) {
    if (c.value <= 0 || c.recipe_key === exceptKey || !LIKE_EVENTS.has(c.event) || c.event === "kept" || c.reason) continue;
    sums.set(c.recipe_key, (sums.get(c.recipe_key) ?? 0) + c.value);
  }
  const out: { recipe_key: string; name: string; strength: number }[] = [];
  for (const [recipe_key, strength] of [...sums.entries()].sort((a, b) => b[1] - a[1])) {
    const name = nameOf(recipe_key);
    if (!name) continue;
    out.push({ recipe_key, name, strength });
    if (out.length >= max) break;
  }
  return out;
}
