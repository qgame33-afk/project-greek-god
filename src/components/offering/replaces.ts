// The Offering's natural-language log (docs/DESIGN-V2.md §3.9.1), the pure parts: which planned
// meal a sentence says it replaces ("pizza instead of the salmon"), which meal slot the food goes
// to, and the estimate card's title. No React, no I/O, so every rule here is unit-tested.

import type { Meal } from "@/lib/nutrition";

export type PlanSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface PlannedLite {
  id: string;
  slot: PlanSlot;
  name: string;
  eaten: boolean;
  /** Minutes since midnight he planned to eat it. */
  at: number;
}

const STOP = new Set(["the", "my", "a", "an", "of", "planned", "plan", "meal", "today", "todays", "today's", "and", "with", "some", "that", "this", "for", "had", "ate", "eat"]);
const SLOT_WORDS: Record<string, PlanSlot> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", supper: "dinner", snack: "snack", snacks: "snack" };

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/'s$/, "").replace(/s$/, ""))
    .filter((w) => w.length >= 3 && !STOP.has(w));

/**
 * What the sentence says it replaces: the words after "instead of", "in place of" or "rather
 * than", up to the end of that clause. Null when the sentence names no swap.
 */
export function replacedPhrase(text: string): string | null {
  const m = /\b(?:instead of|in place of|rather than|replacing)\s+(.+?)(?:[.,;!?]|\bbut\b|\band then\b|$)/i.exec(text);
  const phrase = m?.[1]?.trim();
  return phrase ? phrase : null;
}

/**
 * The planned meal the sentence replaces, matched on the meal's name ("the salmon" → "Honey-garlic
 * salmon, rice & broccoli") or its slot ("instead of dinner"). Only meals not yet eaten count;
 * ties go to the one planned soonest. Null when nothing matches — the food is then simply logged.
 */
export function findReplaced(text: string, meals: readonly PlannedLite[]): PlannedLite | null {
  const phrase = replacedPhrase(text);
  if (!phrase) return null;
  const want = words(phrase);
  if (!want.length) return null;
  const slotWanted = want.map((w) => SLOT_WORDS[w] ?? SLOT_WORDS[`${w}s`]).find(Boolean) ?? null;
  let best: { meal: PlannedLite; score: number } | null = null;
  for (const meal of meals) {
    if (meal.eaten) continue;
    const have = new Set(words(meal.name));
    let score = want.filter((w) => have.has(w)).length * 2;
    if (slotWanted && meal.slot === slotWanted) score += 1;
    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && meal.at < best.meal.at)) best = { meal, score };
  }
  return best?.meal ?? null;
}

export const slotMeal = (s: PlanSlot): Meal => (s === "snack" ? "snacks" : s);

/** "breakfast" for 07:30 … "snacks" after 20:30 — the diary's own time rule. */
export function mealAtMinute(min: number): Meal {
  const h = min / 60;
  if (h < 10.5) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 20.5) return "dinner";
  return "snacks";
}

/**
 * Which diary meal the food goes to: the replaced meal's slot, else the AI's hint from the
 * sentence ("for breakfast"), else the slot for the time of day. A slot chosen in Adjust wins.
 */
export function inferMeal(o: { chosen?: Meal | null; replaced: PlannedLite | null; hint: string | null | undefined; nowMin: number }): Meal {
  if (o.chosen) return o.chosen;
  if (o.replaced) return slotMeal(o.replaced.slot);
  if (o.hint === "breakfast" || o.hint === "lunch" || o.hint === "dinner" || o.hint === "snacks") return o.hint;
  return mealAtMinute(o.nowMin);
}

/** The estimate card's title: "Pepperoni pizza", "Eggs and bagels", "Eggs, bagels and 1 more". */
export function estimateTitle(names: readonly string[]): string {
  const n = names.map((s) => s.trim()).filter(Boolean);
  if (!n.length) return "Your meal";
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} and ${lower(n[1])}`;
  return `${n[0]}, ${lower(n[1])} and ${n.length - 2} more`;
}

function lower(s: string) {
  // keep brand-like words ("Domino's", "PB") as written
  return /^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+'s\b/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
