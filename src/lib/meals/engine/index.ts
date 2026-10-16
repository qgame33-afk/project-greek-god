// The meal planner engine (docs/MEALS.md §4–5): pure functions over plain data. Callers (the
// data hooks and UI) persist what these return. Import from "@/lib/meals/engine".
//
// Typical wiring (hooks from "@/lib/data/meals"):
//   const pool = buildPool(useUserRecipes().recipes)          // library + the user's own recipes
//   const ctx: PlanContext = {
//     weekStart, goals: { kcal: profile.calorie_goal, protein: profile.protein_goal },
//     prefs: useMealPrefs().prefs, pool,
//     feedback: useMealFeedback().data,                      // learned on the fly (learnPrefs)
//     favourites: useFavourites().favourites,
//     history: usePlannedMealsRange(addDays(weekStart, -14), addDays(weekStart, -1)).data,
//     meals: usePlan(weekStart).meals,                        // locked ones are kept
//     fixedIds: ids already in the food log,                  // kept too
//     seed: `${weekStart}:${Date.now()}` for "regenerate week" (same seed → same plan)
//   }
//   generateWeek(ctx).meals            → useSavePlan({ weekStart, meals })
//   regenerateMeal(ctx, meal, shown)   → useUpdatePlannedMeal({ id, patch }) + useAddFeedback(feedback)
//   undoRegenerate(meal)               → patch
//   moveMeal / repeatMeal / lockMeal / setServings → patches (+ feedback for repeat)
//   regenerateReasonFeedback(...)      → replaces the plain "regenerated" row when a reason is picked
//   simplifyRecipe(recipe, { prefs })  → easier library version | new "simplified" recipe (useSaveUserRecipe) | unchanged + reason
//   buildGroceryList(meals, lookup, prefs) → toGroceryInput(items) → useSyncGroceryList
//   summarizeLearning(learnPrefs(feedback), { nameOf }) → "What the planner has learned"

export * from "./prefs";
export * from "./constraints";
export * from "./score";
export * from "./explain";
export * from "./plan";
export * from "./simplify";
export * from "./grocery";
export { hashString, rngFor, unitFor } from "./rng";
