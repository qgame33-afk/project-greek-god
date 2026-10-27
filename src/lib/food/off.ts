// Open Food Facts search client + normaliser (packaged and branded products, no key).
// Primary: the search-a-licious API (fast, JSON). Fallback: the legacy cgi search.
// Data is crowd-sourced, so every record passes a plausibility check before use.

import { num, plausiblePer100g, round, tidyBrand, tidyMacros, tidyName } from "./normalize";
import type { FetchLike, FoodSearchResult, SourceResult } from "./types";

export const OFF_USER_AGENT = "ProjectGreekGod/1.0 (personal nutrition tracker; server-side lookups)";
const SEARCH_URL = "https://search.openfoodfacts.org/search";
const LEGACY_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const FIELDS = "code,product_name,product_name_en,brands,quantity,serving_size,serving_quantity,nutriments,countries_tags,lang";

export interface OFFHit {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string | string[];
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  countries_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
}

export function offUrl(code: string) {
  return `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`;
}

export function normalizeOFFHit(hit: OFFHit): FoodSearchResult | null {
  const code = typeof hit?.code === "string" ? hit.code.replace(/[^0-9A-Za-z-]/g, "") : "";
  // the product's own name first: product_name_en is a separate crowd-edited field that is more
  // often vandalised or left stale
  const rawName = (hit?.product_name || hit?.product_name_en || "").toString().trim();
  if (!code || !rawName) return null;
  const n = hit.nutriments ?? {};
  const protein = num(n["proteins_100g"]);
  const carbs = num(n["carbohydrates_100g"]);
  const fat = num(n["fat_100g"]);
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal == null) {
    const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
    if (kj != null) kcal = kj / 4.184;
  }
  if (kcal == null && protein == null && carbs == null && fat == null) return null;
  if (kcal == null) kcal = (protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9;
  // A product with energy but no macros at all is too incomplete to log from.
  if (protein == null && carbs == null && fat == null) return null;
  const per100g = tidyMacros({ calories: kcal, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 });
  if (!plausiblePer100g(per100g)) return null;

  const brandsRaw = Array.isArray(hit.brands) ? hit.brands[0] : hit.brands?.split(",")[0];
  const sq = num(hit.serving_quantity);
  const hasServing = sq != null && sq > 0 && sq <= 3000;
  const servingAmount = hasServing ? round(sq!, 1) : 100;
  const f = servingAmount / 100;

  return {
    id: `off:${code}`,
    name: tidyName(rawName.replace(/\s+/g, " ")).slice(0, 120),
    brand: tidyBrand(brandsRaw ?? null),
    source: "off",
    sourceName: "Open Food Facts",
    sourceUrl: offUrl(code),
    servingAmount,
    servingUnit: "g",
    servingGrams: servingAmount,
    per100g,
    perServing: tidyMacros({ calories: per100g.calories * f, protein: per100g.protein * f, carbs: per100g.carbs * f, fat: per100g.fat * f }),
    servingLabel: hasServing && hit.serving_size ? hit.serving_size.toString().slice(0, 40) : null,
    basis: "g",
    dataType: "Open Food Facts",
    category: null,
  };
}

export interface OFFSearchOptions {
  pageSize?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
  userAgent?: string;
}

async function getJSON(
  url: string,
  opts: OFFSearchOptions,
): Promise<{ ok: true; json: unknown } | { ok: false; status: "timeout" | "error" | "rate_limited" }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 6000);
  const onOuterAbort = () => ctl.abort();
  opts.signal?.addEventListener("abort", onOuterAbort);
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, {
      headers: { "user-agent": opts.userAgent ?? OFF_USER_AGENT, accept: "application/json" },
      signal: ctl.signal,
      cache: "no-store",
    });
    if (res.status === 429) return { ok: false, status: "rate_limited" };
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return { ok: false, status: "error" };
    return { ok: true, json: await res.json() };
  } catch (e) {
    return { ok: false, status: (e as Error)?.name === "AbortError" ? "timeout" : "error" };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}

/** Search Open Food Facts. Never throws: failures come back as a status. */
export async function searchOFF(query: string, opts: OFFSearchOptions = {}): Promise<SourceResult> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return { results: [], status: "skipped" };
  const size = Math.min(24, opts.pageSize ?? 12);

  const primary = await getJSON(`${SEARCH_URL}?q=${encodeURIComponent(q)}&page_size=${size}&fields=${FIELDS}`, opts);
  if (primary.ok) {
    const hits = ((primary.json as { hits?: OFFHit[] })?.hits ?? []) as OFFHit[];
    return { results: dedupe(hits.map(normalizeOFFHit)), status: "ok" };
  }
  if (opts.signal?.aborted) return { results: [], status: "timeout" };

  const legacy = await getJSON(
    `${LEGACY_URL}?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${size}&fields=${FIELDS}`,
    opts,
  );
  if (legacy.ok) {
    const products = ((legacy.json as { products?: OFFHit[] })?.products ?? []) as OFFHit[];
    return { results: dedupe(products.map(normalizeOFFHit)), status: "ok" };
  }
  return { results: [], status: primary.status === "timeout" ? "timeout" : legacy.status };
}

/** OFF often has the same product twice (with/without leading zeros). */
function dedupe(list: (FoodSearchResult | null)[]): FoodSearchResult[] {
  const seen = new Set<string>();
  const out: FoodSearchResult[] = [];
  for (const r of list) {
    if (!r) continue;
    const key = `${r.name.toLowerCase()}|${r.brand?.toLowerCase() ?? ""}|${r.per100g?.calories}`;
    const code = r.id.replace(/^off:0+/, "off:");
    if (seen.has(key) || seen.has(code)) continue;
    seen.add(key);
    seen.add(code);
    out.push(r);
  }
  return out;
}
