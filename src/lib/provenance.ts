// The provenance vocabulary (DESIGN-V2 §1.7, §4.8): where a number or a call comes from.
// One fixed set of six kinds, shown by ui/tag.tsx. Data only; no styling here.
//
// Rules: tags go on derived numbers and calls (trends, rates, projections, totals of plans,
// suggestions, estimates), not on every raw value. A tag is never gold and never the only
// carrier of meaning: the sentence around it says the same thing.

export type TagKind = "LOG" | "PLAN" | "RULE" | "CALC" | "PROJ" | "AI";

export const TAG_KINDS: readonly TagKind[] = ["LOG", "PLAN", "RULE", "CALC", "PROJ", "AI"];

export const TAG_MEANING: Record<TagKind, string> = {
  LOG: "You logged this",
  PLAN: "From your meal or training plan",
  RULE: "From a fixed rule in the app (progression, deload, pace call)",
  CALC: "Arithmetic on your logs",
  PROJ: "A projection from your current trend. Not a promise",
  AI: "Written by AI. Check it. Nothing is saved until you confirm",
};

/** What VoiceOver says for each kind. */
export const TAG_SPOKEN: Record<TagKind, string> = {
  LOG: "logged",
  PLAN: "planned",
  RULE: "app rule",
  CALC: "calculated from your logs",
  PROJ: "projection",
  AI: "AI, not saved",
};

export function isTagKind(v: unknown): v is TagKind {
  return typeof v === "string" && (TAG_KINDS as readonly string[]).includes(v);
}

/** The visible text: "PROJ", "AI · ESTIMATE" (the pill renders it in small caps). */
export function tagText(kind: TagKind, detail?: string | null): string {
  return detail ? `${kind} · ${detail.toUpperCase()}` : kind;
}

/** The VoiceOver label: "projection", "AI estimate", "app rule, deload". */
export function spokenTag(kind: TagKind, detail?: string | null): string {
  if (kind === "AI" && detail) return `AI ${detail.toLowerCase()}`;
  return detail ? `${TAG_SPOKEN[kind]}, ${detail.toLowerCase()}` : TAG_SPOKEN[kind];
}

/** The popover copy for a tag: what the kind means. */
export function explainTag(kind: TagKind): string {
  return TAG_MEANING[kind];
}

/**
 * Where the old badges go (§1.7). `EstimateBadge` depends on the source: AI estimates are
 * AI, ingredient-database maths (meal planner, recipes) is CALC. `SuggestedBadge` is RULE for
 * the app's rule engines and AI for coach suggestions. Source and Database badges stay
 * source chips (they cite a URL or a database), and PR / First benchmark become marks.
 */
export const BADGE_TAG = {
  logged: "LOG",
  plan: "PLAN",
  estimate: { ai: "AI", database: "CALC" },
  suggested: { rule: "RULE", coach: "AI" },
} as const satisfies Record<string, TagKind | Record<string, TagKind>>;
