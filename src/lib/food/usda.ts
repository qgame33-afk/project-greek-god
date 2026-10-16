// USDA FoodData Central search client + normaliser.
// Docs: https://fdc.nal.usda.gov/api-guide.html — search results carry nutrients per 100 g
// (per 100 mL for some branded drinks), which is exactly what portion maths needs.

import { num, plausiblePer100g, round, tidyBrand, tidyMacros, tidyName } from "./normalize";
import type { FetchLike, FoodSearchResult, LookupKind, MacroSet, SourceResult } from "./types";

const ENDPOINT = "https://api.nal.usda.gov/fdc/v1/foods/search";
export const USDA_GENERIC_TYPES = ["Foundation", "SR Legacy", "Survey (FNDDS)"] as const;

export interface USDANutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  nutrientName?: string;
  unitName?: string;
  value?: number;
}

export interface USDAFood {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  foodCategory?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: USDANutrient[];
}

export function usdaUrl(fdcId: number | string) {
  return `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients`;
}

function nutrient(food: USDAFood, ids: number[], numbers: string[]): USDANutrient | undefined {
  const list = food.foodNutrients ?? [];
  for (const id of ids) {
    const n = list.find((x) => x.nutrientId === id || x.nutrientNumber === numbers[ids.indexOf(id)]);
    if (n && num(n.value) != null) return n;
  }
  return undefined;
}

/** Energy in kcal per 100 g: 1008 (kcal) → 2048/2047 (Atwater, Foundation foods) → 1062 (kJ) → macros. */
export function usdaEnergyKcal(food: USDAFood, macros: Omit<MacroSet, "calories">): number | null {
  const list = food.foodNutrients ?? [];
  const pick = (id: number, numStr: string, unit: "KCAL" | "KJ") => {
    const n = list.find((x) => (x.nutrientId === id || x.nutrientNumber === numStr) && (x.unitName ?? "").toUpperCase() === unit);
    return n ? num(n.value) : null;
  };
  const kcal = pick(1008, "208", "KCAL") ?? pick(2048, "958", "KCAL") ?? pick(2047, "957", "KCAL");
  if (kcal != null) return kcal;
  const kj = pick(1062, "268", "KJ") ?? pick(1008, "208", "KJ");
  if (kj != null) return kj / 4.184;
  if (macros.protein + macros.carbs + macros.fat > 0) return macros.protein * 4 + macros.carbs * 4 + macros.fat * 9;
  return null;
}

export function normalizeUSDAFood(food: USDAFood): FoodSearchResult | null {
  if (!food || typeof food.fdcId !== "number" || !food.description) return null;
  const protein = num(nutrient(food, [1003], ["203"])?.value) ?? 0;
  const fat = num(nutrient(food, [1004, 1085], ["204", "298"])?.value) ?? 0;
  const carbs = num(nutrient(food, [1005, 1050], ["205", "205.2"])?.value) ?? 0;
  const kcal = usdaEnergyKcal(food, { protein, carbs, fat });
  if (kcal == null) return null;
  const per100g = tidyMacros({ calories: kcal, protein, carbs, fat });
  if (!plausiblePer100g(per100g)) return null;

  const branded = food.dataType === "Branded";
  const unitRaw = (food.servingSizeUnit ?? "").toLowerCase();
  const servingIsMl = ["ml", "mlt"].includes(unitRaw);
  const servingIsG = ["g", "grm"].includes(unitRaw);
  const size = num(food.servingSize);
  const hasServing = branded && size != null && size > 0 && size <= 5000 && (servingIsG || servingIsMl);
  const basis: "g" | "ml" = servingIsMl ? "ml" : "g";

  const servingAmount = hasServing ? round(size!, 1) : 100;
  const servingUnit = hasServing ? (servingIsMl ? "ml" : "g") : "g";
  const factor = servingAmount / 100;
  const perServing = tidyMacros({
    calories: per100g.calories * factor,
    protein: per100g.protein * factor,
    carbs: per100g.carbs * factor,
    fat: per100g.fat * factor,
  });
  const household = food.householdServingFullText?.trim();

  return {
    id: `usda:${food.fdcId}`,
    name: tidyName(food.description).slice(0, 120),
    brand: branded ? tidyBrand(food.brandName || food.brandOwner) : null,
    source: "usda",
    sourceName: "USDA FoodData Central",
    sourceUrl: usdaUrl(food.fdcId),
    servingAmount,
    servingUnit,
    servingGrams: hasServing ? (servingIsG ? servingAmount : null) : 100,
    per100g,
    perServing,
    servingLabel: hasServing && household ? `${tidyName(household).toLowerCase()} (${servingAmount} ${servingUnit})` : null,
    basis,
    dataType: food.dataType ?? null,
    category: food.foodCategory ?? null,
  };
}

export interface USDASearchOptions {
  kind?: LookupKind;
  pageSize?: number;
  apiKey?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
}

/** Search FoodData Central. Never throws: failures come back as a status. */
export async function searchUSDA(query: string, opts: USDASearchOptions = {}): Promise<SourceResult> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return { results: [], status: "skipped" };
  const key = opts.apiKey?.trim() || "DEMO_KEY";
  const usingDemo = key === "DEMO_KEY";
  const kind = opts.kind ?? "all";
  const dataType = kind === "generic" ? [...USDA_GENERIC_TYPES] : kind === "packaged" || kind === "restaurant" ? ["Branded"] : undefined;
  const body = { query: q, pageSize: Math.min(25, opts.pageSize ?? 12), ...(dataType ? { dataType } : {}) };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 6000);
  const onOuterAbort = () => ctl.abort();
  opts.signal?.addEventListener("abort", onOuterAbort);
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${ENDPOINT}?api_key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
      cache: "no-store",
    });
    if (res.status === 429) return { results: [], status: "rate_limited" };
    if (!res.ok) return { results: [], status: "error" };
    const json = (await res.json()) as { foods?: USDAFood[] };
    const results = (json.foods ?? []).map(normalizeUSDAFood).filter((r): r is FoodSearchResult => r !== null);
    return { results, status: usingDemo ? "demo_key" : "ok" };
  } catch (e) {
    return { results: [], status: (e as Error)?.name === "AbortError" ? "timeout" : "error" };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}
