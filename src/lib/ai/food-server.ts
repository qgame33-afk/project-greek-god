import "server-only";

// Server glue for the food AI routes: request validation, database lookup binding and
// small response helpers. The AI and pipeline logic live in food-pipeline.ts.

import { z } from "zod";
import { searchFoods } from "@/lib/food/search";
import type { LookupFn } from "./food-pipeline";

export const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "localDate must be YYYY-MM-DD");

/** ~6.7 MB of base64 ≈ 5 MB JPEG — far above what the client sends after resizing. */
export const IMAGE_DATA_URL = z
  .string()
  .max(9_000_000, "That photo is too large. The app resizes photos before upload — try again.")
  .regex(/^data:image\/(jpeg|png|webp|heic|heif);base64,[A-Za-z0-9+/=]+$/, "That image format isn't supported. Use a JPEG or PNG photo.");

export const PhotoBody = z.object({
  image: IMAGE_DATA_URL,
  localDate: ISO_DATE,
  answers: z
    .array(z.object({ questionId: z.string().min(1).max(60), question: z.string().max(200).optional(), answer: z.string().min(1).max(140) }))
    .max(8)
    .optional(),
  context: z.string().max(500).optional(),
});

export const ChatBody = z.object({
  conversationId: z.string().uuid().optional().nullable(),
  clientMessageId: z.string().uuid().optional(),
  message: z.string().trim().min(1, "Type a message first.").max(1000, "Keep messages under 1,000 characters."),
  image: IMAGE_DATA_URL.optional().nullable(),
  localDate: ISO_DATE,
});

export function badRequest(error: z.ZodError | string) {
  const msg = typeof error === "string" ? error : (error.issues[0]?.message ?? "That request wasn't valid.");
  return Response.json({ error: msg, code: "bad_request" }, { status: 400 });
}

export function unauthorized() {
  return Response.json({ error: "Your session expired. Sign in again.", code: "unauthorized" }, { status: 401 });
}

export function notConfigured(feature: "photo" | "chat") {
  return Response.json(
    {
      error:
        feature === "photo"
          ? "Photo analysis isn't connected yet. It needs a GEMINI_API_KEY on the server. You can still log the meal manually."
          : "Food Coach isn't connected yet. It needs a GEMINI_API_KEY on the server. You can still log food manually.",
      code: "not_configured",
    },
    { status: 503 },
  );
}

export async function readJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Database lookups for the AI pipeline (USDA key from env, DEMO_KEY otherwise). */
export const serverLookup: LookupFn = (query, kind, signal) =>
  searchFoods(query, { kind, usdaKey: process.env.USDA_API_KEY, timeoutMs: 6000, signal, limit: 15 });

export function lookupKeyStatus(): "key" | "demo_key" {
  return process.env.USDA_API_KEY ? "key" : "demo_key";
}

export function base64ToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl)!;
  return { bytes: new Uint8Array(Buffer.from(m[2], "base64")), mime: m[1] };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
