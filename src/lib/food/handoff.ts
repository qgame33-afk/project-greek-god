// "Research in ChatGPT / Claude" handoff. The in-app AI (Gemini free tier) can't browse,
// so for restaurant orders we hand the user a precise prompt for an assistant that can,
// then parse its fenced JSON answer back into reviewable items. We never fetched those
// pages ourselves, so every link is labelled "reported by <assistant>".

import { z } from "zod";
import { cleanText, isHttpUrl, num, round, tidyMacros, unitLabel } from "./normalize";
import type { MacroSet } from "./types";

export type HandoffAssistant = "chatgpt" | "claude";

export const ASSISTANT_LABEL: Record<HandoffAssistant, string> = { chatgpt: "ChatGPT", claude: "Claude" };

export interface HandoffItemInput {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  portion?: string | null;
  restaurant?: string | null;
}

export interface HandoffRequest {
  /** What the user said they ate, verbatim where possible. */
  description: string;
  items: HandoffItemInput[];
  country: string;
  restaurant?: string | null;
}

export const HANDOFF_JSON_EXAMPLE = `{
  "restaurant": "Domino's",
  "country": "United States",
  "items": [
    {
      "name": "Medium (12\\") Hand Tossed Pepperoni Pizza, 1 slice",
      "quantity": 6,
      "unit": "slice",
      "calories_per_unit": 200,
      "protein_g_per_unit": 8,
      "carbs_g_per_unit": 24,
      "fat_g_per_unit": 8,
      "source_name": "Domino's US Nutrition Guide",
      "source_url": "https://example.com/exact-page-you-used",
      "notes": "Values per slice, 8 slices per medium pizza"
    }
  ]
}`;

/** The prompt we hand to ChatGPT / Claude. Precise about sources, quantities and format. */
export function buildHandoffPrompt(req: HandoffRequest): string {
  const lines = req.items
    .slice(0, 12)
    .map((i) => {
      const qty = i.quantity && i.quantity > 0 ? `${round(i.quantity, 2)} ${unitLabel(i.quantity, i.unit ?? "")}`.trim() : i.portion || "quantity unknown";
      const where = i.restaurant ? ` (from ${i.restaurant})` : "";
      return `- ${i.name}${where}: ${qty}`;
    })
    .join("\n");
  return [
    `Find the official published nutrition for this meal and report it as JSON.`,
    ``,
    `What I ate: "${cleanText(req.description, 400)}"`,
    req.restaurant ? `Restaurant / brand: ${cleanText(req.restaurant, 80)}` : null,
    `Country: ${cleanText(req.country, 60)} (use that country's menu and nutrition data)`,
    `Items and quantities:`,
    lines || "- (see description)",
    ``,
    `Rules:`,
    `1. Look up the actual published values. Prefer, in order: the restaurant's official nutrition page or PDF, the manufacturer's label, USDA FoodData Central, then another identifiable nutrition database.`,
    `2. Match the exact order: country, size, crust or bread, toppings, sauces, dips and the number of pieces or slices.`,
    `3. Give values for ONE unit (one slice, one wing, one item) and the quantity I ate, so totals = per-unit × quantity.`,
    `4. Include the exact URL of the page you used for each item. If you cannot find a published value, still include the item with your best estimate, leave source_url empty and say "estimate" in notes. Never invent a URL.`,
    ``,
    `Reply with a short summary, then exactly one fenced code block that starts with \`\`\`json, in this format:`,
    "```json",
    HANDOFF_JSON_EXAMPLE,
    "```",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

const MAX_URL_PROMPT = 7000;

/** chatgpt.com / claude.ai prefill links (undocumented `q=` prefill, so we also offer Copy). */
export function handoffUrl(assistant: HandoffAssistant, prompt: string): string {
  const p = prompt.length > MAX_URL_PROMPT ? prompt.slice(0, MAX_URL_PROMPT) : prompt;
  const q = encodeURIComponent(p);
  return assistant === "chatgpt" ? `https://chatgpt.com/?q=${q}` : `https://claude.ai/new?q=${q}`;
}

/** Best-effort country name from the browser locale ("en-US" → "United States"). */
export function countryFromLocale(locale: string | undefined): string {
  const region = locale?.split(/[-_]/)[1]?.toUpperCase();
  if (!region || region.length !== 2) return "United States";
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(region);
    return name || "United States";
  } catch {
    return "United States";
  }
}

/* ---------------------------------------------------------------- parser */

const looseNum = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => num(v));

const RawItem = z.object({
  name: z.string().min(1),
  quantity: looseNum,
  unit: z.string().optional().nullable(),
  calories_per_unit: looseNum,
  protein_g_per_unit: looseNum,
  carbs_g_per_unit: looseNum,
  fat_g_per_unit: looseNum,
  // tolerate assistants that give totals instead
  calories: looseNum,
  protein_g: looseNum,
  carbs_g: looseNum,
  fat_g: looseNum,
  source_name: z.string().optional().nullable(),
  source_url: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const RawDoc = z.object({
  restaurant: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  items: z.array(z.unknown()).min(1).max(30),
});

export interface HandoffItem {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  perUnit: MacroSet;
  total: MacroSet;
  sourceName: string | null;
  sourceUrl: string | null;
  notes: string | null;
  /** No usable link: the assistant itself said (or implied) this is an estimate. */
  estimate: boolean;
}

export type HandoffParse =
  { ok: true; restaurant: string | null; country: string | null; items: HandoffItem[]; skipped: number } | { ok: false; error: string };

/** Pull the JSON object out of a pasted reply: a ```json fence, any fence, or the outermost braces. */
export function extractJsonBlock(text: string): string | null {
  const fenced = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  const blocks: string[] = [];
  while ((m = fenced.exec(text))) blocks.push(m[1].trim());
  const withItems = blocks.find((b) => b.startsWith("{") && b.includes('"items"'));
  if (withItems) return withItems;
  if (blocks.length) return blocks.find((b) => b.startsWith("{")) ?? null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

export function parseHandoffResult(text: string): HandoffParse {
  if (!text || text.trim().length < 10) return { ok: false, error: "Paste the assistant's full reply, including the ```json block." };
  if (text.length > 60_000) return { ok: false, error: "That's too long to be one reply. Paste just the answer with the ```json block." };
  const block = extractJsonBlock(text);
  if (!block) return { ok: false, error: "No ```json block found. Ask the assistant to reply in the requested JSON format." };
  let data: unknown;
  try {
    data = JSON.parse(block.replace(/,\s*([}\]])/g, "$1")); // forgive trailing commas
  } catch {
    return { ok: false, error: "The JSON block couldn't be read. Copy the whole block exactly as the assistant wrote it." };
  }
  const doc = RawDoc.safeParse(data);
  if (!doc.success) return { ok: false, error: 'The JSON needs an "items" list. Ask the assistant to use the requested format.' };

  const items: HandoffItem[] = [];
  let skipped = 0;
  doc.data.items.forEach((raw, i) => {
    const r = RawItem.safeParse(raw);
    if (!r.success) {
      skipped++;
      return;
    }
    const it = r.data;
    const quantity = it.quantity != null && it.quantity > 0 && it.quantity <= 100 ? round(it.quantity, 2) : 1;
    let perUnit: MacroSet | null = null;
    if (it.calories_per_unit != null) {
      perUnit = tidyMacros({
        calories: it.calories_per_unit,
        protein: it.protein_g_per_unit ?? 0,
        carbs: it.carbs_g_per_unit ?? 0,
        fat: it.fat_g_per_unit ?? 0,
      });
    } else if (it.calories != null) {
      perUnit = tidyMacros({
        calories: it.calories / quantity,
        protein: (it.protein_g ?? 0) / quantity,
        carbs: (it.carbs_g ?? 0) / quantity,
        fat: (it.fat_g ?? 0) / quantity,
      });
    }
    if (!perUnit || perUnit.calories > 5000 || (perUnit.calories === 0 && perUnit.protein + perUnit.carbs + perUnit.fat === 0)) {
      skipped++;
      return;
    }
    const total = tidyMacros({
      calories: perUnit.calories * quantity,
      protein: perUnit.protein * quantity,
      carbs: perUnit.carbs * quantity,
      fat: perUnit.fat * quantity,
    });
    const url = it.source_url?.trim();
    const sourceUrl = isHttpUrl(url) && !/example\.com/i.test(url) ? url : null;
    const notes = cleanText(it.notes ?? "", 160) || null;
    items.push({
      key: `h${i}`,
      name: cleanText(it.name, 120) || `Item ${i + 1}`,
      quantity,
      unit: cleanText(it.unit ?? "", 24) || "serving",
      perUnit,
      total,
      sourceName: sourceUrl ? cleanText(it.source_name ?? "", 60) || hostOf(sourceUrl) : null,
      sourceUrl,
      notes,
      estimate: !sourceUrl || /estimat/i.test(notes ?? ""),
    });
  });
  if (!items.length) return { ok: false, error: "None of the items had usable numbers. Ask for calories and macros per unit." };
  return {
    ok: true,
    restaurant: cleanText(doc.data.restaurant ?? "", 60) || null,
    country: cleanText(doc.data.country ?? "", 60) || null,
    items,
    skipped,
  };
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}
