// Maps reviewed AI items to food_entries rows. Pure, so the exact rows written on
// "Confirm & add" are unit-tested. base_* fields let the diary rescale an edited amount.

import type { Database } from "@/lib/supabase/database.types";
import type { HandoffAssistant, HandoffItem } from "@/lib/food/handoff";
import { ASSISTANT_LABEL } from "@/lib/food/handoff";
import { ENTRY_LIMITS, cleanText, round, tidyMacros } from "@/lib/food/normalize";
import type { MacroSet } from "@/lib/food/types";
import type { Meal } from "@/lib/nutrition";
import type { AIFoodItem } from "./food-schemas";

export type FoodEntryInsert = Database["public"]["Tables"]["food_entries"]["Insert"];

export interface LogContext {
  meal: Meal;
  localDate: string;
  /** ISO timestamp of when it was eaten (defaults to now). */
  eatenAt?: string;
  groupId: string;
  source: "photo_ai" | "chat_ai" | "assistant_handoff";
  photoPath?: string | null;
  newId: () => string;
}

const SOURCE_FULL: Record<string, string> = { USDA: "USDA FoodData Central", "Open Food Facts": "Open Food Facts" };

function limits(m: MacroSet): MacroSet {
  return tidyMacros(m, ENTRY_LIMITS);
}

/** One reviewed AI item → one diary row. Grams-based when the portion is a weight. */
export function entryFromItem(
  item: Pick<AIFoodItem, "name" | "brand" | "kind" | "quantity" | "unit" | "grams" | "macros" | "per100g" | "provenance" | "source" | "savedFoodId">,
  ctx: LogContext,
): FoodEntryInsert {
  const macros = limits(item.macros);
  const grams = item.grams && item.grams > 0 ? Math.min(ENTRY_LIMITS.grams, round(item.grams, 1)) : null;
  const unit = cleanText(item.unit, 24).toLowerCase() || "serving";
  // a photo/serving portion is a weight; counted things ("6 slice", "3 egg") stay counts
  const byWeight = !!grams && (unit === "g" || unit === "serving");

  let amount: number;
  let baseAmount: number;
  let base: MacroSet;
  let outUnit: string;
  if (byWeight) {
    amount = grams!;
    outUnit = "g";
    if (item.per100g) {
      baseAmount = 100;
      base = limits(item.per100g);
    } else {
      baseAmount = grams!;
      base = macros;
    }
  } else {
    amount = item.quantity > 0 ? round(item.quantity, 2) : 1;
    outUnit = unit;
    baseAmount = amount;
    base = macros;
  }

  return {
    id: ctx.newId(),
    local_date: ctx.localDate,
    eaten_at: ctx.eatenAt ?? new Date().toISOString(),
    meal: ctx.meal,
    name: cleanText(item.name, 120) || "Food",
    brand: item.brand && item.kind !== "generic" ? cleanText(item.brand, 80) || null : null,
    amount: Math.min(100000, amount),
    unit: outUnit,
    grams,
    calories: macros.calories,
    protein_g: macros.protein,
    carbs_g: macros.carbs,
    fat_g: macros.fat,
    base_amount: baseAmount,
    base_calories: base.calories,
    base_protein_g: base.protein,
    base_carbs_g: base.carbs,
    base_fat_g: base.fat,
    source: ctx.source,
    confidence: item.provenance === "database" ? "database" : item.provenance === "saved" || item.provenance === "manual" ? "logged" : "estimate",
    source_name: item.source ? (SOURCE_FULL[item.source.name] ?? item.source.name) : null,
    source_url: item.source?.url ?? null,
    meal_group_id: ctx.groupId,
    saved_food_id: item.savedFoodId ?? null,
    photo_path: ctx.photoPath ?? null,
  };
}

export function entriesFromItems(items: Parameters<typeof entryFromItem>[0][], ctx: LogContext): FoodEntryInsert[] {
  return items.filter((i) => i.macros.calories > 0 || i.macros.protein + i.macros.carbs + i.macros.fat > 0).map((i) => entryFromItem(i, ctx));
}

/** Handoff rows: per-unit values from the assistant's reply, the link it reported. */
export function entryFromHandoff(item: HandoffItem, assistant: HandoffAssistant, restaurant: string | null, ctx: LogContext): FoodEntryInsert {
  const per = limits(item.perUnit);
  const total = limits(item.total);
  const via = `via ${ASSISTANT_LABEL[assistant]}`;
  return {
    id: ctx.newId(),
    local_date: ctx.localDate,
    eaten_at: ctx.eatenAt ?? new Date().toISOString(),
    meal: ctx.meal,
    name: cleanText(item.name, 120) || "Food",
    brand: restaurant ? cleanText(restaurant, 80) : null,
    amount: item.quantity,
    unit: cleanText(item.unit, 24) || "serving",
    grams: null,
    calories: total.calories,
    protein_g: total.protein,
    carbs_g: total.carbs,
    fat_g: total.fat,
    base_amount: 1,
    base_calories: per.calories,
    base_protein_g: per.protein,
    base_carbs_g: per.carbs,
    base_fat_g: per.fat,
    source: "assistant_handoff",
    // We didn't retrieve the page ourselves: never "verified".
    confidence: "estimate",
    source_name: item.sourceUrl ? `${item.sourceName ?? "Source"} · ${via}`.slice(0, 120) : `Estimate · ${via}`,
    source_url: item.sourceUrl,
    meal_group_id: ctx.groupId,
    saved_food_id: null,
    photo_path: null,
  };
}
