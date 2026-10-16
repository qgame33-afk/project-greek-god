import { describe, expect, it } from "vitest";
import { buildGroceryList, toGroceryInput } from "@/lib/meals/engine/grocery";
import { getLibraryRecipe } from "@/lib/meals/library";
import { cad, groceryText, groceryView, isStapleRow, rowAmount, rowBuy, rowTotals, STAPLE_LABEL, type GroceryRow } from "./model";

/** Stored rows as sync_grocery_items would keep them, from a real generated list. */
function storedFrom(meals: { recipe_key: string; servings: number }[]): GroceryRow[] {
  const list = buildGroceryList(meals, getLibraryRecipe, { pantry: ["eggs"], weeklyBudgetCad: null });
  return toGroceryInput(list.items).map((i) => ({ ...i, checked: false, removed: false, custom: false, est_cost_cad: i.est_cost_cad ?? null }));
}

const WEEK = [
  { recipe_key: "lib:spaghetti-bolognese", servings: 1 },
  { recipe_key: "lib:beef-tacos", servings: 1.5 },
  { recipe_key: "lib:protein-shake", servings: 1 },
];

describe("grocery list view", () => {
  it("groups buys by aisle and keeps staples and 'have' lines apart", () => {
    const rows = storedFrom(WEEK);
    const v = groceryView(rows);
    expect(v.groups.length).toBeGreaterThan(1);
    expect(v.groups.map((g) => g.category)).toEqual([...v.groups.map((g) => g.category)].sort((a, b) => ["meat", "dairy_eggs", "bread_grains", "fruit", "vegetables", "frozen", "pantry", "other"].indexOf(a) - ["meat", "dairy_eggs", "bread_grains", "fruit", "vegetables", "frozen", "pantry", "other"].indexOf(b)));
    // one beef line for two recipes
    expect(v.groups.flatMap((g) => g.items).filter((r) => r.key === "ground-beef-lean")).toHaveLength(1);
    // salt / oil / spices are "check you have", never buys
    expect(v.staples.length).toBeGreaterThan(0);
    for (const s of v.staples) expect(isStapleRow(s)).toBe(true);
    for (const g of v.groups) for (const r of g.items) expect(isStapleRow(r)).toBe(false);
    expect(v.toBuy).toBe(v.groups.reduce((a, g) => a + g.items.length, 0));
    expect(v.inCart).toBe(0);
  });

  it("moves 'I have this' and removed lines out of the buys, and counts the cart", () => {
    const rows = storedFrom(WEEK);
    const beef = rows.find((r) => r.key === "ground-beef-lean")!;
    const sauce = rows.find((r) => r.key === "pasta-sauce-jarred")!;
    const tortillas = rows.find((r) => r.category === "bread_grains")!;
    beef.checked = true;
    sauce.have = true;
    tortillas.removed = true;
    const v = groceryView(rows);
    const buys = v.groups.flatMap((g) => g.items);
    expect(buys).toContain(beef);
    expect(buys).not.toContain(sauce);
    expect(buys).not.toContain(tortillas);
    expect(v.have).toContain(sauce);
    expect(v.removed).toContain(tortillas);
    expect(v.inCart).toBe(1);
  });

  it("shows amounts and packs without repeating itself", () => {
    const beef = storedFrom(WEEK).find((r) => r.key === "ground-beef-lean")!;
    expect(rowAmount(beef)).toMatch(/^\d+ g$|kg$/);
    expect(rowBuy(beef)).toMatch(/454 g/);
    const custom: GroceryRow = { key: "custom:1", name: "Paper towels", category: "other", qty: null, unit: null, label: "2 rolls", est_cost_cad: null, position: 9, checked: false, have: false, removed: false, custom: true };
    expect(rowAmount(custom)).toBe("2 rolls");
    expect(rowBuy(custom)).toBeNull();
    expect(isStapleRow({ key: "salt", label: STAPLE_LABEL, custom: false })).toBe(true);
    expect(isStapleRow({ key: "custom:salt", label: STAPLE_LABEL, custom: true })).toBe(false);
  });

  it("totals only what's left to buy at the checkout", () => {
    const rows = storedFrom(WEEK);
    const all = rowTotals(rows, 100);
    expect(all.checkoutCad).toBeGreaterThan(0);
    expect(all.budgetCad).toBe(100);
    const sauce = rows.find((r) => r.key === "pasta-sauce-jarred")!;
    sauce.have = true;
    const less = rowTotals(rows, null);
    expect(less.checkoutCad).toBeCloseTo(all.checkoutCad - (sauce.est_cost_cad ?? 0), 2);
    expect(less.overBudgetCad).toBeNull();
  });

  it("copies clean text: buys by aisle, then staples; cart, 'have' and removed lines left out", () => {
    const rows = storedFrom(WEEK);
    rows.find((r) => r.key === "ground-beef-lean")!.checked = true;
    rows.find((r) => r.key === "pasta-sauce-jarred")!.have = true;
    rows.push({ key: "custom:9", name: "Paper towels", category: "other", qty: null, unit: null, label: null, est_cost_cad: null, position: 99, checked: false, have: false, removed: false, custom: true });
    const text = groceryText(rows, { title: "Groceries · week of Oct 12", totals: rowTotals(rows, null) });
    const lines = text.split("\n");
    expect(lines[0]).toBe("Groceries · week of Oct 12");
    expect(text).not.toMatch(/ground beef/i);
    expect(text).not.toMatch(/pasta sauce/i);
    expect(text).toMatch(/\n- Paper towels\n|\n- Paper towels$/);
    expect(text).toContain("CHECK YOU HAVE");
    expect(text).toMatch(/Estimated total: about \$\d/);
    expect(text).not.toMatch(/undefined|null|NaN/);
    // every bullet is "- Name" or "- Name: amount · packs" (no nested brackets)
    for (const l of lines.filter((x) => x.startsWith("- "))) expect(l).toMatch(/^- [^:]+(: [^·]+( · .+)?)?$/);
    expect(text).toMatch(/\n- 2% milk: \d+ mL · 1 × 2 L carton\n/);
  });

  it("says so when there is nothing left to buy", () => {
    const rows = storedFrom([{ recipe_key: "lib:protein-shake", servings: 1 }]).map((r) => ({ ...r, checked: true }));
    expect(groceryText(rows.filter((r) => !isStapleRow(r)), { title: "Groceries" })).toBe("Groceries\n\nNothing left to buy.");
  });

  it("formats dollars", () => {
    expect(cad(12.5)).toBe("$12.50");
    expect(cad(12)).toBe("$12");
    expect(cad(124.4)).toBe("$124");
    expect(cad(1234.6)).toBe("$1,235");
    expect(cad(-3.25)).toBe("−$3.25");
  });
});
