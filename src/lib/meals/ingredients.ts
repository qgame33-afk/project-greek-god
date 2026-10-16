// Ingredient database for the meal planner (docs/MEALS.md §2). Plain data, no I/O.
//
// Macros are per 100 g of the exact form a recipe measures: raw meat, dry pasta, drained
// canned beans, frozen-as-sold fries, a microwave rice pouch as sold. `source: "usda"` values
// come from USDA FoodData Central (SR Legacy / Foundation) for that form; `source: "label"` is a
// typical Canadian package label where USDA has no matching generic food (whey, jarred alfredo,
// microwave rice, breaded strips). Either way the app labels nutrition as an estimate.
//
// Pack sizes and prices are rough regular shelf prices at a normal Canadian grocery store in
// 2026 (CAD), for the grocery-list estimate only. Volumes use the Canadian metric cup (250 mL),
// tablespoon (15 mL) and teaspoon (5 mL); solids measured by volume carry their own gram weight.

import type { Allergen, GroceryCategory, IngredientInfo, IngredientKind, Unit } from "./types";

export interface IngredientEntry extends IngredientInfo {
  /** Where `per100` comes from. */
  source: "usda" | "label";
  /** Words for count units, e.g. { piece: ["egg", "eggs"] }. A `piece` noun names the item itself. */
  nouns?: Partial<Record<Unit, [string, string]>>;
  /** Name used inside a sentence ("200 g lean ground beef"). Default: name with a lowercase first letter. */
  inline?: string;
  /** Count items that can't sensibly be split when scaling (eggs, taco shells). */
  whole?: boolean;
  /** Grams of `shortcut` that replace one gram of this ingredient (raw chicken → cooked ≈ 0.75). Default 1. */
  shortcutFactor?: number;
}

type P = [kcal: number, protein: number, carbs: number, fat: number];
type Opts = Omit<IngredientEntry, "key" | "name" | "per100" | "category" | "allergens" | "kinds" | "source"> & {
  allergens?: Allergen[];
  source?: "usda" | "label";
};

function I(key: string, name: string, p: P, category: GroceryCategory, kinds: IngredientKind[], opts: Opts = {}): IngredientEntry {
  const { allergens = [], source = "usda", ...rest } = opts;
  return { key, name, per100: { kcal: p[0], protein: p[1], carbs: p[2], fat: p[3] }, category, kinds, allergens, source, ...rest };
}

const CHICKEN: IngredientKind[] = ["meat", "poultry"];
const BEEF: IngredientKind[] = ["meat", "beef"];
const PORK: IngredientKind[] = ["meat", "pork"];
const PLANT: IngredientKind[] = ["plant"];
const GRAIN: IngredientKind[] = ["plant", "grain"];
const DAIRY: IngredientKind[] = ["dairy"];

export const INGREDIENTS: IngredientEntry[] = [
  /* ------------------------------------------------------------ meat, poultry, fish */
  I("chicken-breast-raw", "Boneless skinless chicken breasts", [120, 22.5, 0, 2.6], "meat", CHICKEN, {
    inline: "boneless skinless chicken breast",
    unitGrams: { piece: 225 },
    nouns: { piece: ["chicken breast", "chicken breasts"] },
    pack: { size: 900, unit: "g", label: "900 g pack (about 4 breasts)", priceCad: 14.99 },
    shortcut: "chicken-breast-cooked",
    shortcutFactor: 0.75,
  }),
  I("chicken-thigh-raw", "Boneless skinless chicken thighs", [121, 19.7, 0, 4.1], "meat", CHICKEN, {
    unitGrams: { piece: 110 },
    nouns: { piece: ["chicken thigh", "chicken thighs"] },
    pack: { size: 700, unit: "g", label: "700 g pack (about 6 thighs)", priceCad: 10.99 },
    shortcut: "rotisserie-chicken",
    shortcutFactor: 0.72,
  }),
  I("chicken-breast-cooked", "Cooked chicken breast strips", [165, 31, 0, 3.6], "meat", CHICKEN, {
    pack: { size: 300, unit: "g", label: "300 g pack, ready to eat", priceCad: 8.99 },
  }),
  I("rotisserie-chicken", "Rotisserie chicken", [190, 28.9, 0, 7.4], "meat", CHICKEN, {
    inline: "rotisserie chicken, pulled",
    pack: { size: 600, unit: "g", label: "1 whole chicken (about 600 g meat)", priceCad: 12.99 },
  }),
  I("chicken-tenders-frozen", "Frozen breaded chicken strips", [230, 15, 15, 12], "frozen", CHICKEN, {
    source: "label",
    allergens: ["gluten", "soy"],
    unitGrams: { piece: 40 },
    nouns: { piece: ["breaded chicken strip", "breaded chicken strips"] },
    pack: { size: 800, unit: "g", label: "800 g bag", priceCad: 13.99 },
  }),
  I("ground-beef-lean", "Extra-lean ground beef (90/10)", [176, 20, 0, 10], "meat", BEEF, {
    inline: "extra-lean ground beef",
    pack: { size: 454, unit: "g", label: "454 g pack", priceCad: 7.49 },
  }),
  I("burger-patties-frozen", "Frozen beef burger patties", [254, 17.2, 0, 20], "frozen", BEEF, {
    unitGrams: { piece: 113 },
    nouns: { piece: ["beef burger patty", "beef burger patties"] },
    pack: { size: 8, unit: "piece", label: "8 patties (907 g)", priceCad: 15.99 },
  }),
  I("steak-sirloin-raw", "Top sirloin grilling steak", [160, 21.5, 0, 8], "meat", BEEF, {
    inline: "sirloin steak",
    pack: { size: 450, unit: "g", label: "450 g pack (2 steaks)", priceCad: 13.49 },
  }),
  I("pork-chop-raw", "Boneless pork loin chops", [157, 21, 0, 7.5], "meat", PORK, {
    unitGrams: { piece: 170 },
    nouns: { piece: ["boneless pork chop", "boneless pork chops"] },
    pack: { size: 680, unit: "g", label: "680 g pack (4 chops)", priceCad: 8.99 },
  }),
  I("pork-tenderloin-raw", "Pork tenderloin", [120, 21, 0, 3.5], "meat", PORK, {
    pack: { size: 500, unit: "g", label: "1 tenderloin (about 500 g)", priceCad: 7.49 },
  }),
  I("ground-turkey", "Lean ground turkey (93/7)", [150, 18.7, 0, 8.3], "meat", CHICKEN, {
    inline: "lean ground turkey",
    pack: { size: 454, unit: "g", label: "454 g pack", priceCad: 7.99 },
  }),
  I("ham-deli", "Black Forest ham, deli sliced", [110, 17, 2, 3.5], "meat", PORK, {
    inline: "Black Forest ham",
    unitGrams: { slice: 15 },
    pack: { size: 175, unit: "g", label: "175 g pack", priceCad: 4.99 },
  }),
  I("turkey-deli", "Turkey breast, deli sliced", [105, 19, 3, 1.8], "meat", CHICKEN, {
    inline: "deli turkey",
    unitGrams: { slice: 15 },
    pack: { size: 175, unit: "g", label: "175 g pack", priceCad: 5.49 },
  }),
  I("bacon-cooked", "Bacon", [541, 37, 1.4, 41.8], "meat", PORK, {
    inline: "bacon",
    unitGrams: { slice: 8, piece: 8 },
    pack: { size: 16, unit: "piece", label: "375 g pack (about 16 slices)", priceCad: 6.99 },
  }),
  I("pepperoni", "Sliced pepperoni", [504, 19.3, 1.2, 46.3], "meat", ["meat", "pork", "beef"], {
    inline: "pepperoni",
    unitGrams: { slice: 2, piece: 2 },
    pack: { size: 125, unit: "g", label: "125 g pack", priceCad: 3.99 },
  }),
  I("breakfast-sausage", "Pork breakfast sausages", [325, 18.5, 1.5, 27], "meat", PORK, {
    allergens: ["gluten"],
    unitGrams: { piece: 23 },
    nouns: { piece: ["breakfast sausage", "breakfast sausages"] },
    pack: { size: 16, unit: "piece", label: "375 g pack (16 links)", priceCad: 5.49 },
  }),
  I("kielbasa", "Smoked kielbasa sausage", [326, 14.1, 1.6, 28.7], "meat", PORK, {
    inline: "kielbasa",
    pack: { size: 375, unit: "g", label: "375 g ring", priceCad: 5.99 },
  }),
  I("peameal-bacon", "Peameal bacon", [120, 20, 2.5, 3.2], "meat", PORK, {
    source: "label",
    unitGrams: { slice: 30 },
    pack: { size: 500, unit: "g", label: "500 g, sliced", priceCad: 7.99 },
  }),
  I("frozen-meatballs", "Frozen cooked beef meatballs", [260, 14, 8, 19], "frozen", ["meat", "beef", "pork"], {
    source: "label",
    allergens: ["gluten", "dairy", "egg"],
    unitGrams: { piece: 25 },
    nouns: { piece: ["meatball", "meatballs"] },
    pack: { size: 907, unit: "g", label: "907 g bag", priceCad: 12.99 },
  }),
  I("beef-jerky", "Beef jerky", [410, 33.2, 11, 25.6], "meat", BEEF, {
    allergens: ["soy", "gluten"],
    pack: { size: 75, unit: "g", label: "75 g bag", priceCad: 6.49 },
  }),
  I("tuna-canned", "Flaked light tuna in water", [116, 25.5, 0, 0.8], "pantry", ["fish"], {
    inline: "light tuna, drained",
    allergens: ["fish"],
    unitGrams: { can: 120 },
    pack: { size: 120, unit: "g", label: "170 g can (120 g drained)", priceCad: 1.99 },
  }),
  I("salmon-raw", "Atlantic salmon fillets", [208, 20.4, 0, 13.4], "meat", ["fish"], {
    inline: "salmon fillet",
    allergens: ["fish"],
    unitGrams: { piece: 170 },
    nouns: { piece: ["salmon fillet", "salmon fillets"] },
    pack: { size: 454, unit: "g", label: "454 g bag of frozen fillets", priceCad: 13.99 },
  }),
  I("cod-raw", "Cod fillets", [82, 17.8, 0, 0.7], "frozen", ["fish"], {
    inline: "cod",
    allergens: ["fish"],
    unitGrams: { piece: 140 },
    nouns: { piece: ["cod fillet", "cod fillets"] },
    pack: { size: 454, unit: "g", label: "454 g bag of frozen fillets", priceCad: 10.99 },
  }),
  I("shrimp-cooked", "Cooked shrimp, peeled", [99, 24, 0.2, 0.3], "frozen", ["shellfish"], {
    inline: "cooked shrimp",
    allergens: ["shellfish"],
    pack: { size: 340, unit: "g", label: "340 g frozen bag", priceCad: 9.99 },
  }),

  /* ------------------------------------------------------------ eggs and dairy */
  I("eggs", "Large eggs", [143, 12.6, 0.7, 9.5], "dairy_eggs", ["egg"], {
    inline: "eggs",
    allergens: ["egg"],
    unitGrams: { piece: 50 },
    nouns: { piece: ["egg", "eggs"] },
    whole: true,
    pack: { size: 12, unit: "piece", label: "dozen", priceCad: 4.79 },
  }),
  I("egg-whites", "Liquid egg whites", [52, 10.9, 0.7, 0.2], "dairy_eggs", ["egg"], {
    allergens: ["egg"],
    density: 1.03,
    pack: { size: 500, unit: "ml", label: "500 mL carton", priceCad: 4.49 },
  }),
  I("milk-2", "2% milk", [50, 3.3, 4.8, 2], "dairy_eggs", DAIRY, {
    allergens: ["dairy"],
    density: 1.03,
    pack: { size: 2000, unit: "ml", label: "2 L carton", priceCad: 4.79 },
  }),
  I("milk-whole", "Homogenized milk (3.25%)", [61, 3.2, 4.8, 3.3], "dairy_eggs", DAIRY, {
    inline: "whole milk",
    allergens: ["dairy"],
    density: 1.03,
    pack: { size: 2000, unit: "ml", label: "2 L carton", priceCad: 5.19 },
  }),
  I("milk-lactose-free", "Lactose-free 2% milk", [50, 3.3, 4.8, 2], "dairy_eggs", DAIRY, {
    allergens: ["dairy"],
    density: 1.03,
    pack: { size: 2000, unit: "ml", label: "2 L carton", priceCad: 6.29 },
  }),
  I("chocolate-milk", "Chocolate milk (1–2%)", [76, 3.2, 11.9, 1.9], "dairy_eggs", DAIRY, {
    inline: "chocolate milk",
    allergens: ["dairy"],
    density: 1.04,
    pack: { size: 2000, unit: "ml", label: "2 L carton", priceCad: 5.49 },
  }),
  I("soy-milk", "Soy milk, original", [54, 3.3, 6.3, 1.8], "dairy_eggs", PLANT, {
    allergens: ["soy"],
    density: 1.03,
    pack: { size: 1890, unit: "ml", label: "1.89 L carton", priceCad: 4.99 },
  }),
  I("greek-yogurt-0", "Plain Greek yogurt, 0%", [59, 10.2, 3.6, 0.4], "dairy_eggs", DAIRY, {
    inline: "plain Greek yogurt (0%)",
    allergens: ["dairy"],
    unitGrams: { cup: 245, tbsp: 15 },
    pack: { size: 650, unit: "g", label: "650 g tub", priceCad: 6.49 },
  }),
  I("greek-yogurt-2", "Plain Greek yogurt, 2%", [73, 10, 3.9, 1.9], "dairy_eggs", DAIRY, {
    inline: "plain Greek yogurt (2%)",
    allergens: ["dairy"],
    unitGrams: { cup: 245, tbsp: 15 },
    pack: { size: 650, unit: "g", label: "650 g tub", priceCad: 6.49 },
  }),
  I("cottage-cheese", "Cottage cheese, 2%", [81, 10.5, 4.8, 2.3], "dairy_eggs", DAIRY, {
    inline: "cottage cheese",
    allergens: ["dairy"],
    unitGrams: { cup: 226, tbsp: 14 },
    pack: { size: 500, unit: "g", label: "500 g tub", priceCad: 4.99 },
  }),
  I("cheddar", "Cheddar cheese", [403, 24.9, 1.3, 33.1], "dairy_eggs", DAIRY, {
    inline: "cheddar",
    allergens: ["dairy"],
    unitGrams: { cup: 113, slice: 21, tbsp: 7 },
    pack: { size: 400, unit: "g", label: "400 g block or shredded bag", priceCad: 7.49 },
  }),
  I("mozzarella", "Part-skim mozzarella", [301, 24.3, 5.6, 19.8], "dairy_eggs", DAIRY, {
    inline: "mozzarella",
    allergens: ["dairy"],
    unitGrams: { cup: 112, slice: 21, piece: 21, tbsp: 7 },
    nouns: { piece: ["mozzarella string cheese", "mozzarella string cheeses"] },
    pack: { size: 320, unit: "g", label: "320 g shredded bag", priceCad: 6.99 },
  }),
  I("cheese-slices", "Processed cheese slices", [330, 18, 7, 25], "dairy_eggs", DAIRY, {
    source: "label",
    inline: "processed cheese",
    allergens: ["dairy"],
    unitGrams: { slice: 21, piece: 21 },
    pack: { size: 16, unit: "piece", label: "16 slices (340 g)", priceCad: 4.99 },
  }),
  I("cream-cheese", "Cream cheese", [342, 5.9, 4.1, 34.2], "dairy_eggs", DAIRY, {
    allergens: ["dairy"],
    unitGrams: { tbsp: 14.5 },
    pack: { size: 250, unit: "g", label: "250 g brick or tub", priceCad: 4.49 },
  }),
  I("parmesan", "Grated parmesan", [420, 28.4, 13.9, 27.8], "dairy_eggs", DAIRY, {
    inline: "grated parmesan",
    allergens: ["dairy"],
    unitGrams: { tbsp: 5, cup: 100 },
    pack: { size: 250, unit: "g", label: "250 g tub", priceCad: 6.99 },
  }),
  I("feta", "Feta cheese", [264, 14.2, 4.1, 21.3], "dairy_eggs", DAIRY, {
    inline: "feta",
    allergens: ["dairy"],
    unitGrams: { cup: 150, tbsp: 9 },
    pack: { size: 200, unit: "g", label: "200 g pack", priceCad: 5.99 },
  }),
  I("sour-cream", "Sour cream", [198, 2.4, 4.6, 19.4], "dairy_eggs", DAIRY, {
    allergens: ["dairy"],
    unitGrams: { tbsp: 12, cup: 230 },
    pack: { size: 500, unit: "ml", label: "500 mL tub", priceCad: 3.49 },
    density: 0.96,
  }),
  I("cream", "Whipping cream (35%)", [340, 2.8, 2.8, 36.1], "dairy_eggs", DAIRY, {
    inline: "whipping cream",
    allergens: ["dairy"],
    density: 0.99,
    pack: { size: 473, unit: "ml", label: "473 mL carton", priceCad: 4.99 },
    shortcut: "alfredo-sauce-jarred",
    shortcutFactor: 1.3,
  }),
  I("butter", "Butter", [717, 0.9, 0.1, 81.1], "dairy_eggs", DAIRY, {
    allergens: ["dairy"],
    unitGrams: { tbsp: 14, tsp: 4.7 },
    pack: { size: 454, unit: "g", label: "454 g block", priceCad: 6.49 },
    staple: true,
  }),
  I("whey-protein", "Whey protein powder", [387, 77.4, 9.7, 4.8], "other", DAIRY, {
    source: "label",
    allergens: ["dairy"],
    unitGrams: { scoop: 31 },
    pack: { size: 2270, unit: "g", label: "2.27 kg (5 lb) tub", priceCad: 79.99 },
  }),

  /* ------------------------------------------------------------ bread and grains */
  I("bread-white", "White sandwich bread", [266, 7.6, 50.6, 3.3], "bread_grains", GRAIN, {
    allergens: ["gluten"],
    unitGrams: { slice: 32 },
    pack: { size: 675, unit: "g", label: "675 g loaf (about 20 slices)", priceCad: 3.49 },
  }),
  I("bread-whole-wheat", "Whole-wheat bread", [252, 12.4, 42.7, 3.5], "bread_grains", GRAIN, {
    allergens: ["gluten"],
    unitGrams: { slice: 35 },
    pack: { size: 675, unit: "g", label: "675 g loaf (about 19 slices)", priceCad: 3.79 },
  }),
  I("bagel", "Plain bagels", [257, 10, 50.5, 1.6], "bread_grains", GRAIN, {
    allergens: ["gluten"],
    unitGrams: { piece: 95 },
    nouns: { piece: ["bagel", "bagels"] },
    pack: { size: 6, unit: "piece", label: "6 bagels", priceCad: 4.49 },
  }),
  I("english-muffin", "English muffins", [227, 8.9, 44.2, 1.7], "bread_grains", GRAIN, {
    allergens: ["gluten"],
    unitGrams: { piece: 57 },
    nouns: { piece: ["English muffin", "English muffins"] },
    pack: { size: 6, unit: "piece", label: "6 muffins", priceCad: 3.99 },
  }),
  I("tortilla-flour", "Flour tortillas (8 inch)", [300, 8, 49, 7.5], "bread_grains", GRAIN, {
    allergens: ["gluten"],
    unitGrams: { piece: 45 },
    nouns: { piece: ["8-inch tortilla", "8-inch tortillas"] },
    pack: { size: 10, unit: "piece", label: "10 tortillas", priceCad: 3.99 },
  }),
  I("tortilla-large", "Large flour tortillas (10 inch)", [300, 8, 49, 7.5], "bread_grains", GRAIN, {
    allergens: ["gluten"],
    unitGrams: { piece: 64 },
    nouns: { piece: ["large tortilla", "large tortillas"] },
    pack: { size: 8, unit: "piece", label: "8 large tortillas", priceCad: 4.49 },
  }),
  I("taco-shells", "Hard taco shells", [468, 7.2, 62.4, 22.6], "bread_grains", GRAIN, {
    unitGrams: { piece: 12 },
    nouns: { piece: ["taco shell", "taco shells"] },
    whole: true,
    pack: { size: 12, unit: "piece", label: "12 shells", priceCad: 3.79 },
  }),
  I("burger-buns", "Hamburger buns", [279, 9.5, 49.5, 4.3], "bread_grains", GRAIN, {
    allergens: ["gluten"],
    unitGrams: { piece: 65 },
    nouns: { piece: ["burger bun", "burger buns"] },
    pack: { size: 8, unit: "piece", label: "8 buns", priceCad: 3.99 },
  }),
  I("sub-rolls", "Sub rolls (6 inch)", [293, 9.9, 52.7, 4.3], "bread_grains", GRAIN, {
    allergens: ["gluten"],
    unitGrams: { piece: 85 },
    nouns: { piece: ["sub roll", "sub rolls"] },
    pack: { size: 6, unit: "piece", label: "6 rolls", priceCad: 3.99 },
  }),
  I("pita", "Pita bread", [275, 9.1, 55.7, 1.2], "bread_grains", GRAIN, {
    allergens: ["gluten"],
    unitGrams: { piece: 70 },
    nouns: { piece: ["pita", "pitas"] },
    pack: { size: 6, unit: "piece", label: "6 pitas", priceCad: 3.49 },
  }),
  I("pasta-dry", "Pasta (spaghetti, penne, rotini)", [371, 13, 74.7, 1.5], "bread_grains", GRAIN, {
    inline: "dry pasta",
    allergens: ["gluten"],
    pack: { size: 900, unit: "g", label: "900 g box", priceCad: 2.49 },
  }),
  I("rice-dry", "Long-grain white rice", [365, 7.1, 80, 0.7], "bread_grains", GRAIN, {
    inline: "white rice (uncooked)",
    unitGrams: { cup: 185 },
    pack: { size: 2000, unit: "g", label: "2 kg bag", priceCad: 7.49 },
    shortcut: "rice-cooked-microwave",
    shortcutFactor: 3,
  }),
  I("rice-cooked-microwave", "Microwave rice pouch", [155, 2.9, 30.5, 2.3], "bread_grains", GRAIN, {
    source: "label",
    inline: "microwave rice",
    unitGrams: { pouch: 250, cup: 160 },
    nouns: { pouch: ["pouch", "pouches"] },
    pack: { size: 250, unit: "g", label: "250 g pouch", priceCad: 3.29 },
  }),
  I("oats", "Quick or large-flake oats", [379, 13.2, 67.7, 6.5], "bread_grains", GRAIN, {
    inline: "oats",
    allergens: ["gluten"],
    unitGrams: { cup: 81, tbsp: 5 },
    pack: { size: 1000, unit: "g", label: "1 kg bag", priceCad: 4.49 },
  }),
  I("granola", "Granola", [450, 10, 66, 16], "bread_grains", GRAIN, {
    source: "label",
    allergens: ["gluten", "tree_nut"],
    unitGrams: { cup: 110, tbsp: 7 },
    pack: { size: 700, unit: "g", label: "700 g bag", priceCad: 5.99 },
  }),
  I("cereal", "Whole-grain oat cereal (O's)", [372, 11, 73, 6.5], "bread_grains", GRAIN, {
    source: "label",
    inline: "whole-grain O's cereal",
    allergens: ["gluten"],
    unitGrams: { cup: 28 },
    pack: { size: 400, unit: "g", label: "400 g box", priceCad: 5.49 },
  }),
  I("crackers", "Whole-wheat crackers", [443, 8.8, 68.6, 17.2], "bread_grains", GRAIN, {
    allergens: ["gluten"],
    unitGrams: { piece: 4 },
    nouns: { piece: ["cracker", "crackers"] },
    pack: { size: 200, unit: "g", label: "200 g box", priceCad: 3.99 },
  }),
  I("rice-cakes", "Plain rice cakes", [387, 8.2, 81.5, 2.8], "bread_grains", GRAIN, {
    unitGrams: { piece: 9 },
    nouns: { piece: ["rice cake", "rice cakes"] },
    whole: true,
    pack: { size: 185, unit: "g", label: "185 g pack (about 20)", priceCad: 3.49 },
  }),
  I("pancake-mix", "Complete pancake mix (just add water)", [368, 10.5, 70, 4.6], "bread_grains", ["plant", "grain", "dairy", "egg"], {
    inline: "complete pancake mix",
    allergens: ["gluten", "dairy", "egg"],
    unitGrams: { cup: 120, tbsp: 7.5 },
    pack: { size: 905, unit: "g", label: "905 g box", priceCad: 4.49 },
  }),
  I("instant-noodles", "Instant ramen noodles", [445, 9.5, 61, 17.5], "bread_grains", GRAIN, {
    source: "label",
    allergens: ["gluten", "soy"],
    unitGrams: { piece: 85 },
    nouns: { piece: ["pack of instant ramen", "packs of instant ramen"] },
    pack: { size: 5, unit: "piece", label: "5-pack", priceCad: 3.49 },
  }),
  I("boxed-mac-cheese", "Boxed macaroni and cheese", [360, 12.5, 68, 4.3], "bread_grains", ["plant", "grain", "dairy"], {
    source: "label",
    allergens: ["gluten", "dairy"],
    unitGrams: { piece: 225 },
    nouns: { piece: ["box of mac and cheese", "boxes of mac and cheese"] },
    pack: { size: 1, unit: "piece", label: "225 g box", priceCad: 1.79 },
  }),
  I("breadcrumbs", "Dry breadcrumbs", [395, 13.4, 72, 5.3], "bread_grains", GRAIN, {
    allergens: ["gluten"],
    unitGrams: { cup: 108, tbsp: 7 },
    pack: { size: 425, unit: "g", label: "425 g canister", priceCad: 3.49 },
  }),
  I("corn-tortillas", "Corn tortillas (6 inch)", [218, 5.7, 44.6, 2.9], "bread_grains", GRAIN, {
    unitGrams: { piece: 26 },
    nouns: { piece: ["corn tortilla", "corn tortillas"] },
    pack: { size: 12, unit: "piece", label: "12 tortillas", priceCad: 3.49 },
  }),
  I("quinoa-dry", "Quinoa", [368, 14.1, 64.2, 6.1], "bread_grains", GRAIN, {
    inline: "quinoa (uncooked)",
    unitGrams: { cup: 170 },
    pack: { size: 900, unit: "g", label: "900 g bag", priceCad: 8.99 },
  }),
  I("tortilla-chips", "Tortilla chips", [489, 7, 64, 23], "pantry", GRAIN, {
    pack: { size: 300, unit: "g", label: "300 g bag", priceCad: 3.99 },
  }),
  I("perogies-frozen", "Frozen potato and cheddar perogies", [180, 4.7, 32, 3.1], "frozen", ["plant", "grain", "dairy"], {
    source: "label",
    inline: "frozen perogies",
    allergens: ["gluten", "dairy"],
    unitGrams: { piece: 40 },
    nouns: { piece: ["perogy", "perogies"] },
    pack: { size: 907, unit: "g", label: "907 g bag", priceCad: 4.99 },
  }),

  /* ------------------------------------------------------------ fruit */
  I("banana", "Bananas", [89, 1.1, 22.8, 0.3], "fruit", PLANT, {
    unitGrams: { piece: 118 },
    nouns: { piece: ["banana", "bananas"] },
    pack: { size: 6, unit: "piece", label: "bunch of about 6", priceCad: 1.99 },
  }),
  I("apple", "Apples", [52, 0.3, 13.8, 0.2], "fruit", PLANT, {
    unitGrams: { piece: 182 },
    nouns: { piece: ["apple", "apples"] },
    pack: { size: 7, unit: "piece", label: "1.36 kg bag (about 7)", priceCad: 5.49 },
  }),
  I("orange", "Navel oranges", [47, 0.9, 11.8, 0.1], "fruit", PLANT, {
    unitGrams: { piece: 131 },
    nouns: { piece: ["orange", "oranges"] },
    pack: { size: 8, unit: "piece", label: "1.36 kg bag (about 8)", priceCad: 5.49 },
  }),
  I("strawberries", "Strawberries", [32, 0.7, 7.7, 0.3], "fruit", PLANT, {
    unitGrams: { cup: 152 },
    pack: { size: 454, unit: "g", label: "454 g clamshell", priceCad: 4.49 },
  }),
  I("grapes", "Seedless grapes", [69, 0.7, 18.1, 0.2], "fruit", PLANT, {
    inline: "grapes",
    unitGrams: { cup: 151 },
    pack: { size: 900, unit: "g", label: "about 900 g bag", priceCad: 5.99 },
  }),
  I("avocado", "Avocados", [160, 2, 8.5, 14.7], "fruit", PLANT, {
    unitGrams: { piece: 136 },
    nouns: { piece: ["avocado", "avocados"] },
    pack: { size: 4, unit: "piece", label: "bag of 4", priceCad: 4.99 },
  }),
  // Limes and lemons are used for their juice: macros are for the juice, a "piece" is one fruit's juice.
  I("lime", "Limes", [25, 0.4, 8.4, 0.1], "fruit", PLANT, {
    unitGrams: { piece: 30 },
    nouns: { piece: ["lime", "limes"] },
    pack: { size: 1, unit: "piece", label: "1 lime", priceCad: 0.5 },
  }),
  I("lemon", "Lemons", [22, 0.4, 6.9, 0.2], "fruit", PLANT, {
    unitGrams: { piece: 45 },
    nouns: { piece: ["lemon", "lemons"] },
    pack: { size: 1, unit: "piece", label: "1 lemon", priceCad: 0.79 },
  }),
  I("frozen-berries", "Frozen mixed berries", [48, 0.7, 11.5, 0.4], "frozen", PLANT, {
    unitGrams: { cup: 150 },
    pack: { size: 600, unit: "g", label: "600 g bag", priceCad: 5.99 },
  }),
  I("frozen-mango", "Frozen mango chunks", [60, 0.8, 15, 0.4], "frozen", PLANT, {
    unitGrams: { cup: 165 },
    pack: { size: 600, unit: "g", label: "600 g bag", priceCad: 5.49 },
  }),

  /* ------------------------------------------------------------ vegetables */
  I("broccoli", "Broccoli", [34, 2.8, 6.6, 0.4], "vegetables", PLANT, {
    unitGrams: { cup: 91 },
    pack: { size: 450, unit: "g", label: "1 bunch (about 450 g)", priceCad: 2.99 },
    shortcut: "frozen-broccoli",
  }),
  I("bell-pepper", "Bell peppers", [31, 1, 6, 0.3], "vegetables", PLANT, {
    unitGrams: { piece: 120, cup: 150 },
    nouns: { piece: ["bell pepper", "bell peppers"] },
    pack: { size: 3, unit: "piece", label: "3-pack", priceCad: 4.49 },
    shortcut: "frozen-peppers-onions",
  }),
  I("onion", "Yellow onions", [40, 1.1, 9.3, 0.1], "vegetables", PLANT, {
    unitGrams: { piece: 110, cup: 160 },
    nouns: { piece: ["onion", "onions"] },
    pack: { size: 1360, unit: "g", label: "1.36 kg bag", priceCad: 3.49 },
    shortcut: "onion-powder",
    shortcutFactor: 0.065,
  }),
  I("garlic", "Garlic", [149, 6.4, 33.1, 0.5], "vegetables", PLANT, {
    unitGrams: { piece: 3 },
    nouns: { piece: ["garlic clove", "garlic cloves"] },
    pack: { size: 30, unit: "piece", label: "3 bulbs", priceCad: 1.99 },
    shortcut: "garlic-powder",
    shortcutFactor: 0.13,
  }),
  I("tomato", "Tomatoes", [18, 0.9, 3.9, 0.2], "vegetables", PLANT, {
    inline: "tomato",
    unitGrams: { piece: 123, cup: 180, slice: 20 },
    nouns: { piece: ["tomato", "tomatoes"] },
    pack: { size: 500, unit: "g", label: "about 4 tomatoes (500 g)", priceCad: 2.99 },
  }),
  I("lettuce", "Romaine lettuce", [17, 1.2, 3.3, 0.3], "vegetables", PLANT, {
    unitGrams: { cup: 47, piece: 20 },
    nouns: { piece: ["lettuce leaf", "lettuce leaves"] },
    pack: { size: 500, unit: "g", label: "1 head", priceCad: 2.99 },
  }),
  I("spinach", "Baby spinach", [23, 2.9, 3.6, 0.4], "vegetables", PLANT, {
    unitGrams: { cup: 30 },
    pack: { size: 142, unit: "g", label: "142 g bag", priceCad: 3.49 },
  }),
  I("cucumber", "English cucumber", [15, 0.7, 3.6, 0.1], "vegetables", PLANT, {
    inline: "cucumber",
    unitGrams: { piece: 300, cup: 120, slice: 7 },
    nouns: { piece: ["cucumber", "cucumbers"] },
    pack: { size: 1, unit: "piece", label: "1 cucumber", priceCad: 1.49 },
  }),
  I("baby-carrots", "Baby carrots", [35, 0.6, 8.2, 0.1], "vegetables", PLANT, {
    unitGrams: { piece: 10, cup: 128 },
    nouns: { piece: ["baby carrot", "baby carrots"] },
    pack: { size: 680, unit: "g", label: "680 g bag", priceCad: 2.49 },
  }),
  I("mushrooms", "White mushrooms", [22, 3.1, 3.3, 0.3], "vegetables", PLANT, {
    inline: "sliced mushrooms",
    unitGrams: { cup: 70 },
    pack: { size: 227, unit: "g", label: "227 g pack", priceCad: 2.49 },
  }),
  I("green-onion", "Green onions", [32, 1.8, 7.3, 0.2], "vegetables", PLANT, {
    unitGrams: { piece: 15 },
    nouns: { piece: ["green onion", "green onions"] },
    pack: { size: 7, unit: "piece", label: "1 bunch", priceCad: 1.29 },
  }),
  I("cilantro", "Cilantro", [23, 2.1, 3.7, 0.5], "vegetables", PLANT, {
    unitGrams: { tbsp: 1, cup: 16 },
    pack: { size: 60, unit: "g", label: "1 bunch", priceCad: 1.49 },
  }),
  I("zucchini", "Zucchini", [17, 1.2, 3.1, 0.3], "vegetables", PLANT, {
    unitGrams: { piece: 200, cup: 124 },
    nouns: { piece: ["zucchini", "zucchini"] },
    pack: { size: 2, unit: "piece", label: "2 zucchini", priceCad: 2.49 },
  }),
  I("potatoes", "Russet potatoes", [79, 2.1, 18.1, 0.1], "vegetables", PLANT, {
    unitGrams: { piece: 213 },
    nouns: { piece: ["medium potato", "medium potatoes"] },
    pack: { size: 2270, unit: "g", label: "2.27 kg (5 lb) bag", priceCad: 4.99 },
    shortcut: "fries-frozen",
    shortcutFactor: 0.8,
  }),
  I("baby-potatoes", "Baby potatoes", [70, 1.9, 15.9, 0.1], "vegetables", PLANT, {
    unitGrams: { piece: 40 },
    nouns: { piece: ["baby potato", "baby potatoes"] },
    pack: { size: 680, unit: "g", label: "680 g bag", priceCad: 3.99 },
    shortcut: "fries-frozen",
    shortcutFactor: 0.8,
  }),
  I("sweet-potato", "Sweet potatoes", [86, 1.6, 20.1, 0.1], "vegetables", PLANT, {
    unitGrams: { piece: 200 },
    nouns: { piece: ["sweet potato", "sweet potatoes"] },
    pack: { size: 1000, unit: "g", label: "about 1 kg (4–5)", priceCad: 3.49 },
  }),
  I("coleslaw-mix", "Coleslaw mix (shredded cabbage)", [25, 1.3, 5.8, 0.1], "vegetables", PLANT, {
    inline: "coleslaw mix",
    unitGrams: { cup: 70 },
    pack: { size: 397, unit: "g", label: "397 g bag", priceCad: 2.99 },
  }),
  I("pickles", "Dill pickles", [12, 0.3, 2.4, 0.2], "pantry", PLANT, {
    inline: "dill pickle",
    unitGrams: { slice: 7, piece: 35 },
    nouns: { piece: ["pickle spear", "pickle spears"] },
    pack: { size: 1000, unit: "ml", label: "1 L jar", priceCad: 3.99 },
    density: 1,
  }),

  /* ------------------------------------------------------------ frozen */
  I("frozen-mixed-veg", "Frozen mixed vegetables", [72, 3.3, 13.5, 0.5], "frozen", PLANT, {
    unitGrams: { cup: 135 },
    pack: { size: 750, unit: "g", label: "750 g bag", priceCad: 3.49 },
  }),
  I("frozen-stirfry-veg", "Frozen stir-fry vegetables", [30, 1.5, 5.5, 0.2], "frozen", PLANT, {
    source: "label",
    unitGrams: { cup: 110 },
    pack: { size: 750, unit: "g", label: "750 g bag", priceCad: 3.99 },
  }),
  I("frozen-broccoli", "Frozen broccoli florets", [28, 2.8, 5.4, 0.3], "frozen", PLANT, {
    unitGrams: { cup: 90 },
    pack: { size: 750, unit: "g", label: "750 g bag", priceCad: 3.99 },
  }),
  I("frozen-corn", "Frozen corn", [88, 3, 20.7, 0.8], "frozen", PLANT, {
    unitGrams: { cup: 140 },
    pack: { size: 750, unit: "g", label: "750 g bag", priceCad: 3.49 },
  }),
  I("frozen-peas", "Frozen peas", [77, 5.2, 13.6, 0.4], "frozen", PLANT, {
    unitGrams: { cup: 134 },
    pack: { size: 750, unit: "g", label: "750 g bag", priceCad: 3.49 },
  }),
  I("frozen-peppers-onions", "Frozen sliced peppers and onions", [30, 1, 6.5, 0.2], "frozen", PLANT, {
    source: "label",
    unitGrams: { cup: 110 },
    pack: { size: 600, unit: "g", label: "600 g bag", priceCad: 3.99 },
  }),
  I("frozen-green-beans", "Frozen cut green beans", [33, 1.8, 7.5, 0.2], "frozen", PLANT, {
    inline: "frozen green beans",
    unitGrams: { cup: 110 },
    pack: { size: 750, unit: "g", label: "750 g bag", priceCad: 3.49 },
  }),
  I("fries-frozen", "Frozen oven fries", [145, 2.3, 22, 5.3], "frozen", PLANT, {
    source: "label",
    pack: { size: 900, unit: "g", label: "900 g bag", priceCad: 4.99 },
  }),
  I("hash-browns-frozen", "Frozen hash brown patties", [190, 2, 22, 10.5], "frozen", PLANT, {
    source: "label",
    unitGrams: { piece: 64 },
    nouns: { piece: ["hash brown patty", "hash brown patties"] },
    pack: { size: 10, unit: "piece", label: "10 patties", priceCad: 4.49 },
  }),

  /* ------------------------------------------------------------ sauces and condiments */
  I("pasta-sauce-jarred", "Jarred pasta sauce (marinara)", [50, 1.4, 8.1, 1.5], "pantry", PLANT, {
    inline: "jarred pasta sauce",
    density: 1.04,
    pack: { size: 650, unit: "ml", label: "650 mL jar", priceCad: 3.49 },
  }),
  I("alfredo-sauce-jarred", "Jarred alfredo sauce", [165, 3.3, 5, 14.8], "pantry", DAIRY, {
    source: "label",
    inline: "jarred alfredo sauce",
    allergens: ["dairy", "egg"],
    density: 1,
    pack: { size: 410, unit: "ml", label: "410 mL jar", priceCad: 4.49 },
  }),
  I("salsa", "Salsa", [36, 1.5, 7, 0.2], "pantry", PLANT, {
    density: 1.05,
    pack: { size: 650, unit: "ml", label: "650 mL jar", priceCad: 4.29 },
  }),
  I("taco-seasoning", "Taco seasoning", [300, 5, 55, 6], "pantry", PLANT, {
    source: "label",
    unitGrams: { pouch: 24, tbsp: 8, tsp: 2.7 },
    nouns: { pouch: ["packet", "packets"] },
    pack: { size: 24, unit: "g", label: "24 g packet", priceCad: 1.49 },
  }),
  I("soy-sauce", "Soy sauce", [53, 8.1, 4.9, 0.6], "pantry", PLANT, {
    allergens: ["soy", "gluten"],
    density: 1.07,
    pack: { size: 500, unit: "ml", label: "500 mL bottle", priceCad: 3.99 },
  }),
  I("teriyaki-sauce", "Teriyaki sauce", [89, 5.9, 15.6, 0], "pantry", PLANT, {
    allergens: ["soy", "gluten"],
    density: 1.15,
    pack: { size: 350, unit: "ml", label: "350 mL bottle", priceCad: 3.99 },
  }),
  I("ketchup", "Ketchup", [101, 1, 27.4, 0.1], "pantry", PLANT, {
    unitGrams: { tbsp: 17, tsp: 6 },
    pack: { size: 1140, unit: "g", label: "1 L bottle", priceCad: 4.99 },
  }),
  I("mustard", "Yellow mustard", [60, 3.7, 5.8, 3.3], "pantry", PLANT, {
    inline: "mustard",
    unitGrams: { tbsp: 15, tsp: 5 },
    pack: { size: 400, unit: "g", label: "400 mL bottle", priceCad: 2.49 },
  }),
  I("mayo", "Mayonnaise", [680, 1, 0.6, 74.9], "pantry", ["egg", "plant"], {
    allergens: ["egg"],
    unitGrams: { tbsp: 14, tsp: 4.6 },
    pack: { size: 420, unit: "g", label: "445 mL jar", priceCad: 4.49 },
  }),
  I("bbq-sauce", "Barbecue sauce", [172, 0.8, 40.8, 0.6], "pantry", PLANT, {
    unitGrams: { tbsp: 17, tsp: 6 },
    pack: { size: 520, unit: "g", label: "455 mL bottle", priceCad: 3.49 },
  }),
  I("hot-sauce", "Hot sauce", [11, 0.5, 1.8, 0.4], "pantry", PLANT, {
    unitGrams: { tsp: 5, tbsp: 15 },
    pack: { size: 150, unit: "g", label: "150 mL bottle", priceCad: 3.49 },
  }),
  I("honey", "Honey", [304, 0.3, 82.4, 0], "pantry", PLANT, {
    unitGrams: { tbsp: 21, tsp: 7 },
    pack: { size: 500, unit: "g", label: "500 g jar", priceCad: 6.99 },
  }),
  I("maple-syrup", "Maple syrup", [260, 0, 67, 0.1], "pantry", PLANT, {
    density: 1.32,
    pack: { size: 540, unit: "ml", label: "540 mL can", priceCad: 10.99 },
  }),
  I("jam", "Strawberry jam", [278, 0.4, 68.9, 0.1], "pantry", PLANT, {
    inline: "jam",
    unitGrams: { tbsp: 20, tsp: 7 },
    pack: { size: 500, unit: "g", label: "500 mL jar", priceCad: 4.49 },
  }),
  I("caesar-dressing", "Caesar dressing", [542, 2.2, 3.3, 57.9], "pantry", ["egg", "dairy", "fish"], {
    inline: "Caesar dressing",
    allergens: ["egg", "dairy", "fish"],
    unitGrams: { tbsp: 15 },
    pack: { size: 475, unit: "g", label: "475 mL bottle", priceCad: 4.49 },
  }),
  I("ranch-dressing", "Ranch dressing", [430, 1.3, 5.9, 44.5], "pantry", ["egg", "dairy"], {
    allergens: ["egg", "dairy"],
    unitGrams: { tbsp: 15 },
    pack: { size: 475, unit: "g", label: "475 mL bottle", priceCad: 4.49 },
  }),
  I("peanut-butter", "Peanut butter", [588, 25.1, 19.6, 50.4], "pantry", PLANT, {
    allergens: ["peanut"],
    unitGrams: { tbsp: 16, tsp: 5.3 },
    pack: { size: 1000, unit: "g", label: "1 kg jar", priceCad: 7.49 },
  }),
  I("almonds", "Almonds", [579, 21.2, 21.6, 49.9], "pantry", PLANT, {
    allergens: ["tree_nut"],
    unitGrams: { cup: 143, tbsp: 9, piece: 1.2 },
    nouns: { piece: ["almond", "almonds"] },
    pack: { size: 400, unit: "g", label: "400 g bag", priceCad: 8.99 },
  }),
  I("hummus", "Hummus", [166, 7.9, 14.3, 9.6], "other", PLANT, {
    allergens: ["sesame"],
    unitGrams: { tbsp: 15, cup: 246 },
    pack: { size: 227, unit: "g", label: "227 g tub", priceCad: 3.99 },
  }),
  I("black-beans", "Canned black beans", [132, 8.9, 23.7, 0.5], "pantry", PLANT, {
    inline: "black beans, drained",
    unitGrams: { can: 280, cup: 172 },
    pack: { size: 280, unit: "g", label: "540 mL can (about 280 g drained)", priceCad: 1.69 },
  }),
  I("chickpeas", "Canned chickpeas", [164, 8.9, 27.4, 2.6], "pantry", PLANT, {
    inline: "chickpeas, drained",
    unitGrams: { can: 280, cup: 164 },
    pack: { size: 280, unit: "g", label: "540 mL can (about 280 g drained)", priceCad: 1.69 },
  }),
  I("kidney-beans", "Canned red kidney beans", [127, 8.7, 22.8, 0.5], "pantry", PLANT, {
    inline: "kidney beans, drained",
    unitGrams: { can: 280, cup: 177 },
    pack: { size: 280, unit: "g", label: "540 mL can (about 280 g drained)", priceCad: 1.69 },
  }),
  I("lentils", "Canned lentils", [116, 9, 20.1, 0.4], "pantry", PLANT, {
    inline: "lentils, drained",
    unitGrams: { can: 280, cup: 198 },
    pack: { size: 280, unit: "g", label: "540 mL can (about 280 g drained)", priceCad: 1.79 },
  }),
  I("pineapple-canned", "Canned pineapple tidbits", [60, 0.5, 15.7, 0.1], "pantry", PLANT, {
    inline: "pineapple, drained",
    unitGrams: { can: 225, cup: 165 },
    pack: { size: 225, unit: "g", label: "398 mL can (about 225 g drained)", priceCad: 2.29 },
  }),
  I("brown-sugar", "Brown sugar", [380, 0.1, 98.1, 0], "pantry", PLANT, {
    unitGrams: { tsp: 4.6, tbsp: 13.8 },
    pack: { size: 1000, unit: "g", label: "1 kg bag", priceCad: 3.49 },
  }),
  I("diced-tomatoes", "Canned diced tomatoes", [16, 0.8, 3.5, 0.3], "pantry", PLANT, {
    inline: "canned diced tomatoes",
    unitGrams: { can: 796, cup: 240 },
    pack: { size: 796, unit: "g", label: "796 mL can", priceCad: 1.99 },
  }),
  I("tofu-firm", "Firm tofu", [144, 15.8, 4.3, 8.7], "other", PLANT, {
    inline: "firm tofu",
    allergens: ["soy"],
    pack: { size: 454, unit: "g", label: "454 g block", priceCad: 3.49 },
  }),
  I("chicken-broth", "Chicken broth, low sodium", [6, 0.8, 0.4, 0.2], "pantry", CHICKEN, {
    inline: "chicken broth",
    density: 1,
    pack: { size: 900, unit: "ml", label: "900 mL carton", priceCad: 2.99 },
  }),
  I("sesame-seeds", "Sesame seeds", [573, 17.7, 23.5, 49.7], "pantry", PLANT, {
    allergens: ["sesame"],
    unitGrams: { tsp: 2.8, tbsp: 9 },
    pack: { size: 100, unit: "g", label: "100 g bag", priceCad: 2.99 },
  }),
  I("sesame-oil", "Toasted sesame oil", [884, 0, 0, 100], "pantry", PLANT, {
    allergens: ["sesame"],
    unitGrams: { tsp: 4.5, tbsp: 13.6 },
    pack: { size: 190, unit: "g", label: "207 mL bottle", priceCad: 4.99 },
  }),

  /* ------------------------------------------------------------ staples: oil, salt, spices */
  I("olive-oil", "Olive oil", [884, 0, 0, 100], "pantry", PLANT, {
    unitGrams: { tbsp: 13.5, tsp: 4.5 },
    pack: { size: 1000, unit: "ml", label: "1 L bottle", priceCad: 13.99 },
    density: 0.91,
    staple: true,
  }),
  I("canola-oil", "Canola or vegetable oil", [884, 0, 0, 100], "pantry", PLANT, {
    inline: "oil",
    unitGrams: { tbsp: 13.6, tsp: 4.5 },
    pack: { size: 1420, unit: "ml", label: "1.42 L bottle", priceCad: 6.49 },
    density: 0.92,
    staple: true,
  }),
  I("salt", "Salt", [0, 0, 0, 0], "pantry", PLANT, {
    unitGrams: { tsp: 6 },
    pack: { size: 1000, unit: "g", label: "1 kg box", priceCad: 1.99 },
    staple: true,
  }),
  I("black-pepper", "Black pepper", [251, 10.4, 64, 3.3], "pantry", PLANT, {
    inline: "pepper",
    unitGrams: { tsp: 2.3 },
    pack: { size: 100, unit: "g", label: "100 g tin", priceCad: 4.49 },
    staple: true,
  }),
  I("garlic-powder", "Garlic powder", [331, 16.6, 72.7, 0.7], "pantry", PLANT, {
    unitGrams: { tsp: 3.1 },
    pack: { size: 100, unit: "g", label: "100 g jar", priceCad: 3.99 },
    staple: true,
  }),
  I("onion-powder", "Onion powder", [341, 10.4, 79.1, 1], "pantry", PLANT, {
    unitGrams: { tsp: 2.4 },
    pack: { size: 100, unit: "g", label: "100 g jar", priceCad: 3.99 },
    staple: true,
  }),
  I("paprika", "Paprika", [282, 14.1, 54, 12.9], "pantry", PLANT, {
    unitGrams: { tsp: 2.3 },
    pack: { size: 100, unit: "g", label: "100 g jar", priceCad: 3.99 },
    staple: true,
  }),
  I("chili-powder", "Chili powder", [282, 13.5, 49.7, 14.3], "pantry", PLANT, {
    unitGrams: { tsp: 2.7 },
    pack: { size: 100, unit: "g", label: "100 g jar", priceCad: 3.99 },
    staple: true,
  }),
  I("cumin", "Ground cumin", [375, 17.8, 44.2, 22.3], "pantry", PLANT, {
    unitGrams: { tsp: 2.1 },
    pack: { size: 100, unit: "g", label: "100 g jar", priceCad: 4.49 },
    staple: true,
  }),
  I("italian-seasoning", "Italian seasoning", [265, 9, 68.9, 4.3], "pantry", PLANT, {
    inline: "Italian seasoning",
    unitGrams: { tsp: 1 },
    pack: { size: 50, unit: "g", label: "50 g jar", priceCad: 3.49 },
    staple: true,
  }),
  I("cinnamon", "Ground cinnamon", [247, 4, 80.6, 1.2], "pantry", PLANT, {
    inline: "cinnamon",
    unitGrams: { tsp: 2.6 },
    pack: { size: 100, unit: "g", label: "100 g jar", priceCad: 3.99 },
    staple: true,
  }),
  I("red-pepper-flakes", "Red pepper flakes", [318, 12, 56.6, 17.3], "pantry", PLANT, {
    unitGrams: { tsp: 1.8 },
    pack: { size: 50, unit: "g", label: "50 g jar", priceCad: 3.49 },
    staple: true,
  }),
  I("water", "Water", [0, 0, 0, 0], "other", PLANT, { density: 1, staple: true }),
];

/* ------------------------------------------------------------------ lookups */

const BY_KEY: ReadonlyMap<string, IngredientEntry> = new Map(INGREDIENTS.map((i) => [i.key, i]));

/** The ingredient entry for a key, or undefined. */
export function getIngredient(key: string): IngredientEntry | undefined {
  return BY_KEY.get(key);
}

export function hasIngredient(key: string): boolean {
  return BY_KEY.has(key);
}

/** Shopper-facing name, or the key itself when unknown. */
export function ingredientName(key: string): string {
  return BY_KEY.get(key)?.name ?? key;
}

/** The name as used inside a sentence: "lean ground beef", "plain Greek yogurt (0%)". */
export function ingredientInline(key: string): string {
  const e = BY_KEY.get(key);
  if (!e) return key;
  if (e.inline) return e.inline;
  return e.name.charAt(0).toLowerCase() + e.name.slice(1);
}

export function isStaple(key: string): boolean {
  return BY_KEY.get(key)?.staple === true;
}

/** Canadian metric kitchen volumes, in mL. */
export const VOLUME_ML: Partial<Record<Unit, number>> = { ml: 1, tsp: 5, tbsp: 15, cup: 250 };

/**
 * Grams for `qty` of `unit` of an ingredient, or null when the unit can't be converted for it
 * (e.g. "cup" of chicken). Order: grams → the ingredient's own unit weight → volume × density
 * (only for ingredients that declare a density, i.e. pourable foods).
 */
export function gramsFor(key: string, qty: number, unit: Unit): number | null {
  const e = BY_KEY.get(key);
  if (!e || !Number.isFinite(qty) || qty < 0) return null;
  if (unit === "g") return qty;
  const own = e.unitGrams?.[unit];
  if (own != null) return qty * own;
  const ml = VOLUME_ML[unit];
  if (ml != null && e.density != null) return qty * ml * e.density;
  return null;
}

/** True when `unit` can be converted to grams for this ingredient. */
export function unitSupported(key: string, unit: Unit): boolean {
  return gramsFor(key, 1, unit) != null;
}

/**
 * Converts grams of an ingredient to its pack unit (g, mL or pieces) for the grocery list.
 * Returns null when the ingredient has no pack or the conversion is impossible.
 */
export function gramsToPackUnits(key: string, grams: number): { qty: number; unit: "g" | "ml" | "piece" } | null {
  const e = BY_KEY.get(key);
  if (!e?.pack || !(grams >= 0)) return null;
  const unit = e.pack.unit;
  if (unit === "g") return { qty: grams, unit };
  if (unit === "ml") return { qty: grams / (e.density ?? 1), unit };
  const each = e.unitGrams?.piece;
  return each ? { qty: grams / each, unit } : null;
}

/** Estimated cost in CAD for `grams` of an ingredient, prorated from its pack. Staples count as $0. */
export function ingredientCostCad(key: string, grams: number): number {
  const e = BY_KEY.get(key);
  if (!e?.pack || e.staple) return 0;
  const units = gramsToPackUnits(key, grams);
  if (!units) return 0;
  return (units.qty / e.pack.size) * e.pack.priceCad;
}

/** Forms of the same food. Disliking one form excludes the others. */
const FAMILIES: string[][] = [
  ["broccoli", "frozen-broccoli"],
  ["tortilla-flour", "tortilla-large"],
  ["greek-yogurt-0", "greek-yogurt-2"],
  ["chicken-breast-raw", "chicken-breast-cooked"],
  ["potatoes", "baby-potatoes"],
  ["milk-2", "milk-whole", "milk-lactose-free"],
  ["eggs", "egg-whites"],
];

/** Mixes that contain other ingredients. Disliking a part excludes the mix. */
const CONTAINS: Record<string, string[]> = {
  "frozen-peppers-onions": ["bell-pepper", "onion"],
  "frozen-stirfry-veg": ["broccoli", "frozen-broccoli", "bell-pepper", "baby-carrots"],
  "frozen-mixed-veg": ["frozen-corn", "frozen-peas", "baby-carrots"],
};

/** Every ingredient key a dislike of `key` rules out: itself, its other forms and mixes containing it. */
export function dislikeCovers(key: string): Set<string> {
  const out = new Set<string>([key]);
  for (const fam of FAMILIES) if (fam.includes(key)) fam.forEach((k) => out.add(k));
  for (const [mix, parts] of Object.entries(CONTAINS)) if ([...out].some((k) => parts.includes(k))) out.add(mix);
  return out;
}

/** The "Make this easier" swap for an ingredient: target key and grams-per-gram factor. */
export function shortcutFor(key: string): { key: string; factor: number } | null {
  const e = BY_KEY.get(key);
  if (!e?.shortcut || !BY_KEY.has(e.shortcut)) return null;
  return { key: e.shortcut, factor: e.shortcutFactor ?? 1 };
}
