// "Make this easier" with AI (docs/MEALS.md §5, optional). The app's deterministic simplifier
// (engine/simplify.ts) runs first in the browser; this route is the fallback when that finds
// nothing. Auth required; counts toward the daily meals_ai cap. The model's version is
// validated exactly like new AI recipes, must be the same meal and genuinely easier, and its
// nutrition is recomputed. An accepted version is stored in the user's recipes (origin
// "simplified", base_key = the original). Without GEMINI_API_KEY: an honest 503.

import { randomUUID } from "node:crypto";
import { aiErrorResponse, generateJSON, isMock } from "@/lib/ai/gemini";
import { chargeUsage } from "@/lib/ai/usage";
import { prefsFromRow, recipeFromRow, recipeToRow } from "@/lib/data/meals-model";
import { acceptAISimplified, aiCatalog, AISimplifyRequest, mockSimplify, SIMPLIFY_SYSTEM, simplifyChanges, simplifyResponseSchema, simplifyUserText, type AISimplifyResponse } from "@/lib/meals/ai";
import { getLibraryRecipe } from "@/lib/meals/library";
import { validateRecipe } from "@/lib/meals/recipe";
import type { Recipe } from "@/lib/meals/types";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}) => Response.json({ error, code, ...extra }, { status, headers: { "cache-control": "no-store" } });
const NOT_CONFIGURED = "Meal AI isn't connected yet. It needs a GEMINI_API_KEY on the server.";

export async function GET() {
  const { user } = await requireUser();
  if (!user) return fail(401, "unauthorized", "Your session expired. Sign in again.");
  return Response.json({ configured: !!process.env.GEMINI_API_KEY || isMock(), mock: isMock() }, { headers: { "cache-control": "private, no-store" } });
}

/** The recipe to simplify: the server's own copy of a library recipe, or the user's recipe validated. */
function readRecipe(input: unknown): Recipe | null {
  if (!input || typeof input !== "object") return null;
  const key = (input as { key?: unknown }).key;
  if (typeof key === "string" && key.startsWith("lib:")) return getLibraryRecipe(key) ?? null;
  const { nutrition: _n, allergens: _a, kinds: _k, ...rest } = input as Recipe;
  const v = validateRecipe({ ...rest, ingredients: Array.isArray(rest.ingredients) ? rest.ingredients.map((l) => (l && typeof l === "object" ? (({ grams: _g, ...x }) => x)(l) : l)) : rest.ingredients });
  return v.ok ? v.recipe : null;
}

/** POST { recipe, localDate } → AISimplifyResponse. 422 when the model's version fails the checks. */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return fail(401, "unauthorized", "Your session expired. Sign in again.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request", "Couldn't read that request.");
  }
  const parsed = AISimplifyRequest.safeParse(body);
  if (!parsed.success) return fail(400, "bad_request", parsed.error.issues[0]?.message ?? "That request wasn't valid.");
  const original = readRecipe(parsed.data.recipe);
  if (!original) return fail(400, "bad_request", "That recipe couldn't be read.");
  const mock = isMock();
  if (!mock && !process.env.GEMINI_API_KEY) return fail(503, "not_configured", NOT_CONFIGURED);

  try {
    const prefsRes = await supabase.from("meal_prefs").select("*").maybeSingle();
    if (prefsRes.error) throw new Error(prefsRes.error.message);
    const prefs = prefsFromRow(prefsRes.data);
    const catalog = aiCatalog(prefs);

    let raw: unknown;
    let model: string;
    if (mock) {
      await new Promise((r) => setTimeout(r, 900));
      raw = mockSimplify(original);
      model = "dev-mock";
    } else {
      await chargeUsage(supabase, "meals_ai", parsed.data.localDate);
      const res = await generateJSON<unknown>({
        system: SIMPLIFY_SYSTEM,
        contents: [{ role: "user", parts: [{ text: simplifyUserText(original, prefs, catalog) }] }],
        schema: simplifyResponseSchema(catalog.map((c) => c.key)),
        temperature: 0.4,
        maxOutputTokens: 4096,
        timeoutMs: 45_000,
      });
      raw = res.data;
      model = res.model;
    }
    const ans = (raw ?? {}) as { unchanged?: unknown; reason?: unknown; recipe?: unknown; changes?: unknown };
    const tag = mock ? { mock: true as const } : {};

    if (ans.unchanged === true || !ans.recipe) {
      const reason = typeof ans.reason === "string" && ans.reason.trim() ? ans.reason.replace(/\s+/g, " ").trim().slice(0, 200) : "It can't be made easier without becoming a different meal.";
      const out: AISimplifyResponse = { ok: false, unchanged: true, reason, model, ...tag };
      return Response.json(out, { headers: { "cache-control": "no-store" } });
    }

    const res = acceptAISimplified(ans.recipe, original, { prefs, id: randomUUID() });
    if (!res.ok) {
      console.info("[meals-ai] rejected simplification:", JSON.stringify(res.errors));
      return fail(422, "bad_output", "The AI's easier version didn't pass the checks, so the original stays.", { errors: res.errors.slice(0, 4), ...tag });
    }
    const row = recipeToRow(res.recipe, res.recipe.key.slice("usr:".length));
    const ins = await supabase.from("recipes").insert(row).select("*").single();
    if (ins.error) throw new Error(ins.error.message);
    const stored = recipeFromRow(ins.data);
    if (!stored) throw new Error("The recipe couldn't be read back.");
    const out: AISimplifyResponse = { ok: true, recipe: stored, key: stored.key, changes: simplifyChanges(ans.changes, original, stored), model, ...tag };
    return Response.json(out, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
