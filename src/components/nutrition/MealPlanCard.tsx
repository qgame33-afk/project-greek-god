"use client";

import Link from "next/link";
import { CalendarPlus, Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlanBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { useLoggedPlannedMeals, usePlan, type PlanMeal } from "@/lib/data/meals";
import { weekStart } from "@/lib/dates";
import { dayTotals } from "@/lib/meals/engine";
import { SLOT_LABEL, gramsText, kcalText } from "@/components/meals/shared/format";
import { recipeHref } from "@/components/meals/shared/RecipeCard";
import { useRecipePool } from "@/components/meals/shared/useRecipePool";
import { recipeMacros } from "@/lib/meals/recipe";
import { useFuel } from "./context";

/**
 * MEALS · YOUR WEEK, FUELLED on the Fuel screen (docs/MEALS.md §6): today's planned meals, each
 * opening its recipe, or a way into the planner. Planned food is never counted as eaten, so it
 * carries the PLAN badge and only shows on today (not on past days you're reviewing).
 */
export function MealPlanCard({ className }: { className?: string }) {
  const { date, today } = useFuel();
  const plan = usePlan(weekStart(today));
  const logged = useLoggedPlannedMeals(weekStart(today));
  const { lookup } = useRecipePool();
  if (date !== today || !plan.hasData) return null;

  const meals = plan.meals.filter((m) => m.local_date === today);
  const mains = meals.filter((m) => m.slot !== "snack");
  const snacks = meals.filter((m) => m.slot === "snack");
  const total = dayTotals(meals, lookup)[today];
  // meals already in the food log are counted in Fuel's eaten totals: the card shows what's left
  const ahead = meals.filter((m) => !logged.logged[m.id]);
  const left = dayTotals(ahead, lookup)[today];
  const loggedCount = meals.length - ahead.length;

  return (
    <section className={cn("card-instrument overflow-hidden", className)} aria-labelledby="meal-plan-card-title">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <h2 id="meal-plan-card-title" className="eyebrow">
          Meals · your week, fuelled
        </h2>
        {meals.length > 0 && (
          <Link href="/nutrition/meals" className="press -my-2 -mr-2 inline-flex h-11 items-center gap-0.5 rounded-[12px] px-2 text-[13px] font-bold text-gold-300 hover:text-gold-200">
            Planner
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>

      {meals.length === 0 ? (
        <div className="px-4 pt-2 pb-4 sm:px-5">
          <p className="text-[14px] leading-relaxed text-fg-2">
            {plan.meals.length ? "Nothing planned for today." : "Easy, familiar meals for the whole week, sized to your goals. Nothing is logged until you eat it."}
          </p>
          <Button asChild variant="secondary" size="md" block className="mt-3">
            <Link href={plan.meals.length ? "/nutrition/meals" : "/nutrition/meals?generate=1"}>
              <CalendarPlus className="size-[18px] text-gold-300" />
              {plan.meals.length ? "Open the planner" : "Generate my week"}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 pt-1.5 pb-2 sm:px-5">
            {ahead.length === 0 ? (
              <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-2">
                <Check className="size-4 text-success" aria-hidden />
                All of today&apos;s planned meals are in your food log
              </p>
            ) : (
              <>
                <p className="text-[13px] font-semibold text-fg-2">
                  <span className="num text-[17px] text-fg">{kcalText((loggedCount ? left : total)?.kcal ?? 0)}</span> kcal ·{" "}
                  <span className="num text-[17px] text-fg">{gramsText((loggedCount ? left : total)?.protein ?? 0)}</span> g protein
                </p>
                <PlanBadge>{loggedCount ? "Still planned · not eaten" : "Planned · not eaten"}</PlanBadge>
                {loggedCount > 0 && (
                  <p className="w-full text-[12px] font-medium text-fg-3">
                    {loggedCount} of {meals.length} {meals.length === 1 ? "meal" : "meals"} already logged · {kcalText(Math.max(0, (total?.kcal ?? 0) - (left?.kcal ?? 0)))} kcal
                  </p>
                )}
              </>
            )}
          </div>
          <ul className="divide-y divide-line-hair border-t border-line-hair">
            {mains.map((m) => (
              <Row key={m.id} meal={m} label={SLOT_LABEL[m.slot]} name={lookup(m.recipe_key)?.name} kcal={kcalOf(m, lookup)} logged={!!logged.logged[m.id]} />
            ))}
            {snacks.length > 0 && (
              <Row
                meal={snacks[0]}
                label={snacks.length === 1 ? "Snack" : `${snacks.length} snacks`}
                name={snacks.map((s) => lookup(s.recipe_key)?.name ?? "Snack").join(", ")}
                kcal={snacks.reduce((n, s) => n + kcalOf(s, lookup), 0)}
                logged={snacks.every((s) => !!logged.logged[s.id])}
                href={snacks.length > 1 ? "/nutrition/meals" : undefined}
              />
            )}
          </ul>
        </>
      )}
    </section>
  );
}

function kcalOf(m: PlanMeal, lookup: ReturnType<typeof useRecipePool>["lookup"]) {
  const r = lookup(m.recipe_key);
  return r ? recipeMacros(r, m.servings).kcal : 0;
}

function Row({ meal, label, name, kcal, logged, href }: { meal: PlanMeal; label: string; name: string | undefined; kcal: number; logged: boolean; href?: string }) {
  return (
    <li>
      <Link href={href ?? recipeHref(meal.recipe_key, meal.id)} className="press-soft flex min-h-[48px] items-center gap-3 px-4 py-2 hover:bg-white/[.02] sm:px-5">
        <span className="w-[74px] shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-fg-3">{label}</span>
        <span className={cn("min-w-0 flex-1 truncate text-[14.5px] font-semibold", name ? "text-fg" : "text-fg-3")}>{name ?? "Recipe unavailable"}</span>
        {logged ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-fg-2">
            <Check className="size-3.5 text-success" aria-hidden />
            Logged
          </span>
        ) : (
          <span className="shrink-0 text-[12.5px] font-semibold text-fg-3">
            <span className="num text-[14px] text-fg-2">{kcalText(kcal)}</span> kcal
          </span>
        )}
      </Link>
    </li>
  );
}
