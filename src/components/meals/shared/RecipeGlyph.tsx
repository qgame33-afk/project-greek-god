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
 * for a logged food with no recipe, from its name. This is what a meal Coin carries (docs/DESIGN-V2.md
 * §1.6, §3.5.2). Decorative: the name next to it says what it is.
 */
export function MealIcon({ recipe, name, className }: { recipe?: Pick<Recipe, "tags"> | null; name?: string | null; className?: string }) {
  const kind = recipe ? glyphFor(recipe) : glyphForName(name);
  const Icon = ICON[kind];
  return <Icon className={className} strokeWidth={1.6} aria-hidden />;
}

const SIZE = { sm: "size-9 [&_svg]:size-[18px]", md: "size-11 [&_svg]:size-[21px]", lg: "size-14 [&_svg]:size-[26px]" };

/**
 * The picture on a recipe card: the meal glyph in ivory, struck into an m3 medallion with a vein
 * rim. Olympus keeps it monochrome (series colours belong to macros; gold is earned).
 */
export function RecipeGlyph({ recipe, size = "md", className }: { recipe: Pick<Recipe, "tags"> | null | undefined; size?: keyof typeof SIZE; className?: string }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-m3 text-ivory shadow-[inset_0_0_0_1px_var(--vein-3),inset_0_1px_0_rgb(255_244_220/.06)]",
        SIZE[size],
        !recipe && "opacity-50",
        className,
      )}
      aria-hidden
    >
      <MealIcon recipe={recipe ?? { tags: [] }} />
    </span>
  );
}
