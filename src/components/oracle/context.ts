// The Oracle's pure helpers (docs/DESIGN-V2.md §3.9.2): the context a question is asked from
// ("About: Push A today"), the suggestion chips for each screen, and the verdict line pulled out of
// an answer. No React, no I/O — unit-tested.

import type { OracleContext } from "@/components/offering/store";

export type OracleKind = OracleContext["kind"];

/** Which screen a pathname belongs to, when the opener passed no context. */
export function contextFromPath(pathname: string): OracleContext {
  if (pathname.startsWith("/workout/")) return { kind: "gym", label: "This session" };
  if (pathname.startsWith("/nutrition/meals/recipe/")) return { kind: "recipe", label: "This recipe" };
  if (pathname.startsWith("/nutrition")) return { kind: "fuel", label: "Today's food" };
  if (pathname.startsWith("/training")) return { kind: "train", label: "Your training" };
  if (pathname.startsWith("/progress") || pathname.startsWith("/reviews")) return { kind: "ascent", label: "The climb" };
  return { kind: "now", label: "Today" };
}

export function contextKey(c: OracleContext | null | undefined) {
  return c ? `${c.kind}|${c.label}` : "none";
}

/** Fuel questions go to the Food Coach (its drafts can be logged); everything else to the coach. */
export function usesFoodCoach(c: OracleContext | null | undefined) {
  return c?.kind === "fuel";
}

const PREFIX = /^\[About: ([^\]\n]{1,80})\]\n/;

/** The question as sent: "[About: Push A today]\nWhat should I focus on?" — the coach sees the screen it came from. */
export function withContext(question: string, c: OracleContext | null | undefined): string {
  const q = question.trim();
  if (!c?.label) return q;
  return `[About: ${c.label.replace(/[\]\n]/g, " ").slice(0, 80)}]\n${q}`;
}

/** A stored question split back into its context label and the words he typed. */
export function splitContext(text: string): { about: string | null; question: string } {
  const m = PREFIX.exec(text);
  return m ? { about: m[1], question: text.slice(m[0].length) } : { about: null, question: text };
}

export interface Prompts {
  /** The first, featured prompt. */
  lead: string;
  more: string[];
}

export const WEEKLY_SUMMARY_PROMPT = "Give me my weekly summary: training, nutrition, bodyweight and recovery for the last 7 days, and what to focus on next week.";

/** Suggestion chips per screen. Numbers come from his profile, never invented. */
export function promptsFor(kind: OracleKind | null | undefined, p: { proteinGoal?: number | null; goalWeight?: string | null } = {}): Prompts {
  const protein = p.proteinGoal ? `${Math.round(p.proteinGoal)} g` : "my protein goal";
  const goal = p.goalWeight ?? "my goal weight";
  switch (kind) {
    case "fuel":
      return { lead: `What should dinner be to hit ${protein}?`, more: ["How much protein do I have left today?", "Is my breakfast big enough?", "What's a quick high-protein snack?"] };
    case "train":
      return { lead: "What should I train today?", more: ["Why hasn't my bench press improved?", "Do I need a deload week?", "Should I cut leg volume after volleyball?"] };
    case "ascent":
      return { lead: "Am I gaining too fast?", more: ["How much weight have I gained since I started?", "Should I increase calories?", `Am I on pace for ${goal}?`] };
    case "gym":
      return { lead: "How is this session going against last time?", more: ["Should I add weight next session?", "My shoulder feels off. What should I do?"] };
    case "recipe":
      return { lead: "How does this meal fit today's targets?", more: ["How much protein do I have left today?", "What should dinner be?"] };
    case "now":
    default:
      return { lead: "What should I focus on today?", more: [`Am I on pace for ${goal}?`, "How much protein do I have left today?", "Should I reduce leg training after volleyball?"] };
  }
}

const VERDICT_MAX = 120;

/**
 * The verdict line: the answer's opening sentence, said in the Oracle's voice (t-verdict), when
 * it is short enough to stand alone. The rest of the answer follows as body text. Lists, headings
 * and long openings have no verdict.
 */
export function splitVerdict(markdown: string): { verdict: string | null; rest: string } {
  const text = markdown.trim();
  const blocks = text.split(/\n{2,}/);
  const first = blocks[0] ?? "";
  if (!first || /^\s*([-*+]\s|[>#|]|\d+[.)]\s)/.test(first) || first.includes("\n")) return { verdict: null, rest: text };
  const plain = first.replace(/(\*\*|__)(.+?)\1/g, "$2").replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, "$1$2").replace(/`/g, "").trim();
  const m = /^(.+?[.!?])(?:\s+|$)/.exec(plain);
  const sentence = m ? m[1] : plain;
  if (sentence.length > VERDICT_MAX) return { verdict: null, rest: text };
  const remainder = plain.slice(sentence.length).trim();
  const rest = [remainder, ...blocks.slice(1)].filter(Boolean).join("\n\n");
  return { verdict: sentence, rest };
}
