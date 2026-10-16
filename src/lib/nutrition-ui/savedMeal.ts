// Saved (reusable) meals store their items as JSON. This module owns that shape:
// writing items from logged entries, reading them back defensively, and logging them.

import { z } from "zod";
import { sumMacros, type Macros, type Meal } from "@/lib/nutrition";
import { round } from "@/lib/units";
import type { ISODate } from "@/lib/dates";
import { asConfidence, entryBase, type FoodInsert, type FoodRow } from "./portion";
import { safeUrl } from "./provenance";

const n = (max: number) => z.coerce.number().finite().min(0).max(max);

const itemSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const r = { ...(raw as Record<string, unknown>) };
    // tolerate {protein, carbs, fat} as well as {protein_g, carbs_g, fat_g}
    for (const k of ["protein", "carbs", "fat"] as const) if (r[`${k}_g`] == null && r[k] != null) r[`${k}_g`] = r[k];
    return r;
  },
  z.object({
    name: z.string().trim().min(1).max(120),
    brand: z.string().max(80).nullish().catch(null),
    amount: z.coerce.number().positive().max(100000).catch(1),
    unit: z.string().trim().min(1).max(24).catch("serving"),
    grams: n(20000).nullish().catch(null),
    calories: n(20000),
    protein_g: n(2000).catch(0),
    carbs_g: n(3000).catch(0),
    fat_g: n(2000).catch(0),
    base_amount: z.coerce.number().positive().nullish().catch(null),
    base_calories: n(20000).nullish().catch(null),
    base_protein_g: n(2000).nullish().catch(null),
    base_carbs_g: n(3000).nullish().catch(null),
    base_fat_g: n(2000).nullish().catch(null),
    source: z.string().nullish().catch(null),
    confidence: z.string().nullish().catch(null),
    source_name: z.string().nullish().catch(null),
    source_url: z.string().nullish().catch(null),
  }),
);

export type SavedMealItem = z.infer<typeof itemSchema>;

/** Valid items only; anything malformed is skipped rather than guessed at. */
export function parseSavedMealItems(items: unknown): SavedMealItem[] {
  if (!Array.isArray(items)) return [];
  const out: SavedMealItem[] = [];
  for (const it of items) {
    const p = itemSchema.safeParse(it);
    if (p.success) out.push(p.data);
  }
  return out;
}

export function savedMealItemFromEntry(e: FoodRow): SavedMealItem {
  const { baseAmount, base } = entryBase(e);
  return {
    name: e.name,
    brand: e.brand,
    amount: Number(e.amount),
    unit: e.unit,
    grams: e.grams != null ? Number(e.grams) : null,
    calories: Number(e.calories),
    protein_g: Number(e.protein_g),
    carbs_g: Number(e.carbs_g),
    fat_g: Number(e.fat_g),
    base_amount: baseAmount,
    base_calories: base.calories,
    base_protein_g: base.protein,
    base_carbs_g: base.carbs,
    base_fat_g: base.fat,
    source: e.source,
    confidence: e.confidence,
    source_name: e.source_name,
    source_url: e.source_url,
  };
}

export function savedMealTotals(items: SavedMealItem[]): Macros {
  return sumMacros(items);
}

/** Entries for logging a saved meal as one group (deletable together). */
export function entriesFromSavedMeal(
  items: SavedMealItem[],
  o: { meal: Meal; date: ISODate; eatenAt: string; groupId: string; ids: string[] },
): FoodInsert[] {
  return items.map((it, i) => {
    const hasBase = it.base_amount != null && it.base_amount > 0 && it.base_calories != null;
    const url = safeUrl(it.source_url);
    let confidence = asConfidence(it.confidence);
    if (confidence === "verified" && !url) confidence = "logged";
    return {
      id: o.ids[i],
      local_date: o.date,
      eaten_at: o.eatenAt,
      meal: o.meal,
      name: it.name,
      brand: it.brand ?? null,
      amount: round(it.amount, 2),
      unit: it.unit,
      grams: it.grams ?? null,
      calories: round(it.calories, 0),
      protein_g: round(it.protein_g, 1),
      carbs_g: round(it.carbs_g, 1),
      fat_g: round(it.fat_g, 1),
      base_amount: hasBase ? round(it.base_amount!, 2) : round(it.amount, 2),
      base_calories: hasBase ? round(it.base_calories!, 1) : round(it.calories, 1),
      base_protein_g: hasBase ? round(it.base_protein_g ?? 0, 1) : round(it.protein_g, 1),
      base_carbs_g: hasBase ? round(it.base_carbs_g ?? 0, 1) : round(it.carbs_g, 1),
      base_fat_g: hasBase ? round(it.base_fat_g ?? 0, 1) : round(it.fat_g, 1),
      source: "saved_meal",
      confidence,
      source_name: it.source_name ?? null,
      source_url: url,
      meal_group_id: o.groupId,
      saved_food_id: null,
    };
  });
}
