import {
  Apple,
  Bean,
  Beef,
  CupSoda,
  Drumstick,
  EggFried,
  Fish,
  Ham,
  Hamburger,
  Milk,
  Nut,
  Pizza,
  Salad,
  Sandwich,
  Shrimp,
  Soup,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { Recipe } from "@/lib/meals/types";
import { glyphFor, glyphForName, type GlyphKind } from "./format";

const ICON: Record<GlyphKind, LucideIcon> = {
  burger: Hamburger,
  pizza: Pizza,
  shake: CupSoda,
  sandwich: Sandwich,
  salad: Salad,
  fruit: Apple,
  beef: Beef,
  poultry: Drumstick,
  pork: Ham,
  fish: Fish,
  shrimp: Shrimp,
  egg: EggFried,
  dairy: Milk,
  plant: Bean,
  nut: Nut,
  grain: Wheat,
  bowl: Soup,
};

/**
 * The bare per-meal glyph (a burger, a drumstick, a fish), chosen from the recipe's tags — or,
 * for a logged food with no recipe, from its name. Decorative: the name next to it says what it
 * is. Lucide outline, `currentColor` (docs/DESIGN-V3-SIMPLE.md §1.5).
 */
export function MealIcon({ recipe, name, className }: { recipe?: Pick<Recipe, "tags"> | null; name?: string | null; className?: string }) {
  const kind = recipe ? glyphFor(recipe) : glyphForName(name);
  const Icon = ICON[kind];
  return <Icon className={className} strokeWidth={1.9} aria-hidden />;
}

const SIZE = { sm: "size-9 rounded-sm [&_svg]:size-[18px]", md: "size-11 rounded-tile [&_svg]:size-[22px]", lg: "size-[52px] rounded-tile [&_svg]:size-6" };

/**
 * The meal's tile (docs/DESIGN-V3-SIMPLE.md §1.5): the glyph in --text on a --card-2 tile (the
 * 52 px size is the ListItem tile). Used by Food, the recipe and Today's Up next.
 */
export function RecipeGlyph({ recipe, size = "md", className }: { recipe: Pick<Recipe, "tags"> | null | undefined; size?: keyof typeof SIZE; className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center bg-control text-fg", SIZE[size], !recipe && "text-fg-2", className)} aria-hidden>
      <MealIcon recipe={recipe ?? { tags: [] }} />
    </span>
  );
}
