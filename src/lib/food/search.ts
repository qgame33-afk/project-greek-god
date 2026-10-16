// Combined database search used by /api/food/search and the AI pipeline.
// Generic foods → USDA (Foundation / SR Legacy / Survey). Packaged → Open Food Facts +
// USDA Branded. Results are cached in memory so repeat lookups don't burn rate limits.

import { searchOFF } from "./off";
import { rankResults } from "./match";
import { searchUSDA } from "./usda";
import type { FetchLike, FoodSearchResult, LookupKind, SearchResponse, SearchStatus, SourceResult, SourceStatus } from "./types";

export interface SearchFoodsOptions {
  kind?: LookupKind;
  usdaKey?: string | null;
  limit?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
  /** Disable the in-memory cache (tests). */
  noCache?: boolean;
}

const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 400;
const cache = new Map<string, { at: number; value: SourceResult }>();

function cacheGet(key: string): SourceResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key: string, value: SourceResult) {
  // only cache answers, never failures (they should be retried)
  if (value.status !== "ok" && value.status !== "demo_key") return;
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
}

function rankStatus(s: SourceStatus) {
  return ["skipped", "ok", "demo_key", "timeout", "rate_limited", "error"].indexOf(s);
}

export function clearSearchCache() {
  cache.clear();
}

async function cached(key: string, run: () => Promise<SourceResult>, noCache?: boolean): Promise<SourceResult> {
  if (!noCache) {
    const hit = cacheGet(key);
    if (hit) return hit;
  }
  const value = await run();
  if (!noCache) cacheSet(key, value);
  return value;
}

/** Combine two source states into the API's single status string. */
export function overallStatus(usda: SourceStatus, off: SourceStatus, resultCount: number): SearchStatus {
  const failed = (s: SourceStatus) => s === "error" || s === "timeout" || s === "rate_limited";
  const used = [usda, off].filter((s) => s !== "skipped");
  if (used.length && used.every(failed) && resultCount === 0) return "unavailable";
  if (used.some(failed)) return "partial";
  if (usda === "demo_key") return "demo_key";
  return "ok";
}

export async function searchFoods(query: string, opts: SearchFoodsOptions = {}): Promise<SearchResponse> {
  const q = query.trim().replace(/\s+/g, " ").slice(0, 100);
  const kind = opts.kind ?? "all";
  if (q.length < 2) return { results: [], status: "ok", sources: { usda: "skipped", off: "skipped" } };
  const common = { timeoutMs: opts.timeoutMs ?? 6000, signal: opts.signal, fetchImpl: opts.fetchImpl };
  const lower = q.toLowerCase();

  const hasKey = !!opts.usdaKey?.trim();
  const none = Promise.resolve<SourceResult>({ results: [], status: "skipped" });
  const usdaCall = (k: LookupKind) =>
    cached(`usda|${k}|${lower}`, () => searchUSDA(q, { ...common, kind: k, apiKey: opts.usdaKey, pageSize: 15 }), opts.noCache);

  // generic → USDA generic types only; packaged → OFF + USDA Branded; restaurant → USDA Branded + OFF;
  // all (the diary search box) → USDA generic + OFF, plus USDA Branded when a real key is set
  // (the shared DEMO_KEY allows only a handful of calls an hour).
  const usdaKinds: LookupKind[] = kind === "generic" ? ["generic"] : kind === "all" ? (hasKey ? ["generic", "packaged"] : ["generic"]) : ["packaged"];
  const [usdaParts, off] = await Promise.all([
    Promise.all(usdaKinds.map(usdaCall)),
    kind !== "generic" ? cached(`off|${lower}`, () => searchOFF(q, { ...common, pageSize: 12 }), opts.noCache) : none,
  ]);
  const usda: SourceResult = {
    results: usdaParts.flatMap((p) => p.results),
    status: usdaParts.map((p) => p.status).reduce((a, b) => (rankStatus(b) > rankStatus(a) ? b : a), "skipped" as SourceStatus),
  };

  const merged: FoodSearchResult[] = [];
  const seen = new Set<string>();
  for (const r of [...usda.results, ...off.results]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(r);
  }
  const ranked = rankResults(q, merged, { kind });
  // In the general search, whole foods (USDA Foundation / SR Legacy / Survey) that match lead,
  // then products — people searching "greek yogurt" usually want the plain food first.
  // Only a whole food that covers every query word leads: "fairlife protein shake" must not
  // open with a generic USDA shake just because "protein shake" matched.
  const isGeneric = (r: FoodSearchResult) => r.source === "usda" && r.dataType !== "Branded";
  const leads = (m: (typeof ranked)[number]) => isGeneric(m.result) && m.score >= 0.5 && m.coverage >= 0.99;
  const ordered = kind === "all" ? [...ranked.filter(leads), ...ranked.filter((m) => !leads(m))] : ranked;
  const results = ordered.map((m) => m.result).slice(0, opts.limit ?? 20);
  return { results, status: overallStatus(usda.status, off.status, results.length), sources: { usda: usda.status, off: off.status } };
}
