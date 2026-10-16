// Contract for GET /api/food/search?q= (built by the ai-food area). Parsed leniently:
// malformed results are dropped rather than shown with made-up numbers.

import { z } from "zod";

const macro = z.coerce.number().finite().min(0);
const macroSet = z.object({ calories: macro, protein: macro, carbs: macro, fat: macro });

export const searchResultSchema = z.object({
  id: z.coerce.string(),
  name: z.string().min(1),
  brand: z.string().nullish().transform((v) => (v ? v : null)),
  source: z.enum(["usda", "off"]),
  sourceName: z.string().nullish().transform((v) => v ?? null),
  sourceUrl: z.string().nullish().transform((v) => v ?? null),
  servingAmount: z.coerce.number().positive().catch(1),
  servingUnit: z.string().min(1).catch("serving"),
  servingGrams: z.coerce.number().positive().nullish().catch(null).transform((v) => v ?? null),
  per100g: macroSet.nullish().catch(null).transform((v) => v ?? null),
  perServing: macroSet,
});

export type SearchResult = z.infer<typeof searchResultSchema>;

/** Health of one database for a search, as /api/food/search reports it in `sources`. */
export type SourceState = "ok" | "demo_key" | "rate_limited" | "timeout" | "error" | "skipped" | "unconfigured";
/** The route's overall string status: "unavailable" = every database failed and nothing came back. */
export type OverallStatus = "ok" | "demo_key" | "partial" | "unavailable";

export interface SearchResponse {
  results: SearchResult[];
  status: { usda: SourceState | null; off: SourceState | null; overall: OverallStatus | null };
}

const SOURCE_STATES: readonly SourceState[] = ["ok", "demo_key", "rate_limited", "timeout", "error", "skipped", "unconfigured"];
const OVERALL: readonly OverallStatus[] = ["ok", "demo_key", "partial", "unavailable"];
const pick = <T extends string>(list: readonly T[], v: unknown): T | null => list.find((s) => s === v) ?? null;
const down = (s: SourceState | null) => s === "rate_limited" || s === "timeout" || s === "error";

/**
 * The route answers `{ results, status: "ok" | "demo_key" | "partial" | "unavailable", sources: { usda, off } }`.
 * An older shape put the per-database states in `status` itself; both are read.
 */
export function parseSearchResponse(json: unknown): SearchResponse {
  const obj = (json && typeof json === "object" ? json : {}) as { results?: unknown; status?: unknown; sources?: { usda?: unknown; off?: unknown } };
  const raw = Array.isArray(obj.results) ? obj.results : [];
  const results: SearchResult[] = [];
  for (const r of raw) {
    const p = searchResultSchema.safeParse(r);
    if (p.success) results.push(p.data);
  }
  const legacy = obj.status && typeof obj.status === "object" ? (obj.status as { usda?: unknown; off?: unknown }) : null;
  const per = obj.sources && typeof obj.sources === "object" ? obj.sources : legacy;
  const usda = pick(SOURCE_STATES, per?.usda);
  const off = pick(SOURCE_STATES, per?.off);
  let overall = pick(OVERALL, obj.status);
  // never read a total outage as "no matches": nothing back and no database answered = unavailable
  if (!overall && results.length === 0 && (down(usda) || down(off)) && !(usda === "ok" || usda === "demo_key" || off === "ok")) overall = "unavailable";
  return { results, status: { usda, off, overall } };
}

/** True when no database answered, so an empty list means "couldn't search", not "no matches". */
export function searchUnavailable(r: SearchResponse): boolean {
  return r.results.length === 0 && r.status.overall === "unavailable";
}

/** Honest one-line notes about which databases answered (and why one didn't). */
export function statusNotes(status: SearchResponse["status"]): string[] {
  const notes: string[] = [];
  const offUp = status.off === "ok";
  const usdaUp = status.usda === "ok" || status.usda === "demo_key";
  if (status.usda === "unconfigured") notes.push("USDA isn't connected (no API key on the server).");
  else if (status.usda === "rate_limited") notes.push(`USDA is rate-limited right now.${offUp ? " Showing Open Food Facts only." : ""}`);
  else if (status.usda === "timeout" || status.usda === "error") notes.push(`USDA didn't respond.${offUp ? " Showing Open Food Facts only." : ""}`);
  else if (status.usda === "demo_key") notes.push("USDA is on the shared demo key, so it may be rate-limited.");
  if (status.off === "rate_limited") notes.push(`Open Food Facts is rate-limited right now.${usdaUp ? " Showing USDA only." : ""}`);
  else if (down(status.off)) notes.push(`Open Food Facts didn't respond.${usdaUp ? " Showing USDA only." : ""}`);
  return notes;
}

export class SearchUnavailableError extends Error {
  constructor(
    message: string,
    public kind: "unavailable" | "auth" | "offline" | "failed" | "down",
  ) {
    super(message);
  }
}

/** Map a failed fetch to a user-facing message. */
export function searchErrorFor(status: number | "network"): SearchUnavailableError {
  if (status === "network") return new SearchUnavailableError("You're offline or the connection dropped.", "offline");
  if (status === 404) return new SearchUnavailableError("Food search is unavailable.", "unavailable");
  if (status === 401) return new SearchUnavailableError("Your session expired. Sign in again.", "auth");
  return new SearchUnavailableError("Food search didn't respond.", "failed");
}
