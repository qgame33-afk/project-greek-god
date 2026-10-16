import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { searchFoods } from "@/lib/food/search";
import type { LookupKind, SearchResponse } from "@/lib/food/types";

/**
 * GET /api/food/search?q=greek%20yogurt[&kind=generic|packaged|all]
 * → { results: FoodSearchResult[], status: "ok" | "demo_key" | "partial" | "unavailable", sources }
 * Real database records only (USDA FoodData Central, Open Food Facts). Signed-in users only.
 */
export async function GET(request: NextRequest) {
  const { user } = await requireUser();
  if (!user) return Response.json({ error: "Not signed in", code: "unauthorized" }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
  const kindParam = request.nextUrl.searchParams.get("kind");
  const kind: LookupKind = kindParam === "generic" || kindParam === "packaged" ? kindParam : "all";
  if (q.length < 2) {
    const empty: SearchResponse = { results: [], status: "ok", sources: { usda: "skipped", off: "skipped" } };
    return Response.json(empty);
  }
  if (q.length > 100) return Response.json({ error: "Search is limited to 100 characters.", code: "bad_request" }, { status: 400 });

  const res = await searchFoods(q, { kind, usdaKey: process.env.USDA_API_KEY, timeoutMs: 6500, signal: request.signal });
  return Response.json(res, { headers: { "cache-control": "private, max-age=300" } });
}
