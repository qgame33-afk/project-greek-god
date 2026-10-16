// Food AI pipeline (pure, testable): validate + sanitise model output, look items up in real
// databases, compute macros deterministically from per-100 g × grams, label provenance and
// recompute totals. Nothing here touches the database or trusts a URL from the model.

import { z } from "zod";
import { confidentMatches } from "@/lib/food/match";
import {
  DATABASE_HOSTS,
  clamp,
  cleanMarkdown,
  cleanText,
  isAllowedUrl,
  macrosForGrams,
  num,
  round,
  scaleMacroSet,
  sumMacroSets,
  tidyMacros,
} from "@/lib/food/normalize";
import type { LookupKind, MacroSet, SearchResponse, SourceStatus } from "@/lib/food/types";
import { PREPARATIONS, type AIFoodItem, type AIQuestion, type ChatIntent, type FoodKind, type LookupSummary, type MealHint } from "./food-schemas";

/** Per-item ceilings for model estimates (stricter than the per-entry DB limits). */
const ITEM_LIMITS: MacroSet = { calories: 8000, protein: 600, carbs: 1200, fat: 600 };
const MAX_ITEMS = 15;

/* ------------------------------------------------------------ raw parsing */

const loose = z.unknown().transform((v) => num(v));
const str = z.unknown().transform((v) => (typeof v === "string" ? v : ""));

const RawItem = z.object({
  name: str,
  portion_description: str.optional(),
  estimated_grams: loose.optional(),
  quantity: loose.optional(),
  unit: str.optional(),
  preparation: str.optional(),
  kind: str.optional(),
  brand: str.optional(),
  est_calories: loose.optional(),
  est_protein: loose.optional(),
  est_carbs: loose.optional(),
  est_fat: loose.optional(),
  confidence: loose.optional(),
  search_query: str.optional(),
  saved_food_id: str.optional(),
});

const RawQuestion = z.object({ id: str.optional(), question: str, options: z.array(z.unknown()).optional() });

export interface SanitizedItem {
  name: string;
  portion: string;
  grams: number | null;
  quantity: number;
  unit: string;
  preparation: string;
  kind: FoodKind;
  brand: string | null;
  estimate: MacroSet;
  confidence: number;
  searchQuery: string;
  savedFoodId: string | null;
}

export function sanitizeItem(raw: unknown, savedIds: Set<string> = new Set()): SanitizedItem | null {
  const p = RawItem.safeParse(raw);
  if (!p.success) return null;
  const r = p.data;
  const name = cleanText(r.name, 80);
  if (!name) return null;
  const grams = r.estimated_grams != null && r.estimated_grams > 0 && r.estimated_grams <= 5000 ? round(r.estimated_grams, 0) : null;
  // counts ("6 slice") stay small; weights/volumes ("250 g") can be large
  const quantity = r.quantity != null && r.quantity > 0 && r.quantity <= 5000 ? round(r.quantity, 2) : 1;
  const prepRaw = cleanText(r.preparation ?? "", 24).toLowerCase();
  const preparation = (PREPARATIONS as readonly string[]).includes(prepRaw) ? prepRaw : prepRaw ? prepRaw.slice(0, 24) : "unknown";
  const kindRaw = (r.kind ?? "").toLowerCase();
  const kind: FoodKind = kindRaw === "packaged" || kindRaw === "restaurant" ? kindRaw : "generic";
  const brand = cleanText(r.brand ?? "", 60) || null;
  const savedRaw = (r.saved_food_id ?? "").trim();
  return {
    name,
    portion: cleanText(r.portion_description ?? "", 80),
    grams,
    quantity,
    unit: (cleanText(r.unit ?? "", 24) || (grams ? "g" : "serving")).toLowerCase(),
    preparation,
    kind: kind === "generic" && brand ? "packaged" : kind,
    brand,
    estimate: tidyMacros({ calories: r.est_calories ?? 0, protein: r.est_protein ?? 0, carbs: r.est_carbs ?? 0, fat: r.est_fat ?? 0 }, ITEM_LIMITS),
    confidence: r.confidence == null ? 0.5 : round(clamp(r.confidence, 0, 1), 2),
    searchQuery: cleanText(r.search_query ?? "", 80) || name,
    savedFoodId: savedRaw && savedIds.has(savedRaw) ? savedRaw : null,
  };
}

export function sanitizeQuestions(raw: unknown, answeredIds: Set<string> = new Set()): AIQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: AIQuestion[] = [];
  const ids = new Set<string>();
  for (const q of raw.slice(0, 6)) {
    const p = RawQuestion.safeParse(q);
    if (!p.success) continue;
    const question = cleanText(p.data.question, 140);
    const options = [...new Set((p.data.options ?? []).map((o) => cleanText(o, 40)).filter(Boolean))].slice(0, 5);
    if (!question || options.length < 2) continue;
    let id = (
      (p.data.id ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "") || `q${out.length + 1}`
    ).slice(0, 40);
    if (answeredIds.has(id)) continue;
    while (ids.has(id)) id = `${id}_${out.length + 1}`;
    ids.add(id);
    out.push({ id, question, options });
    if (out.length >= 3) break;
  }
  return out;
}

export function sanitizeStringList(raw: unknown, max: number, len: number): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((s) => cleanText(s, len)).filter(Boolean))].slice(0, max);
}

/* --------------------------------------------- honesty guard for replies */

const RESEARCH_CLAIM =
  /\b(I|I've|I have|we|we've)\s+(just\s+)?(looked( it)? up|searched|browsed|checked (their|the|domino|mcdonald|the official)|found (it |this )?(online|on (the|their) (web|site|website))|pulled|retrieved|verified)\b|\baccording to (the |their )?(official |restaurant'?s? )?(website|site|nutrition (guide|page|calculator))\b|\b(verified|official) (values|numbers|nutrition)\b/i;

/** Remove sentences in which the model claims research it cannot have done. */
export function stripResearchClaims(text: string): string {
  if (!RESEARCH_CLAIM.test(text)) return text;
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !RESEARCH_CLAIM.test(s))
    .join(" ")
    .trim();
}

/**
 * The model states its own total ("About **1,000 kcal**"), but the card shows totals
 * recomputed from database values. Rewrite a mention of the model's whole-meal total so
 * the sentence and the card agree; per-item numbers and anything else are left alone.
 */
export function alignReplyKcal(reply: string, modelTotal: number, total: number): string {
  if (!reply || !(modelTotal > 0) || !(total > 0) || Math.abs(modelTotal - total) < 1) return reply;
  const tolerance = Math.max(25, modelTotal * 0.06);
  return reply.replace(/\b(\d{1,2},\d{3}|\d{2,5})(\s*)(kcal|calories)\b/gi, (match, n: string, space: string, unit: string) => {
    const v = Number(n.replace(/,/g, ""));
    if (Math.abs(v - modelTotal) > tolerance) return match;
    return `${Math.round(total).toLocaleString("en-US")}${space}${unit}`;
  });
}

export function sanitizeReply(raw: unknown): string {
  const md = cleanMarkdown(raw, 1600);
  return stripResearchClaims(md) || "";
}

/* -------------------------------------------------------- model outputs */

export interface SanitizedPhoto {
  items: SanitizedItem[];
  overall_confidence: number;
  caveats: string[];
  questions: AIQuestion[];
  not_food: boolean;
}

export function sanitizePhotoOutput(raw: unknown, answeredIds: Set<string> = new Set()): SanitizedPhoto {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const items = (Array.isArray(o.items) ? o.items : [])
    .slice(0, MAX_ITEMS)
    .map((i) => sanitizeItem(i))
    .filter((i): i is SanitizedItem => i !== null);
  const oc = num(o.overall_confidence);
  return {
    items,
    overall_confidence: oc == null ? (items.length ? round(items.reduce((a, i) => a + i.confidence, 0) / items.length, 2) : 0) : round(clamp(oc, 0, 1), 2),
    caveats: sanitizeStringList(o.caveats, 3, 160),
    questions: sanitizeQuestions(o.questions, answeredIds),
    not_food: o.not_food === true && items.length === 0,
  };
}

export interface SanitizedChat {
  reply: string;
  intent: ChatIntent;
  needs_clarification: boolean;
  is_revision: boolean;
  meal_hint: MealHint;
  items: SanitizedItem[];
  questions: AIQuestion[];
  corrections: string[];
  notes: string[];
}

const INTENTS: ChatIntent[] = ["log_meal", "correction", "question", "add_to_log", "other"];
const MEAL_HINTS: MealHint[] = ["breakfast", "lunch", "dinner", "snacks", "unknown"];

export function sanitizeChatOutput(raw: unknown, savedIds: Set<string> = new Set()): SanitizedChat {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const items = (Array.isArray(o.items) ? o.items : [])
    .slice(0, MAX_ITEMS)
    .map((i) => sanitizeItem(i, savedIds))
    .filter((i): i is SanitizedItem => i !== null);
  const intent = INTENTS.includes(o.intent as ChatIntent) ? (o.intent as ChatIntent) : items.length ? "log_meal" : "other";
  const questions = sanitizeQuestions(o.questions);
  return {
    reply: sanitizeReply(o.reply),
    intent,
    needs_clarification: o.needs_clarification === true || (questions.length > 0 && items.length === 0),
    is_revision: o.is_revision === true,
    meal_hint: MEAL_HINTS.includes(o.meal_hint as MealHint) ? (o.meal_hint as MealHint) : "unknown",
    items,
    questions,
    corrections: sanitizeStringList(o.corrections, 4, 32),
    notes: sanitizeStringList(o.notes, 3, 160),
  };
}

/* ---------------------------------------------------- database resolution */

export type LookupFn = (query: string, kind: LookupKind, signal?: AbortSignal) => Promise<SearchResponse>;

export interface SavedFoodLite {
  id: string;
  name: string;
  serving_amount: number;
  serving_unit: string;
  grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface ResolveDeps {
  lookup: LookupFn | null;
  saved?: SavedFoodLite[];
  /** Overall time budget for all lookups. */
  budgetMs?: number;
  concurrency?: number;
}

/** Ratio window within which a database density is accepted against the model's estimate. */
const AGREEMENT = { min: 0.4, max: 2.5 };

function worst(a: SourceStatus, b: SourceStatus): SourceStatus {
  const order: SourceStatus[] = ["skipped", "ok", "demo_key", "timeout", "rate_limited", "error"];
  return order.indexOf(b) > order.indexOf(a) ? b : a;
}

async function pool<T, R>(list: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (i < list.length) {
      const idx = i++;
      out[idx] = await fn(list[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

function baseItem(s: SanitizedItem, idx: number): AIFoodItem {
  return {
    id: `i${idx + 1}`,
    name: s.name,
    brand: s.brand,
    kind: s.kind,
    portion: s.portion,
    quantity: s.quantity,
    unit: s.unit,
    grams: s.grams,
    preparation: s.preparation,
    macros: s.estimate,
    estimate: s.estimate,
    per100g: null,
    confidence: s.confidence,
    provenance: "estimate",
    source: null,
    savedFoodId: null,
    searchQuery: s.searchQuery,
    note: null,
    handoff: false,
  };
}

/** Database density × grams, unless it disagrees wildly with the visual estimate. */
export function agreesWithEstimate(db: MacroSet, est: MacroSet) {
  if (!(est.calories > 0) || !(db.calories > 0)) return true;
  const r = db.calories / est.calories;
  return r >= AGREEMENT.min && r <= AGREEMENT.max;
}

export async function resolveItems(items: SanitizedItem[], deps: ResolveDeps): Promise<{ items: AIFoodItem[]; lookup: LookupSummary }> {
  let usda: SourceStatus = "skipped";
  let off: SourceStatus = "skipped";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), deps.budgetMs ?? 9000);
  const savedById = new Map((deps.saved ?? []).map((s) => [s.id, s]));
  const memo = new Map<string, Promise<SearchResponse | null>>();

  const look = (q: string, kind: LookupKind) => {
    if (!deps.lookup) return Promise.resolve(null);
    const key = `${kind}|${q.toLowerCase()}`;
    if (!memo.has(key)) {
      memo.set(
        key,
        deps.lookup(q, kind, ctl.signal).then(
          (r) => {
            usda = worst(usda, r.sources.usda);
            off = worst(off, r.sources.off);
            return r;
          },
          () => null,
        ),
      );
    }
    return memo.get(key)!;
  };

  try {
    const resolved = await pool(items, deps.concurrency ?? 4, async (s) => {
      const idx = items.indexOf(s);
      const item = baseItem(s, idx);

      // 1) The user's own saved food: their numbers, scaled by quantity.
      const saved = s.savedFoodId ? savedById.get(s.savedFoodId) : undefined;
      if (saved) {
        // "60 g" of a 30 g saved serving = 2 servings; "2 scoops" of a saved serving = 2 servings
        const sameUnit = s.unit === saved.serving_unit.toLowerCase() && saved.serving_amount > 0;
        const factor = clamp(sameUnit ? s.quantity / saved.serving_amount : s.quantity, 0.05, 50);
        item.macros = scaleMacroSet({ calories: saved.calories, protein: saved.protein_g, carbs: saved.carbs_g, fat: saved.fat_g }, factor);
        item.provenance = "saved";
        item.savedFoodId = saved.id;
        item.grams = saved.grams ? round(saved.grams * factor, 0) : item.grams;
        item.note = "From your saved foods.";
        return item;
      }

      // 2) Restaurant items: no database holds the chain's published numbers for us.
      if (s.kind === "restaurant") {
        item.note = `Estimate. ${s.brand ? `Published nutrition from ${s.brand}` : "The restaurant's published nutrition"} wasn't retrieved.`;
        item.handoff = true;
        return item;
      }

      if (!s.grams) {
        item.note = "Estimate. Add grams to check it against a food database.";
        return item;
      }

      // 3) Database lookup: generic → USDA; packaged → Open Food Facts + USDA Branded.
      const kind: LookupKind = s.kind === "packaged" ? "packaged" : "generic";
      const res = await look(s.searchQuery, kind);
      let candidates = res ? confidentMatches(s.searchQuery, res.results, { kind, brand: kind === "packaged" ? s.brand : null }) : [];
      if (!candidates.length && res && kind === "packaged" && s.brand) {
        // brand typed differently on the label: try the product words only, stricter
        candidates = confidentMatches(s.searchQuery, res.results, { kind, minScore: 0.7, minCoverage: 0.8 });
      }
      // first of the top three whose density agrees with what the model saw
      for (const match of candidates.slice(0, 3)) {
        if (!match.result.per100g) continue;
        const db = macrosForGrams(match.result.per100g, s.grams);
        const url = match.result.sourceUrl;
        if (agreesWithEstimate(db, s.estimate) && isAllowedUrl(url, DATABASE_HOSTS)) {
          item.macros = db;
          item.per100g = match.result.per100g;
          item.provenance = "database";
          item.source = {
            name: match.result.source === "usda" ? "USDA" : "Open Food Facts",
            url,
            id: match.result.id,
            label: match.result.brand ? `${match.result.name} · ${match.result.brand}` : match.result.name,
          };
          item.note = null;
          return item;
        }
      }
      if (kind === "packaged") {
        item.note = "Estimate. No database entry matched this product.";
        item.handoff = !!s.brand;
      }
      return item;
    });
    return { items: resolved, lookup: { usda, off } };
  } finally {
    clearTimeout(timer);
  }
}

export function totalsOf(items: Pick<AIFoodItem, "macros">[]): MacroSet {
  return sumMacroSets(items.map((i) => i.macros));
}

/* ------------------------------------------------- client-side recompute */

/**
 * Macros for an edited portion. Database items rescale from their per-100 g density;
 * estimates scale linearly from the model's portion.
 */
export function macrosForPortion(
  item: Pick<AIFoodItem, "per100g" | "grams" | "macros" | "quantity">,
  base: { grams: number | null; macros: MacroSet; quantity: number },
  next: { grams: number | null; quantity: number },
): MacroSet {
  if (item.per100g && next.grams && next.grams > 0) return macrosForGrams(item.per100g, next.grams);
  if (base.grams && next.grams && base.grams > 0) return scaleMacroSet(base.macros, next.grams / base.grams);
  if (base.quantity > 0) return scaleMacroSet(base.macros, next.quantity / base.quantity);
  return base.macros;
}
