import { z } from "zod";
import { SUGGESTION_KINDS } from "./types";

export const MAX_MESSAGE_CHARS = 2000;

/** POST /api/ai/coach body. */
export const CoachRequest = z.object({
  conversationId: z.uuid().nullish(),
  message: z.string().trim().min(1, "Type a question first.").max(MAX_MESSAGE_CHARS, `Keep it under ${MAX_MESSAGE_CHARS} characters.`),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "localDate must be YYYY-MM-DD"),
  localTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullish(),
});
export type CoachRequest = z.infer<typeof CoachRequest>;

/**
 * What the model must return. Parsed leniently (unknown keys ignored, arrays defaulted) and
 * then sanitised: suggestions go through validateSuggestions, cited ids through chipsFor.
 */
export const CoachModelReply = z.object({
  answer_markdown: z.string().min(1),
  cited_fact_ids: z.array(z.unknown()).catch([]).default([]),
  suggestions: z.array(z.unknown()).catch([]).default([]),
  follow_ups: z.array(z.unknown()).catch([]).default([]),
});
export type CoachModelReply = z.infer<typeof CoachModelReply>;

/** JSON Schema handed to Gemini (responseJsonSchema). */
export const COACH_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    answer_markdown: {
      type: "string",
      description: "The answer in plain Markdown (paragraphs, bullet lists, bold). No fact ids, no links, no headings bigger than ###.",
    },
    cited_fact_ids: {
      type: "array",
      description: "Ids (without brackets) of every account fact the answer relies on, most important first.",
      items: { type: "string" },
    },
    suggestions: {
      type: "array",
      description: "0–2 proposed setting changes (plus at most one note). Empty when nothing should change.",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: SUGGESTION_KINDS },
          title: { type: "string", description: "Short imperative title, max 8 words." },
          current: { type: "string", description: "The current value as stated in the context." },
          proposed: {
            type: "string",
            description: "calorie_goal: new kcal/day number. protein_goal: new g/day number. water_goal_ml: new mL/day number. training_mode: standard | intro | deload. deload_week: deload. note: empty.",
          },
          rationale: { type: "string", description: "One or two sentences citing the user's numbers." },
        },
        required: ["kind", "title", "proposed", "rationale"],
      },
    },
    follow_ups: {
      type: "array",
      description: "0–3 short follow-up questions the user might ask next (max 60 characters each).",
      items: { type: "string" },
    },
  },
  required: ["answer_markdown", "cited_fact_ids", "suggestions", "follow_ups"],
};

/** Strip anything the UI shouldn't render from model markdown (ids, raw HTML, links, images). */
export function sanitizeAnswer(md: string): string {
  return md
    .replace(/<[^>]{1,200}>/g, "") // raw HTML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\((?:https?:)?\/\/[^)]*\)/g, "$1") // external links → text
    .replace(/\s?\[(?:[a-z]+\.)[a-z0-9._-]+\]/gi, "") // leaked [fact.ids]
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 6000);
}

export function sanitizeFollowUps(xs: unknown[]): string[] {
  const out: string[] = [];
  for (const x of xs) {
    if (typeof x !== "string") continue;
    const s = x.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
    if (s.length < 3 || s.length > 90) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= 3) break;
  }
  return out;
}

/** A conversation title from the first question. */
export function titleFrom(message: string): string {
  const s = message.replace(/\s+/g, " ").trim();
  if (s.length <= 60) return s;
  const cut = s.slice(0, 60);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 30 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}
