// AI recipes for the meal planner (docs/MEALS.md §5, optional). Auth required; counts toward the
// daily meals_ai cap. The model may only use ingredient keys from the user's catalog (allergens
// and dislikes removed); every recipe is then validated, its nutrition recomputed from the
// ingredient database, and checked against the user's stored hard constraints and cooking
// level. Accepted recipes are added to the user's own pool (recipes, origin "ai") and their
// keys returned; nothing is planned or logged. Without GEMINI_API_KEY: an honest 503.

import { randomUUID } from "node:crypto";
import { AIError, aiErrorResponse, generateJSON, isMock } from "@/lib/ai/gemini";
import { chargeUsage } from "@/lib/ai/usage";
import { feedbackFromRow, prefsFromRow, recipeFromRow, recipeToRow, type MealFeedback } from "@/lib/data/meals-model";
import { acceptAIRecipe, aiCatalog, AIRecipesRequest, MOCK_RECIPES, RECIPES_SYSTEM, recipesResponseSchema, recipesUserText, slotLibraryNames, summaryForPrompt, takenNames, type AIRecipesResponse } from "@/lib/meals/ai";
import { learnPrefs, summarizeLearning } from "@/lib/meals/engine/prefs";
import { getLibraryRecipe } from "@/lib/meals/library";
import type { Recipe } from "@/lib/meals/types";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}) => Response.json({ error, code, ...extra }, { status, headers: { "cache-control": "no-store" } });
const NOT_CONFIGURED = "Meal AI isn't connected yet. It needs a GEMINI_API_KEY on the server. The recipe library and planner work without it.";

/** Capability check so the planner can say "not connected" before anyone taps. */
export async function GET() {
  const { user } = await requireUser();
  if (!user) return fail(401, "unauthorized", "Your session expired. Sign in again.");
  return Response.json({ configured: !!process.env.GEMINI_API_KEY || isMock(), mock: isMock() }, { headers: { "cache-control": "private, no-store" } });
}

/**
 * POST { slot, count?, localDate, targets?, exclude?, summary? } → AIRecipesResponse.
 * 422 with the reasons when no recipe passes the checks (nothing is stored then).
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return fail(401, "unauthorized", "Your session expired. Sign in again.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request", "Couldn't read that request.");
  }
  const parsed = AIRecipesRequest.safeParse(body);
  if (!parsed.success) return fail(400, "bad_request", parsed.error.issues[0]?.message ?? "That request wasn't valid.");
  const req = parsed.data;
  const mock = isMock();
  if (!mock && !process.env.GEMINI_API_KEY) return fail(503, "not_configured", NOT_CONFIGURED);

  try {
    // hard constraints, names and taste come from the database (RLS: this user's rows), never the request
    const since = new Date(Date.now() - 365 * 86_400_000).toISOString();
    const [prefsRes, namesRes, feedbackRes] = await Promise.all([
      supabase.from("meal_prefs").select("*").maybeSingle(),
      supabase.from("recipes").select("name").order("created_at", { ascending: false }).limit(500),
      req.summary ? Promise.resolve(null) : supabase.from("meal_feedback").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
    ]);
    if (prefsRes.error || namesRes.error || feedbackRes?.error) throw new Error((prefsRes.error ?? namesRes.error ?? feedbackRes?.error)!.message);
    const prefs = prefsFromRow(prefsRes.data);
    const userNames = (namesRes.data ?? []).map((r) => r.name);
    const feedback = (feedbackRes?.data ?? []).map(feedbackFromRow).filter((f): f is MealFeedback => !!f);
    const summary = req.summary ?? summaryForPrompt(summarizeLearning(learnPrefs(feedback, new Date())));
    const catalog = aiCatalog(prefs);
    const avoid = [...new Set([...slotLibraryNames(req.slot), ...userNames, ...req.exclude.map((e) => getLibraryRecipe(e)?.name ?? e).filter((e) => !e.startsWith("usr:"))])];
    const taken = takenNames(userNames);

    let raw: unknown;
    let model: string;
    if (mock) {
      await new Promise((r) => setTimeout(r, 900)); // lets the loading state be exercised locally
      raw = { recipes: MOCK_RECIPES[req.slot].filter((f) => !taken.has(f.name.toLowerCase())) };
      model = "dev-mock";
    } else {
      await chargeUsage(supabase, "meals_ai", req.localDate);
      const res = await generateJSON<unknown>({
        system: RECIPES_SYSTEM,
        contents: [{ role: "user", parts: [{ text: recipesUserText({ ...req, summary }, prefs, catalog, avoid) }] }],
        schema: recipesResponseSchema(catalog.map((c) => c.key)),
        temperature: 0.8,
        maxOutputTokens: 8192,
        timeoutMs: 50_000,
      });
      raw = res.data;
      model = res.model;
    }

    const list = Array.isArray((raw as { recipes?: unknown })?.recipes) ? (raw as { recipes: unknown[] }).recipes.slice(0, req.count) : [];
    if (!list.length) {
      if (mock) return fail(422, "bad_output", "Every dev mock recipe for this slot is already in your recipes.", { mock: true });
      throw new AIError("bad_output", "The AI didn't return any recipes. Try again.", 502);
    }

    const accepted: Recipe[] = [];
    const rejected: { name: string; errors: string[] }[] = [];
    for (const item of list) {
      const res = acceptAIRecipe(item, { prefs, slot: req.slot, takenNames: taken, id: randomUUID(), origin: "ai" });
      if (res.ok) {
        accepted.push(res.recipe);
        taken.add(res.recipe.name.toLowerCase());
      } else rejected.push({ name: res.name, errors: res.errors.slice(0, 4) });
    }
    if (rejected.length) console.info("[meals-ai] rejected recipes:", JSON.stringify(rejected));
    if (!accepted.length) {
      return fail(422, "bad_output", "None of the AI's recipes passed the checks, so nothing was saved. Try again.", { rejected, ...(mock ? { mock: true } : {}) });
    }

    const rows = accepted.map((r) => recipeToRow(r, r.key.slice("usr:".length)));
    const ins = await supabase.from("recipes").insert(rows).select("*");
    if (ins.error) throw new Error(ins.error.message);
    const stored = (ins.data ?? []).map(recipeFromRow).filter((r): r is Recipe => !!r);
    const out: AIRecipesResponse = { recipes: stored, keys: stored.map((r) => r.key), rejected: rejected.length, model, ...(mock ? { mock: true as const } : {}) };
    return Response.json(out, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
