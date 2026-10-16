// The week's grocery list (docs/MEALS.md §5). Pure: planned meals + recipes + preferences in,
// consolidated shopper lines out. Every ingredient is summed across the week in grams (scaled
// by servings), converted to how it's sold (g, mL or pieces), rounded up to whole packs and
// grouped by aisle. Staples (salt, oil, spices, butter) are "check you have", pantry items are
// pre-marked "have", and the cost is an estimate from rough Canadian shelf prices.

import { getIngredient, gramsToPackUnits, ingredientName } from "../ingredients";
import { formatQty, lineGrams } from "../recipe";
import { GROCERY_CATEGORY_LABEL, type GroceryCategory, type MealPrefs, type Recipe } from "../types";

export const CATEGORY_ORDER: GroceryCategory[] = ["meat", "dairy_eggs", "bread_grains", "fruit", "vegetables", "frozen", "pantry", "other"];

/** A little over a pack still counts as one pack (450 g of a 454 g pack, 13 eggs ≈ 1 dozen is NOT: 4%). */
export const PACK_TOLERANCE = 0.04;

export interface GroceryUse {
  recipe_key: string;
  name: string;
  /** Grams this recipe uses across the week. */
  grams: number;
}

export interface GroceryLine {
  /** Ingredient key (custom lines use "custom:<id>" and only exist in stored lists). */
  key: string;
  name: string;
  category: GroceryCategory;
  /** What the week uses, in the unit it's sold by. */
  qty: number;
  unit: "g" | "ml" | "piece";
  /** "1.2 kg", "750 mL", "18 eggs". */
  amount: string;
  /** How to buy it: "3 × 454 g packs", "2 dozen", or "Check you have" for staples. */
  label: string;
  /** Whole packs to buy (null for staples or items without a pack size). */
  packs: number | null;
  /** Checkout estimate: whole packs × shelf price (0 for staples). CAD. */
  est_cost_cad: number;
  /** The share of those packs the week's meals actually use. CAD. */
  used_cost_cad: number;
  position: number;
  /** Already have it (from "What I already have" in preferences). */
  have: boolean;
  staple: boolean;
  uses: GroceryUse[];
}

export interface GroceryTotals {
  /** Estimated spend at the checkout for this shop: whole packs of the lines still to buy (not "have", not removed, not staples). Some packs last beyond the week. */
  checkoutCad: number;
  /** What the week's meals use, packs prorated: the number to compare with a weekly budget. */
  weekCad: number;
  budgetCad: number | null;
  /** weekCad − budget: positive when the week's food costs more than the weekly budget. */
  overBudgetCad: number | null;
  toBuy: number;
}

export interface GroceryList {
  items: GroceryLine[];
  groups: { category: GroceryCategory; label: string; items: GroceryLine[] }[];
  totals: GroceryTotals;
  /** Planned recipe keys that couldn't be found (left off the list). */
  missing: string[];
}

export interface PlannedForGrocery {
  recipe_key: string;
  servings: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** You buy whole items: ¾ of a tortilla is 1 tortilla, 2.02 eggs is 2. */
const wholePieces = (q: number) => Math.max(1, Math.ceil(q - 0.05));

/* ------------------------------------------------------------------ shopper text */

function pluralWord(w: string): string {
  if (/(ch|sh|x|s)$/i.test(w)) return `${w}es`;
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
  if (/loaf$/i.test(w)) return `${w.slice(0, -1)}ves`;
  return `${w}s`;
}

const PACK_NOUN = /\b(pack|bag|box|can|jar|tub|bottle|carton|loaf|block|pouch|bunch|ring|tin|canister|tray|container|head|bulb|tube|jug|package)\b/i;

/** "454 g pack" × 3 → "3 × 454 g packs"; "dozen" × 2 → "2 dozen"; "1 bunch" × 2 → "2 bunches". */
export function packLabel(label: string, n: number): string {
  if (n <= 1) {
    if (/^dozen$/i.test(label)) return "1 dozen";
    if (/^about\b/i.test(label) || (/^1 /.test(label) && !/^1 (?:kg|g|l|ml)\b/i.test(label))) return label;
    return /^\d/.test(label) ? `1 × ${label}` : `1 ${label}`;
  }
  if (/^dozen$/i.test(label)) return `${n} dozen`;
  const one = /^1 (?!kg\b|g\b|l\b|ml\b)(\S+)(.*)$/i.exec(label);
  if (one) return `${n} ${pluralWord(one[1])}${one[2]}`;
  const m = PACK_NOUN.exec(label);
  if (m) return `${n} × ${label.slice(0, m.index)}${pluralWord(m[1])}${label.slice(m.index + m[1].length)}`;
  return `${n} × ${label}`;
}

/** "1.2 kg", "750 mL", "18 eggs" for a line's qty in its pack unit. */
export function groceryAmount(key: string, qty: number, unit: "g" | "ml" | "piece" | string): string {
  if (unit === "g" || unit === "ml") return formatQty(qty, unit, key);
  if (unit === "piece") return formatQty(wholePieces(qty), "piece", key);
  return `${r2(qty)} ${unit}`;
}

/** One line of text for a stored or generated line: "1.2 kg · 3 × 454 g packs". */
export function groceryLineText(line: { key: string; qty: number | null; unit: string | null; label: string | null; name: string }): string {
  const amount = line.qty != null && line.unit ? groceryAmount(line.key, Number(line.qty), line.unit) : "";
  return [amount, line.label].filter(Boolean).join(" · ") || line.name;
}

/* ------------------------------------------------------------------ build */

/**
 * Consolidate a week of planned meals into a shopping list. Each ingredient is summed in grams
 * across meals (× servings) — so ground beef from bolognese and tacos is one line — then shown
 * in the unit it's sold by and rounded up to whole packs. Optional garnishes and water are left
 * off. Staples go under Pantry as "check you have"; `prefs.pantry` items start as "have".
 */
export function buildGroceryList(meals: readonly PlannedForGrocery[], lookup: (key: string) => Recipe | undefined, prefs: Pick<MealPrefs, "pantry" | "weeklyBudgetCad"> = { pantry: [], weeklyBudgetCad: null }): GroceryList {
  const grams = new Map<string, number>();
  const uses = new Map<string, Map<string, GroceryUse>>();
  const missing: string[] = [];
  for (const m of meals) {
    const recipe = lookup(m.recipe_key);
    if (!recipe) {
      if (!missing.includes(m.recipe_key)) missing.push(m.recipe_key);
      continue;
    }
    const s = Number.isFinite(m.servings) && m.servings > 0 ? m.servings : 1;
    for (const l of recipe.ingredients) {
      if (l.optional || l.key === "water") continue;
      const g = lineGrams(l);
      if (g == null || !getIngredient(l.key)) continue;
      const add = g * s;
      grams.set(l.key, (grams.get(l.key) ?? 0) + add);
      const byRecipe = uses.get(l.key) ?? new Map<string, GroceryUse>();
      const u = byRecipe.get(recipe.key) ?? { recipe_key: recipe.key, name: recipe.name, grams: 0 };
      u.grams = r2(u.grams + add);
      byRecipe.set(recipe.key, u);
      uses.set(l.key, byRecipe);
    }
  }

  const pantry = new Set(prefs.pantry ?? []);
  const lines: GroceryLine[] = [];
  for (const [key, g] of grams) {
    const e = getIngredient(key)!;
    const staple = !!e.staple;
    const sold = gramsToPackUnits(key, g) ?? { qty: g, unit: "g" as const };
    const qty = sold.unit === "piece" ? wholePieces(sold.qty) : Math.max(1, Math.round(sold.qty));
    const amount = groceryAmount(key, qty, sold.unit);
    let packs: number | null = null;
    let label: string;
    let cost = 0;
    if (staple) label = "Check you have";
    else if (e.pack && e.pack.unit === sold.unit) {
      packs = Math.max(1, Math.ceil(sold.qty / e.pack.size - PACK_TOLERANCE));
      label = packLabel(e.pack.label, packs);
      cost = r2(packs * e.pack.priceCad);
    } else label = amount;
    lines.push({
      key,
      name: ingredientName(key),
      category: staple ? "pantry" : e.category,
      qty,
      unit: sold.unit,
      amount,
      label,
      packs,
      est_cost_cad: cost,
      used_cost_cad: usedCostCad(key, qty, sold.unit),
      position: 0,
      have: pantry.has(key),
      staple,
      uses: [...(uses.get(key)?.values() ?? [])].sort((a, b) => b.grams - a.grams),
    });
  }

  const order = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));
  lines.sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || Number(a.staple) - Number(b.staple) || a.name.localeCompare(b.name));
  lines.forEach((l, i) => (l.position = i));

  const groups = CATEGORY_ORDER.map((category) => ({ category, label: GROCERY_CATEGORY_LABEL[category], items: lines.filter((l) => l.category === category) })).filter((g) => g.items.length);
  return { items: lines, groups, totals: groceryTotals(lines, prefs.weeklyBudgetCad ?? null), missing };
}

/**
 * Totals for any list state (generated lines or stored rows). The checkout estimate counts only
 * what's left to buy ("have" and removed lines cost nothing); the week's food cost (prorated
 * packs) is what's compared with the optional weekly budget, since packs bought this week
 * (a tub of whey, a bottle of oil) last longer than a week.
 */
export function groceryTotals(
  items: readonly { key?: string; qty?: number | null; unit?: string | null; est_cost_cad: number | null; used_cost_cad?: number | null; have?: boolean | null; removed?: boolean | null; staple?: boolean }[],
  budgetCad: number | null,
): GroceryTotals {
  let checkout = 0;
  let week = 0;
  let toBuy = 0;
  for (const i of items) {
    if (i.removed) continue;
    week += i.used_cost_cad != null ? Number(i.used_cost_cad) || 0 : i.key && i.qty != null && i.unit ? usedCostCad(i.key, Number(i.qty), i.unit) : 0;
    if (i.have || i.staple) continue;
    checkout += Number(i.est_cost_cad ?? 0) || 0;
    toBuy++;
  }
  const budget = budgetCad != null && budgetCad > 0 ? budgetCad : null;
  return { checkoutCad: r2(checkout), weekCad: r2(week), budgetCad: budget, overBudgetCad: budget == null ? null : r2(week - budget), toBuy };
}

/** The share of the packs a quantity uses (in the pack's unit), CAD. Staples and unknown units cost 0. */
export function usedCostCad(key: string, qty: number, unit: string): number {
  const e = getIngredient(key);
  if (!e?.pack || e.staple || e.pack.unit !== unit || !(qty > 0)) return 0;
  return r2((qty / e.pack.size) * e.pack.priceCad);
}

/** A generated line as the data layer's GroceryItemInput (sync_grocery_items). */
export function toGroceryInput(lines: readonly GroceryLine[]) {
  return lines.map((l) => ({ key: l.key, name: l.name, category: l.category, qty: l.qty, unit: l.unit, label: l.label, est_cost_cad: l.est_cost_cad, position: l.position, have: l.have }));
}

/* ------------------------------------------------------------------ merge with what the user did */

export interface GroceryStateItem {
  key: string;
  name: string;
  category: GroceryCategory | string;
  qty: number | null;
  unit: string | null;
  label: string | null;
  est_cost_cad: number | null;
  position: number;
  checked: boolean;
  have: boolean;
  removed: boolean;
  custom: boolean;
}

export interface GroceryMerge {
  items: GroceryStateItem[];
  /** New lines, lines no longer needed, and lines whose amount changed (for the "plan changed" banner). */
  added: string[];
  dropped: string[];
  changed: string[];
}

const isCustom = (i: Pick<GroceryStateItem, "key" | "custom">) => i.custom || i.key.startsWith("custom:");

/**
 * Regenerating keeps what the user did: checked / have / removed stay on lines that still
 * exist, custom lines always stay, lines the plan no longer needs go. New lines start
 * unchecked, with "have" from the pantry preference.
 */
export function mergeGroceryState(previous: readonly GroceryStateItem[], next: readonly (Omit<GroceryStateItem, "checked" | "removed" | "custom"> & { have?: boolean })[]): GroceryMerge {
  const prev = new Map(previous.filter((p) => !isCustom(p)).map((p) => [p.key, p]));
  const nextKeys = new Set(next.map((n) => n.key));
  const added: string[] = [];
  const changed: string[] = [];
  const items: GroceryStateItem[] = [];
  for (const n of next) {
    if (n.key.startsWith("custom:")) continue;
    const p = prev.get(n.key);
    if (!p) added.push(n.key);
    else if ((p.unit ?? null) !== (n.unit ?? null) || Math.abs(Number(p.qty ?? 0) - Number(n.qty ?? 0)) > 0.005 * Math.max(1, Math.abs(Number(n.qty ?? 0)))) changed.push(n.key);
    items.push({
      key: n.key,
      name: n.name,
      category: n.category,
      qty: n.qty,
      unit: n.unit,
      label: n.label,
      est_cost_cad: n.est_cost_cad,
      position: n.position,
      checked: p?.checked ?? false,
      have: p ? p.have : !!n.have,
      removed: p?.removed ?? false,
      custom: false,
    });
  }
  const dropped = [...prev.keys()].filter((k) => !nextKeys.has(k));
  const customs = previous.filter(isCustom);
  const order = new Map(CATEGORY_ORDER.map((c, i) => [c as string, i]));
  const sorted = [...items, ...customs].sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || a.position - b.position || a.name.localeCompare(b.name));
  return { items: sorted, added, dropped, changed };
}
