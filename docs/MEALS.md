# MEALS — YOUR WEEK, FUELLED (meal planner spec)

The owner is a 17-year-old intermediate lifter (163 → 180–185 lb by Aug 2027) who is **not an
experienced cook**. The planner's job is to make eating ~3,300 kcal / 185 g protein a day easy and
enjoyable with **normal, cheap, familiar food** — scrambled eggs and toast, chicken wraps,
spaghetti bolognese with jarred sauce, cheeseburgers and oven fries, protein shakes. Not
restaurant cooking. Read CONVENTIONS.md and DESIGN.md first; this file is the contract between
the library, engine, data, API and UI. Shared types: `src/lib/meals/types.ts`.

Non-negotiables:
- **Planning ≠ eating.** Nothing in the planner ever writes to `food_entries` except the explicit
  "Add to today's food log" confirm, which is idempotent (a double tap logs once).
- **Allergies, diets and disliked ingredients are hard constraints** everywhere (library picks, AI
  output, "make this easier", regenerate). Test them.
- **No fake intelligence.** Personalisation comes from stored feedback rows; "Why this meal?" shows
  only reasons that actually contributed to the score. Nutrition is computed from the ingredient
  database (USDA values) and labelled "estimate". AI recipes are labelled as AI.
- **Works without AI.** The recipe library + engine are the planner. With `GEMINI_API_KEY`, AI adds
  fresh recipes to the user's pool (validated and recomputed); without it nothing pretends.
- Free only. No new paid services or npm packages.

## 1. Files and ownership

| Area | Files |
|---|---|
| Types (shared, edit only with care) | `src/lib/meals/types.ts` |
| Ingredient DB | `src/lib/meals/ingredients.ts` |
| Recipe library | `src/lib/meals/library/*.ts` (+ `index.ts` exporting `LIBRARY: Recipe[]`, `getLibraryRecipe(key)`) |
| Recipe helpers | `src/lib/meals/recipe.ts` — `normalizeRecipe`, `recipeMacros(recipe, servings)`, `scaleIngredients`, `formatQty`, `recipeFeatures`, `validateRecipe` (zod) |
| Engine | `src/lib/meals/engine/*.ts` — `prefs.ts` (learned model), `score.ts`, `plan.ts` (generate week / regenerate / move / repeat), `simplify.ts`, `explain.ts`, `grocery.ts`, `constraints.ts` |
| Migration | `supabase/migrations/20261017000000_meals.sql` |
| Data hooks | `src/lib/data/meals.ts` (TanStack Query + Supabase, RLS) |
| AI routes | `src/app/api/meals/ai/recipes/route.ts`, `src/app/api/meals/ai/simplify/route.ts`, prompts/schemas in `src/lib/meals/ai.ts` |
| UI | `src/app/(app)/nutrition/meals/**`, `src/components/meals/**`, entry card on `/nutrition` |

Unit tests live next to the code (`*.test.ts`, vitest).

## 2. Recipe library and ingredient database

- **Ingredient DB** (~150 entries): every ingredient the library uses, with USDA per-100 g macros
  for the form used (e.g. "pasta-dry", "chicken-breast-raw", "rice-cooked-microwave",
  "ground-beef-lean" = 90/10 raw), grocery category, allergens, kinds, natural unit weights
  (egg 50 g, slice bread 32 g, bagel 95 g, tortilla 45 g, scoop whey 31 g), a Canadian pack
  size + rough price for the grocery estimate, `staple` for salt/pepper/oil/spices, and
  `shortcut` swaps used by "Make this easier" (raw chicken → precooked/rotisserie chicken,
  dry rice → microwave rice pouch, raw potatoes → frozen fries / microwave potatoes, homemade
  sauce parts → jarred pasta sauce / jarred alfredo, fresh chopped veg → frozen veg mix).
- **Library** (≥ 100 recipes; breakfast ≥ 22, lunch ≥ 28, dinner ≥ 32, snacks ≥ 18). Majority
  `super_easy` (≤ 15 min, ≤ 6 non-staple ingredients, ≤ 5 steps); some `everyday` (15–30 min);
  a few `i_like_cooking`. Familiar Canadian-grocery food; shortcuts welcome (jarred sauce,
  microwave rice, frozen veg, rotisserie chicken, air fryer). Cover the owner's examples
  (breakfast: scrambled eggs & toast, eggs & bagels, Greek yogurt + granola + banana, PB
  oatmeal, breakfast sandwiches, cereal + milk + Greek yogurt, protein smoothies; lunch: chicken
  wraps, ham/turkey sandwiches, chicken & rice, beef burgers, chicken quesadillas, tuna melts,
  leftover pasta, easy chicken sandwiches; dinner: spaghetti bolognese, chicken breast &
  potatoes, chicken alfredo with jarred sauce, cheeseburgers & oven fries, beef tacos, chicken &
  rice bowls, tortilla pizzas, steak & potatoes, ground beef pasta, air-fryer chicken & fries;
  snacks: Greek yogurt, protein shake, PB toast, cheese & crackers, banana & PB, cottage cheese
  & fruit, basic sandwiches) and go well beyond them with variety (not chicken-and-rice
  everywhere): pork, turkey, eggs, tuna, salmon (simple), beans, different cuisines.
- Quantities are realistic single servings for a 6′2″ teen bulking (a dinner is typically
  700–1,000 kcal, 40–60 g protein). Steps are short, numbered, plain words; real temperatures
  and times; food safety where relevant (chicken 74 °C / 165 °F, ground beef 71 °C / 160 °F).
- `everyday`/`i_like_cooking` recipes that have a natural simpler version declare `easierKey`.
- `normalizeRecipe` fills grams, nutrition, allergens, kinds from the DB; `validateRecipe`
  rejects unknown ingredient keys, missing steps, absurd quantities. Tests assert every library
  recipe validates, nutrition is plausible (per-serving kcal 150–1,400, protein ≥ 8 g for meals),
  super_easy rules hold, and no duplicate keys.

## 3. Data model (migration `20261017000000_meals.sql`, RLS `user_id = auth.uid()` on all)

- `meal_prefs` (user_id PK → profiles) — the `MealPrefs` fields as columns (text/text[]/int/numeric), defaults = `DEFAULT_PREFS`, `updated_at`.
- `recipes` — user-owned recipes (AI, simplified, custom): `id uuid`, `user_id`, `origin`, `base_key text`, `name`, `data jsonb` (validated `Recipe`), `created_at`. Key = `usr:<id>`.
- `meal_plans` — `id`, `user_id`, `week_start date` (Monday), `settings jsonb` (prefs snapshot), timestamps; unique (user_id, week_start).
- `planned_meals` — `id`, `user_id`, `plan_id` (cascade), `local_date`, `slot` check, `position int`, `recipe_key text`, `servings numeric(4,2)` check 0.25–6, `locked bool`, `reason jsonb`, `history jsonb default '[]'`, timestamps; index (plan_id), (user_id, local_date).
- `meal_feedback` — `id`, `user_id`, `recipe_key`, `event` check (FeedbackEvent), `reason` check (FeedbackReason) null, `ingredient text`, `features text[]`, `created_at`; index (user_id, created_at desc).
- `favourite_recipes` — (user_id, recipe_key) PK, `repeat_ok bool default true`, `created_at`.
- `grocery_items` — `id`, `user_id`, `plan_id` (cascade), `key text` (ingredient key or `custom:<uuid>`), `name`, `category`, `qty numeric`, `unit text`, `label text` (shopper text "2 × 454 g packs"), `checked bool`, `have bool` (already have), `removed bool`, `custom bool`, `est_cost_cad numeric`, `position int`, timestamps; unique (plan_id, key).
- `meal_plans.grocery_budget_cad numeric null`, `meal_plans.grocery_generated_at timestamptz`.
- `food_entries`: add `planned_meal_id uuid references planned_meals on delete set null`; extend the `source` check with `'meal_plan'`.
- AI daily cap: add `meals_ai: 40` to `DAILY_LIMITS` in `src/lib/ai/usage.ts`.
- Add the new tables to the export (`src/lib/export/tables.ts`) and account deletion/wipe lists.

## 4. Personalisation (engine/prefs.ts + score.ts) — a real, explainable learner

**Features** of a recipe (`recipeFeatures`): its `tags` (cuisine:, protein:, base:, style:, dish:)
plus `ing:<key>` for each non-staple, non-optional ingredient, plus derived buckets
`time:quick|medium|long` (≤15/≤30/>30 min), `effort:few|some|many` (≤5/≤8/>8 ingredients),
`cost:1|2|3`.

**Learned weights** are recomputed from `meal_feedback` (never invented): for each event,
`w[f] += signal × decay(age) / sqrt(|features|)` for each feature f in the event's snapshot,
clamped to [−3, 3]. Decay half-life 60 days. Signals:

| event | signal | notes |
|---|---|---|
| thumbs_up | +1.0 | explicit |
| thumbs_down | −1.0 | explicit; the recipe itself is excluded for 90 days |
| saved / unsaved | +0.8 / −0.3 | favourite |
| repeated | +0.7 | user wants it again |
| logged | +0.6 | actually ate it |
| cooked | +0.5 | finished cooking mode |
| kept | +0.3 | kept a regenerated suggestion |
| regenerated | −0.25 | implicit, mild |
| viewed | +0.05 | weakest |

Reasons modify learning: `too_complicated` → −0.8 on that recipe's `effort:*`/`time:*` features
and a persistent "simpler" bias (prefer fewer ingredients/steps); `too_long` → −0.8 on `time:*`;
`too_expensive` → −0.8 on `cost:*`; `dont_like` → −1.0 on all features; `ate_recently` → no taste
penalty, only a 14-day cooldown for that recipe; `dislike_ingredient` → asks which ingredient and
adds it to `dislikedIngredients` (hard) after the user confirms.

**Score** for a candidate in a slot (all terms recorded for "Why this meal?"):
1. Hard filters: slot, allergies, diets, disliked ingredients, missing equipment, thumbs-down
   within 90 days, already used this week (unless favourite with repeat_ok, ≥ 3 days apart).
2. Fit: difficulty (super_easy: penalty past 15 min / 6 ingredients / 5 steps), time cap, budget vs cost.
3. Taste: Σ w[f] over the recipe's features (normalised) + explicit liked/disliked ingredients and cuisines.
4. Variety: penalties for same `protein:` twice in a day, same `base:` twice in a day, same `dish:`
   within 5 days, recipe planned/eaten in the last 14 days (cooldown; favourites 4 days).
5. Macro fit: closeness of the scaled serving to the slot's calorie target with protein density bonus.
6. Exploration: seeded noise (deterministic per plan/slot/attempt so tests are stable) and ~10%
   "new for you" picks among top candidates never seen before. Selection = softmax over the
   top 8 (temperature 0.6), so plans vary while favouring what the user likes.

**Calorie/protein targets**: breakfast 25 %, lunch 30 %, dinner 30 %, snacks 15 % split across
`snacksPerDay` of the profile's calorie goal. Servings are picked from {0.5, 0.75, 1, 1.25, 1.5,
1.75, 2, 2.5, 3} to land near the slot target; then the day is balanced so total kcal is within
±12 % of the goal and protein ≥ 90 % of the goal where possible (swap a snack for a high-protein
one if short). Not restrictive: no gram-perfect diets.

**Explanations** (`explain.ts`): top contributing reasons with real data, e.g. "You liked
Cheeseburgers and Beef Tacos (beef)", "Super Easy: 12 min, 5 ingredients", "Fits dinner: 920 kcal,
58 g protein", "New for you", "Uses what you have: rice, eggs", "One of your favourites".

## 5. Planner operations (engine/plan.ts, pure; hooks persist)

- `generateWeek(ctx)` → 7 days × (breakfast, lunch, dinner, snacks) with servings + reasons;
  keeps `locked` meals when regenerating a week; deterministic given a seed.
- `regenerateMeal(ctx, meal, shown[])` → a different recipe for that one meal only (excludes the
  current one and everything already shown in this regenerate session); the old pick is pushed on
  `history` for Undo; logs `regenerated` (+ optional reason) for the old recipe.
- `moveMeal`, `repeatMeal` (copy to another day/slot), `lock`/`unlock`, `setServings`.
- `simplifyRecipe(recipe)` ("Make this easier"): use `easierKey` if present; else apply ingredient
  `shortcut` swaps, drop optional ingredients and garnish, merge steps, recompute minutes and
  nutrition → a new `simplified` recipe stored in `recipes`; if nothing can be simplified, say so
  honestly (with AI available, `/api/meals/ai/simplify` may produce one, validated the same way).
- `buildGroceryList(plan meals, recipes, prefs)` → consolidated items: sum by ingredient key across
  the week (scaled by servings), convert compatible units to base (g/ml/piece), present in shopper
  units/packs ("1.2 kg — 3 × 454 g packs", "18 eggs — 2 dozen"), group by category, staples under
  Pantry as "check you have", `pantry` prefs marked "have", estimated cost vs optional budget.
  Regenerating keeps custom items and the checked/have/removed state of items that still exist.

## 6. UI (DESIGN.md Pantheon; mobile-first 390 px; must also be great at 1440)

- `/nutrition` gets an entry card **MEALS — YOUR WEEK, FUELLED** (today's planned meals or
  "Generate my week").
- `/nutrition/meals` — week view: this week / next week, Mon–Sun day picker, day's meal cards
  (slot, name, minutes, kcal, protein, difficulty pips, lock state) with a clearly visible
  **Regenerate meal** button on every card; day totals vs goals labelled "Planned — not eaten";
  **GENERATE MY WEEK** (one gold fill); regenerate week (confirm, keeps locked); generate next
  week; grocery list; preferences. Regenerate swaps in place with a subtle loading state and a
  smooth cross-fade, then shows a non-blocking strip: Undo · I don't like this · Too complicated ·
  Takes too long · Too expensive · Already ate this recently · Don't like an ingredient. Per-meal
  menu: move to another day, repeat, lock, favourite, 👍/👎 (use icons, not emoji), remove.
- Recipe screen `/nutrition/meals/recipe/[key]?meal=<plannedMealId>` — one of the best screens in
  the app: name, time, difficulty, ingredient count, kcal/P/C/F, servings stepper (1 → 2 → 4,
  scales ingredients + nutrition, persists to the planned meal), ingredient checklist, numbered
  steps with timers and safety notes, Why this meal?, favourite, thumbs, **START COOKING**,
  **MAKE THIS EASIER**, **ADD TO TODAY'S FOOD LOG** (confirm sheet: servings, date, meal
  category, kcal/P/C/F editable, idempotent; shows "Logged today" afterwards).
- Cooking mode `/nutrition/meals/cook/[key]` (focus route: no tab bar) — huge readable text, one
  step at a time, check off, timers with sound/haptic, keeps the screen awake where supported.
- Grocery list `/nutrition/meals/grocery` — grouped, check off, copy, add custom, remove, "I have
  this", regenerate after swaps (banner when the plan changed), optional budget with estimate.
- Preferences `/nutrition/meals/preferences` — difficulty (Super Easy default / Everyday / I Like
  Cooking), budget, allergies + diets (hard), disliked/liked ingredients, cuisines, equipment,
  snacks per day, what I already have, and **What the planner has learned** (top liked/disliked
  features from real feedback, with reset).
- Motion 150–250 ms, springs for tactile things, transform/opacity only, `prefers-reduced-motion`
  respected. ≥ 44 px targets, safe areas, no horizontal overflow, nothing hidden by the keyboard.
