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

export type UsdaStatus = "ok" | "demo_key" | "error" | "unconfigured";
export type OffStatus = "ok" | "error";

export interface SearchResponse {
  results: SearchResult[];
  status: { usda: UsdaStatus | null; off: OffStatus | null };
}

export function parseSearchResponse(json: unknown): SearchResponse {
  const obj = (json && typeof json === "object" ? json : {}) as { results?: unknown; status?: { usda?: unknown; off?: unknown } };
  const raw = Array.isArray(obj.results) ? obj.results : [];
  const results: SearchResult[] = [];
  for (const r of raw) {
    const p = searchResultSchema.safeParse(r);
    if (p.success) results.push(p.data);
  }
  const usda = (["ok", "demo_key", "error", "unconfigured"] as const).find((s) => s === obj.status?.usda) ?? null;
  const off = (["ok", "error"] as const).find((s) => s === obj.status?.off) ?? null;
  return { results, status: { usda, off } };
}

/** Honest one-line notes about which databases answered. */
export function statusNotes(status: SearchResponse["status"]): string[] {
  const notes: string[] = [];
  if (status.usda === "unconfigured") notes.push("USDA isn't connected (no API key on the server).");
  else if (status.usda === "demo_key") notes.push("USDA is on the shared demo key, so it may be rate-limited.");
  else if (status.usda === "error") notes.push("USDA didn't respond.");
  if (status.off === "error") notes.push("Open Food Facts didn't respond.");
  return notes;
}

export class SearchUnavailableError extends Error {
  constructor(
    message: string,
    public kind: "unavailable" | "auth" | "offline" | "failed",
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
