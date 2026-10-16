// Shared, client-safe types for the AI coach. No server imports here.

import type { ISODate } from "@/lib/dates";

/** Data categories the user can share with the coach (profile.coach_access). */
export type CoachCategory = "profile" | "training" | "nutrition" | "bodyweight" | "recovery" | "measurements";

export type CoachAccess = Record<CoachCategory, boolean>;

/**
 * Provenance of a fact shown to the user:
 * - logged: a record the user entered, or a calculation made only from those records
 * - plan: a target, the program or the schedule (what is intended, not what happened)
 */
export type FactKind = "logged" | "plan";

/** One citable fact from the user's own records. The model only ever sees id + label + value. */
export interface Fact {
  id: string;
  category: CoachCategory;
  kind: FactKind;
  /** Short label, e.g. "7-day average". */
  label: string;
  /** Formatted value in the user's units, e.g. "166.2 lb". */
  value: string;
  /** Extra context for the model (dates, counts). Never shown as a number of its own. */
  detail?: string;
  /** In-app screen that shows the underlying records. */
  href?: string;
}

/** What is stored with an answer and rendered as a chip under it. */
export type FactChip = Pick<Fact, "id" | "kind" | "label" | "value" | "href" | "category">;

export type SuggestionKind = "calorie_goal" | "protein_goal" | "water_goal_ml" | "training_mode" | "deload_week" | "note";
export const SUGGESTION_KINDS: SuggestionKind[] = ["calorie_goal", "protein_goal", "water_goal_ml", "training_mode", "deload_week", "note"];

export type TrainingMode = "standard" | "intro" | "deload";

export type SuggestionStatus = "open" | "applied" | "dismissed";

/** A validated, server-normalised suggestion. Numbers come from the server, never from the model. */
export interface CoachSuggestion {
  id: string;
  kind: SuggestionKind;
  title: string;
  rationale: string;
  /** Profile field the suggestion would change (null for notes). */
  field: "calorie_goal" | "protein_goal" | "water_goal_ml" | "training_mode" | null;
  /** The user's value when the suggestion was made (from the database). */
  current: number | string | null;
  /** The proposed value (validated against safe bounds). */
  proposed: number | string | null;
  /** Display strings in the user's units. */
  currentLabel: string | null;
  proposedLabel: string | null;
  status: SuggestionStatus;
  decidedAt?: string | null;
}

/** payload column of an assistant ai_messages row (kind 'coach'). */
export interface CoachPayload {
  v: 1;
  facts: FactChip[];
  suggestions: CoachSuggestion[];
  follow_ups: string[];
  shared: CoachCategory[];
  as_of: ISODate;
  mock?: boolean;
  model?: string;
  /** Suggestions the server dropped because they were unsafe or unsupported (count only). */
  dropped?: number;
}

/** Shape of POST /api/ai/coach success. */
export interface CoachMessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  payload: CoachPayload | null;
  created_at: string;
}

export interface CoachReplyResponse {
  conversationId: string;
  title: string;
  userMessage: CoachMessageRow;
  assistantMessage: CoachMessageRow;
}

export type CoachErrorCode = "not_configured" | "quota" | "rate_limited" | "blocked" | "bad_output" | "upstream" | "timeout" | "bad_request" | "unauthorized" | "not_found" | "offline";
