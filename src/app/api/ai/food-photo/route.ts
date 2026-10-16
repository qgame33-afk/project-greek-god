import { requireUser } from "@/lib/supabase/server";
import { AIError, aiErrorResponse, generateJSON, imagePart } from "@/lib/ai/gemini";
import { chargeUsage } from "@/lib/ai/usage";
import { PHOTO_RESPONSE_SCHEMA, type PhotoAnalysis } from "@/lib/ai/food-schemas";
import { resolveItems, sanitizePhotoOutput, totalsOf } from "@/lib/ai/food-pipeline";
import { PHOTO_SYSTEM, photoUserText } from "@/lib/ai/food-prompts";
import { MOCK_MODEL, foodMockEnabled, mockPhoto } from "@/lib/ai/food-mock";
import { PhotoBody, badRequest, lookupKeyStatus, notConfigured, readJson, serverLookup, sleep, unauthorized } from "@/lib/ai/food-server";

export const maxDuration = 60;

/** Capability check so the scanner can say "not connected" before the user takes a photo. */
export async function GET(request: Request) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const mock = foodMockEnabled(request.headers);
  return Response.json({ configured: mock || !!process.env.GEMINI_API_KEY, mock, usda: lookupKeyStatus() });
}

/**
 * POST { image: dataURL, localDate, answers?, context? } → PhotoAnalysis.
 * Gemini identifies foods and portions; the server looks each item up in USDA / Open
 * Food Facts and computes macros from real per-100 g data where a confident match
 * exists. Nothing is saved — the client logs only after the user confirms.
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const parsed = PhotoBody.safeParse(await readJson(request));
  if (!parsed.success) return badRequest(parsed.error);
  const { image, localDate, answers = [], context } = parsed.data;
  const mock = foodMockEnabled(request.headers);

  if (!mock && !process.env.GEMINI_API_KEY) return notConfigured("photo");

  try {
    const part = imagePart(image); // validates format and size
    let raw: unknown;
    let model: string;
    if (mock) {
      await sleep(1400);
      raw = mockPhoto(answers);
      model = MOCK_MODEL;
    } else {
      await chargeUsage(supabase, "food_photo", localDate);
      const res = await generateJSON<unknown>({
        system: PHOTO_SYSTEM,
        contents: [{ role: "user", parts: [part, { text: photoUserText({ answers, context }) }] }],
        schema: PHOTO_RESPONSE_SCHEMA,
        temperature: 0.2,
        timeoutMs: 40_000,
      });
      raw = res.data;
      model = res.model;
    }

    const clean = sanitizePhotoOutput(raw, new Set(answers.map((a) => a.questionId)));
    if (!clean.items.length && !clean.not_food) throw new AIError("bad_output", "No foods could be identified. Try a clearer, closer photo.", 422);
    const { items, lookup } = await resolveItems(clean.items, { lookup: serverLookup, budgetMs: 9000 });

    const body: PhotoAnalysis = {
      items,
      totals: totalsOf(items),
      overall_confidence: clean.overall_confidence,
      caveats: clean.caveats,
      questions: clean.questions,
      not_food: clean.not_food,
      model,
      lookup,
      ...(mock ? { mock: true } : {}),
    };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
