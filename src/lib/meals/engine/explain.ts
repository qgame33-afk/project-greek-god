// "Why this meal?" (docs/MEALS.md §4): human reasons built ONLY from score parts that
// actually raised this recipe's score, with the real data behind them — the liked recipes
// that drove a learned feature, the real minutes and ingredient count, the computed kcal.
// Nothing here is decorative: no part, no reason.

import { ingredientInline } from "../ingredients";
import { ingredientCount, recipeCostCad } from "../recipe";
import type { Difficulty, FeedbackEvent, Macros, Recipe, Slot, WhyReason } from "../types";
import { featureKind, featureShort, likedRecipesWith, type LearnedModel, type NameOf } from "./prefs";
import { featuresOf, type ScoredCandidate, type ScorePart } from "./score";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { super_easy: "Super Easy", everyday: "Everyday", i_like_cooking: "I Like Cooking" };
const SLOT_LABEL: Record<Slot, string> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", snack: "a snack" };
const TASTE_KINDS = new Set(["cuisine", "protein", "base", "style", "dish", "ingredient"]);
/** Reasons below this contribution are noise, not reasons. */
const MIN_WEIGHT = 0.05;
export const MAX_REASONS = 4;

const r2 = (n: number) => Math.round(n * 100) / 100;
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/** "You gave this a thumbs up" / "You've logged this 3 times" from the user's own events on this recipe. */
function ownLikeText(counts: Partial<Record<FeedbackEvent, number>> | undefined): string | null {
  if (!counts) return null;
  if (counts.thumbs_up) return "You gave this a thumbs up";
  if (counts.repeated) return `You repeated this ${times(counts.repeated)}`;
  if (counts.logged) return `You've logged this ${times(counts.logged)}`;
  if (counts.cooked) return `You've cooked this ${times(counts.cooked)}`;
  if (counts.kept) return "You kept this when it was suggested";
  return null;
}

/** What this recipe's own feedback added to its taste score (same normalisation as scoring). */
function ownContribution(recipe: Recipe, learned: LearnedModel): number {
  const feats = featuresOf(recipe);
  if (!feats.length) return 0;
  let sum = 0;
  for (const f of feats) for (const c of learned.contributions[f] ?? []) if (c.recipe_key === recipe.key) sum += c.value;
  return sum / Math.sqrt(feats.length);
}

export interface ExplainContext {
  slot: Slot;
  learned: LearnedModel;
  nameOf: NameOf;
}

/**
 * Reasons for one pick, strongest first (at most 4). `final` overrides the servings and
 * macros when day balancing changed them after scoring.
 */
export function explainPick(c: ScoredCandidate, ctx: ExplainContext, final?: { servings: number; macros: Macros }): WhyReason[] {
  const out: WhyReason[] = [];
  const recipe = c.recipe;
  const parts = c.parts;
  const get = (key: string) => parts.find((p) => p.key === key);
  const add = (kind: WhyReason["kind"], text: string, weight: number) => {
    if (weight >= MIN_WEIGHT && text) out.push({ kind, text, weight: r2(weight) });
  };

  // favourite
  const fav = get("favourite");
  if (fav && fav.value > 0) add("favourite", "One of your favourites", fav.value);

  // learned taste: name the liked recipes that drove the strongest positive features
  const learnedParts = parts
    .filter((p) => p.key.startsWith("learned:") && p.value > 0 && TASTE_KINDS.has(featureKind(String(p.data?.feature ?? ""))))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);
  let named: { names: string[]; keys: Set<string>; labels: string[]; weight: number } | null = null;
  for (const p of learnedParts) {
    const f = String(p.data!.feature);
    const liked = likedRecipesWith(ctx.learned, f, ctx.nameOf, recipe.key);
    if (!liked.length) continue;
    if (!named) {
      named = { names: liked.map((l) => l.name), keys: new Set(liked.map((l) => l.recipe_key)), labels: [featureShort(f)], weight: p.value };
    } else if (named.labels.length < 2 && liked.some((l) => named!.keys.has(l.recipe_key))) {
      named.labels.push(featureShort(f));
      named.weight += p.value;
    }
  }
  if (named) add("liked_similar", `You liked ${list(named.names)} (${named.labels.join(", ")})`, named.weight);
  const ownText = ownLikeText(ctx.learned.likeEvents[recipe.key]);
  if (ownText) add("liked_similar", ownText, ownContribution(recipe, ctx.learned));

  const likedIng = get("liked_ingredient");
  if (likedIng && likedIng.value > 0) {
    const keys = (likedIng.data?.keys as string[]) ?? [];
    add("liked_ingredient", `Has ingredients you like: ${list(keys.map((k) => ingredientInline(k)))}`, likedIng.value);
  }
  const likedC = get("liked_cuisine");
  if (likedC && likedC.value > 0) {
    const cs = (likedC.data?.cuisines as string[]) ?? [];
    add("liked_cuisine", `You like ${list(cs.map((c) => featureShort(`cuisine:${c}`)))}`, likedC.value);
  }
  const pantry = get("pantry");
  if (pantry && pantry.value > 0) {
    const keys = (pantry.data?.keys as string[]) ?? [];
    add("pantry", `Uses what you have: ${list(keys.map((k) => ingredientInline(k)))}`, pantry.value);
  }

  // fit
  const diff = get("difficulty");
  if (diff && diff.value > 0) add("difficulty_fit", `${DIFFICULTY_LABEL[recipe.difficulty]}: ${recipe.minutes} min, ${ingredientCount(recipe)} ingredients`, diff.value);
  const budget = get("budget");
  const weekly = get("weekly_budget");
  const budgetW = (budget && budget.value > 0 ? budget.value : 0) + (weekly && weekly.value > 0 ? weekly.value : 0);
  if (budgetW > 0) add("budget_fit", `Budget friendly: about $${recipeCostCad(recipe).toFixed(2)} a serving`, budgetW);

  // macros (after any day balancing)
  const kcalPart = get("kcal");
  const proteinPart = get("protein");
  const macroW = (kcalPart?.value ?? 0) + Math.max(0, proteinPart?.value ?? 0);
  if (kcalPart && kcalPart.value >= 0.2) {
    const m = final?.macros ?? c.macros;
    add("macro_fit", `Fits ${SLOT_LABEL[ctx.slot]}: ${m.kcal.toLocaleString("en-US")} kcal, ${Math.round(m.protein)} g protein`, macroW);
  }

  // exploration
  const fresh = get("new_for_you");
  if (fresh && c.newForYou) add("new_for_you", "New for you", Math.max(fresh.value, MIN_WEIGHT));

  return out.sort((a, b) => b.weight - a.weight).slice(0, MAX_REASONS);
}

/** The reason attached to a meal the user repeated on purpose. */
export function repeatReason(recipe: Pick<Recipe, "name">): WhyReason {
  return { kind: "repeat", text: `You chose to repeat ${recipe.name}`, weight: 1 };
}

/** Parts that lowered the score, for debugging and tests (never shown as reasons). */
export function penalties(c: ScoredCandidate): ScorePart[] {
  return c.parts.filter((p) => p.value < 0).sort((a, b) => a.value - b.value);
}
