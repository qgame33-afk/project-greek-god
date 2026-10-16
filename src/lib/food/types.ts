// Shared food-database types. Isomorphic (no server-only imports) so the client can use them.

export interface MacroSet {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type FoodSource = "usda" | "off";

/**
 * One normalised database food. Contract shared with /api/food/search consumers.
 * `per100g` is per 100 g (or per 100 mL when `basis` is "ml"); `perServing` is for
 * exactly `servingAmount` × `servingUnit`.
 */
export interface FoodSearchResult {
  id: string;
  name: string;
  brand: string | null;
  source: FoodSource;
  sourceName: "USDA FoodData Central" | "Open Food Facts";
  sourceUrl: string;
  servingAmount: number;
  servingUnit: string;
  servingGrams: number | null;
  per100g: MacroSet | null;
  perServing: MacroSet;
  /** Extras (optional for consumers). */
  servingLabel?: string | null;
  basis?: "g" | "ml";
  dataType?: string | null;
  category?: string | null;
}

/** Health of one upstream database for a request. */
export type SourceStatus = "ok" | "demo_key" | "rate_limited" | "timeout" | "error" | "skipped";

/** Overall search status (string contract): worst meaningful state wins. */
export type SearchStatus = "ok" | "demo_key" | "partial" | "unavailable";

export interface SourceResult {
  results: FoodSearchResult[];
  status: SourceStatus;
}

export interface SearchResponse {
  results: FoodSearchResult[];
  status: SearchStatus;
  sources: { usda: SourceStatus; off: SourceStatus };
}

/** What kind of food a lookup is for — decides which databases are consulted first. */
export type LookupKind = "generic" | "packaged" | "restaurant" | "all";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
