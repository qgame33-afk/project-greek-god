// Food AI contracts: the JSON Schemas Gemini must answer in, and the validated shapes the
// API returns to the app. Isomorphic — the client imports the types, the server the schemas.

import type { MacroSet, SourceStatus } from "@/lib/food/types";

export type FoodKind = "generic" | "packaged" | "restaurant";
/** database: real record; estimate: model; saved: the user's saved food; manual: typed by the user. */
export type Provenance = "database" | "estimate" | "saved" | "manual";

export const PREPARATIONS = [
  "grilled",
  "fried",
  "deep-fried",
  "baked",
  "roasted",
  "boiled",
  "steamed",
  "sauteed",
  "raw",
  "scrambled",
  "poached",
  "mixed",
  "unknown",
] as const;

/** One validated, labelled food item as the app sees it. */
export interface AIFoodItem {
  id: string;
  name: string;
  /** Brand or restaurant, when the user named one or a package was visible. */
  brand: string | null;
  kind: FoodKind;
  portion: string;
  quantity: number;
  unit: string;
  /** Estimated edible grams for the whole quantity (null when unknown). */
  grams: number | null;
  preparation: string;
  /** Macros for this portion — from the database when provenance is "database". */
  macros: MacroSet;
  /** The model's own estimate for the same portion (always kept for transparency). */
  estimate: MacroSet;
  /** Database density used for the macros (lets the UI rescale by grams). */
  per100g: MacroSet | null;
  confidence: number;
  provenance: Provenance;
  /** Only ever set from an actual database lookup made by the server. */
  source: { name: string; url: string; id: string; label: string } | null;
  savedFoodId: string | null;
  searchQuery: string;
  note: string | null;
  /** Suggest the ChatGPT/Claude research handoff (restaurant or unmatched branded item). */
  handoff: boolean;
}

export interface AIQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface LookupSummary {
  usda: SourceStatus;
  off: SourceStatus;
}

export interface PhotoAnalysis {
  items: AIFoodItem[];
  totals: MacroSet;
  overall_confidence: number;
  caveats: string[];
  questions: AIQuestion[];
  not_food: boolean;
  model: string;
  lookup: LookupSummary;
  mock?: boolean;
}

export type ChatIntent = "log_meal" | "correction" | "question" | "add_to_log" | "other";
export type MealHint = "breakfast" | "lunch" | "dinner" | "snacks" | "unknown";

/** Stored in ai_messages.payload for assistant turns. */
export interface FoodChatPayload {
  v: 1;
  items: AIFoodItem[];
  totals: MacroSet;
  questions: AIQuestion[];
  notes: string[];
  corrections: string[];
  needs_clarification: boolean;
  intent: ChatIntent;
  meal_hint: MealHint;
  /** The earlier assistant message whose draft this one revises. */
  revises: string | null;
  /** The earlier draft this reply is about (e.g. "add it to my log"). */
  refers_to: string | null;
  model: string;
  lookup: LookupSummary;
  mock?: boolean;
}

export interface FoodAIErrorBody {
  error: string;
  code:
    | "not_configured"
    | "quota"
    | "rate_limited"
    | "blocked"
    | "bad_output"
    | "upstream"
    | "timeout"
    | "bad_request"
    | "unauthorized"
    | "duplicate"
    | "not_found";
}

/* ------------------------------------------------- Gemini response schemas */

const macroProps = {
  est_calories: { type: "number", description: "kcal for the whole portion described" },
  est_protein: { type: "number", description: "grams of protein for the whole portion" },
  est_carbs: { type: "number", description: "grams of carbohydrate for the whole portion" },
  est_fat: { type: "number", description: "grams of fat for the whole portion" },
};

const questionSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: "short stable id, e.g. chicken_method" },
    question: { type: "string" },
    options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
  },
  required: ["id", "question", "options"],
};

export const PHOTO_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    not_food: { type: "boolean", description: "true when the photo shows no food or drink" },
    items: {
      type: "array",
      maxItems: 15,
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "specific food name, e.g. 'Grilled chicken breast'" },
          portion_description: { type: "string", description: "human portion, e.g. 'about 1 cup'" },
          estimated_grams: { type: "number", description: "edible weight in grams" },
          preparation: { type: "string", enum: [...PREPARATIONS] },
          kind: { type: "string", enum: ["generic", "packaged", "restaurant"] },
          brand: { type: "string", description: "visible brand or restaurant, else empty string" },
          ...macroProps,
          confidence: { type: "number", minimum: 0, maximum: 1 },
          search_query: { type: "string", description: "USDA-style query for generic foods; brand + product for packaged" },
        },
        required: [
          "name",
          "portion_description",
          "estimated_grams",
          "preparation",
          "kind",
          "est_calories",
          "est_protein",
          "est_carbs",
          "est_fat",
          "confidence",
          "search_query",
        ],
      },
    },
    overall_confidence: { type: "number", minimum: 0, maximum: 1 },
    caveats: { type: "array", items: { type: "string" }, maxItems: 3 },
    questions: { type: "array", items: questionSchema, maxItems: 3 },
  },
  required: ["not_food", "items", "overall_confidence", "caveats", "questions"],
};

export const CHAT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    reply: { type: "string", description: "1-4 short sentences of plain markdown, no links" },
    intent: { type: "string", enum: ["log_meal", "correction", "question", "add_to_log", "other"] },
    needs_clarification: { type: "boolean" },
    is_revision: { type: "boolean", description: "true when items are an updated version of CURRENT_DRAFT" },
    meal_hint: { type: "string", enum: ["breakfast", "lunch", "dinner", "snacks", "unknown"] },
    items: {
      type: "array",
      maxItems: 15,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "number", description: "how many units were eaten" },
          unit: { type: "string", description: "g, piece, slice, cup, bowl, serving, ml, scoop, egg, wing..." },
          portion_description: { type: "string" },
          estimated_grams: { type: "number", description: "total edible grams for the whole quantity" },
          preparation: { type: "string", enum: [...PREPARATIONS] },
          kind: { type: "string", enum: ["generic", "packaged", "restaurant"] },
          brand: { type: "string", description: "restaurant or brand the user named, else empty string" },
          ...macroProps,
          confidence: { type: "number", minimum: 0, maximum: 1 },
          search_query: { type: "string" },
          saved_food_id: { type: "string", description: "id from SAVED_FOODS when the user refers to one, else empty" },
        },
        required: [
          "name",
          "quantity",
          "unit",
          "portion_description",
          "estimated_grams",
          "preparation",
          "kind",
          "est_calories",
          "est_protein",
          "est_carbs",
          "est_fat",
          "confidence",
          "search_query",
        ],
      },
    },
    questions: { type: "array", items: questionSchema, maxItems: 3 },
    corrections: { type: "array", items: { type: "string" }, maxItems: 4, description: "short tap-to-send corrections, e.g. '6 slices'" },
    notes: { type: "array", items: { type: "string" }, maxItems: 3 },
  },
  required: ["reply", "intent", "needs_clarification", "is_revision", "meal_hint", "items", "questions", "corrections"],
};
