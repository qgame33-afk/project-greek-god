// Coach's pure helpers (docs/DESIGN-V3-SIMPLE.md §4.8): the screen a question is asked from
// ("About: Today"), the suggested questions for each screen, and the opening sentence pulled out of
// an answer. No React, no I/O — unit-tested. Program day names come from PROGRAM's data (the
// caller passes the active templates' labels), never from strings typed here.

import type { OracleContext } from "@/components/offering/store";

export type OracleKind = OracleContext["kind"];

/** Which screen a pathname belongs to, when the opener passed no context. */
export function contextFromPath(pathname: string): OracleContext {
  if (pathname.startsWith("/workout/")) return { kind: "gym", label: "This session" };
  if (pathname.startsWith("/nutrition/meals/recipe/")) return { kind: "recipe", label: "This recipe" };
  if (pathname.startsWith("/nutrition")) return { kind: "fuel", label: "Today's food" };
  if (pathname.startsWith("/training")) return { kind: "train", label: "Your training" };
  if (pathname.startsWith("/progress") || pathname.startsWith("/reviews")) return { kind: "ascent", label: "Your progress" };
  return { kind: "now", label: "Today" };
}

export function contextKey(c: OracleContext | null | undefined) {
  return c ? `${c.kind}|${c.label}` : "none";
}

/** Food questions go to the food coach (its drafts can be logged); everything else to the coach. */
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
  /** The first, featured question. */
  lead: string;
  more: string[];
}

export const WEEKLY_SUMMARY_PROMPT = "Give me my weekly summary: training, nutrition, bodyweight and recovery for the last 7 days, and what to focus on next week.";

/** The active program's day names by family, from PROGRAM's templateLabels() (e.g. the arm day's `short`). */
export interface ProgramDays {
  /** The shoulders-and-arms day's name, or null when the active program has none. */
  arms?: string | null;
  /** The chest-and-back day's name, or null when the active program has none. */
  chest?: string | null;
}

/**
 * PROGRAM's two training questions (PROGRAM-ARNOLD §6.2): the fatigue overlap between the arm day
 * and the next day's chest and back work, named with the active program's own day names, and the
 * lighter week. The overlap question is left out when the active program has no such pair.
 */
export function programQuestions(days: ProgramDays = {}): string[] {
  const out: string[] = [];
  if (days.arms && days.chest) out.push(`Is my ${days.arms} day hurting my ${days.chest} day?`);
  out.push("Do I need a lighter week?");
  return out;
}

/** Suggested questions per screen. Numbers come from his profile, day names from the program; nothing is invented. */
export function promptsFor(kind: OracleKind | null | undefined, p: { proteinGoal?: number | null; goalWeight?: string | null; days?: ProgramDays } = {}): Prompts {
  const protein = p.proteinGoal ? `${Math.round(p.proteinGoal)} g` : "my protein goal";
  const goal = p.goalWeight ?? "my goal weight";
  const program = programQuestions(p.days);
  switch (kind) {
    case "fuel":
      return { lead: `What should dinner be to hit ${protein}?`, more: ["How much protein do I have left today?", "What's a quick high-protein snack?"] };
    case "ascent":
      return { lead: "Am I gaining too fast?", more: [`Am I on pace for ${goal}?`, "Should I increase calories?"] };
    case "gym":
      return { lead: "How is this workout going against last time?", more: ["Should I add weight next time?"] };
    case "recipe":
      return { lead: "How does this meal fit today's targets?", more: ["How much protein do I have left today?"] };
    case "train":
    case "now":
    default: {
      const [lead, ...more] = program;
      return { lead, more };
    }
  }
}

const VERDICT_MAX = 120;

/**
 * The opening line: the answer's first sentence, shown in bold above the body, when
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
