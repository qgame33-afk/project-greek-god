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
import { GLYPH_TONE, glyphFor, type GlyphKind, type GlyphTone } from "./format";

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

const TONE: Record<GlyphTone, string> = {
  terracotta: "text-terracotta bg-[rgb(207_140_94/.09)] ring-[rgb(207_140_94/.16)]",
  lapis: "text-lapis-text bg-[rgb(111_163_236/.08)] ring-[rgb(111_163_236/.16)]",
  verdigris: "text-verdigris bg-[rgb(93_181_164/.08)] ring-[rgb(93_181_164/.16)]",
  marble: "text-marble bg-white/[.05] ring-white/[.09]",
  porphyry: "text-porphyry bg-[rgb(165_146_201/.09)] ring-[rgb(165_146_201/.16)]",
};

const SIZE = { sm: "size-9 rounded-[10px] [&_svg]:size-[18px]", md: "size-11 rounded-[12px] [&_svg]:size-[21px]", lg: "size-14 rounded-[16px] [&_svg]:size-[26px]" };

/**
 * The picture on a recipe card: a tinted tile with a line icon for the dish (a burger, a
 * drumstick, a fish), chosen from the recipe's tags. Decorative: the name says what it is.
 */
export function RecipeGlyph({ recipe, size = "md", className }: { recipe: Pick<Recipe, "tags"> | null | undefined; size?: keyof typeof SIZE; className?: string }) {
  const kind = recipe ? glyphFor(recipe) : "bowl";
  const Icon = ICON[kind];
  return (
    <span className={cn("grid shrink-0 place-items-center ring-1 ring-inset", SIZE[size], TONE[GLYPH_TONE[kind]], !recipe && "opacity-50", className)} aria-hidden>
      <Icon strokeWidth={1.6} />
    </span>
  );
}
