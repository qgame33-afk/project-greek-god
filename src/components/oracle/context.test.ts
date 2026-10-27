import { describe, expect, it } from "vitest";
import { TWOSET_TEMPLATES, templateLabels } from "@/lib/training/programs";
import { contextFromPath, programQuestions, promptsFor, splitContext, splitVerdict, usesFoodCoach, withContext } from "./context";

describe("context prefix", () => {
  it("round-trips the screen a question came from", () => {
    const sent = withContext("  What should I focus on?  ", { kind: "now", label: "Today" });
    expect(sent).toBe("[About: Today]\nWhat should I focus on?");
    expect(splitContext(sent)).toEqual({ about: "Today", question: "What should I focus on?" });
  });
  it("leaves a question without context alone", () => {
    expect(withContext("Hi", null)).toBe("Hi");
    expect(splitContext("[About this] hi")).toEqual({ about: null, question: "[About this] hi" });
  });
  it("strips brackets and newlines from labels", () => {
    expect(withContext("q", { kind: "fuel", label: "a]b\nc" })).toBe("[About: a b c]\nq");
  });
});

describe("contextFromPath", () => {
  it("maps routes to screens", () => {
    expect(contextFromPath("/").kind).toBe("now");
    expect(contextFromPath("/training?tab=lifts").kind).toBe("train");
    expect(contextFromPath("/nutrition").kind).toBe("fuel");
    expect(contextFromPath("/nutrition/meals/recipe/abc").kind).toBe("recipe");
    expect(contextFromPath("/progress").kind).toBe("ascent");
    expect(contextFromPath("/workout/123").kind).toBe("gym");
    expect(usesFoodCoach(contextFromPath("/nutrition"))).toBe(true);
    expect(usesFoodCoach(contextFromPath("/progress"))).toBe(false);
  });
});

describe("promptsFor", () => {
  it("uses his own numbers or plain words", () => {
    expect(promptsFor("fuel", { proteinGoal: 185 }).lead).toBe("What should dinner be to hit 185 g?");
    expect(promptsFor("fuel").lead).toBe("What should dinner be to hit my protein goal?");
    expect(promptsFor("ascent").lead).toBe("Am I gaining too fast?");
    expect(promptsFor(undefined).lead).toBe("Do I need a lighter week?");
  });
  it("asks PROGRAM's two training questions with the active program's own day names", () => {
    const label = (family: string) => {
      const t = TWOSET_TEMPLATES.find((x) => x.family === family)!;
      return templateLabels(t).short;
    };
    const days = { arms: label("shoulders_arms"), chest: label("chest_back") };
    expect(programQuestions(days)).toEqual([`Is my ${days.arms} day hurting my ${days.chest} day?`, "Do I need a lighter week?"]);
    const p = promptsFor("train", { days });
    expect([p.lead, ...p.more]).toEqual(programQuestions(days));
    expect(promptsFor("now", { days }).lead).toBe(`Is my ${days.arms} day hurting my ${days.chest} day?`);
  });
  it("leaves the overlap question out when the program has no such pair", () => {
    expect(programQuestions({ arms: null, chest: "x" })).toEqual(["Do I need a lighter week?"]);
  });
  it("never suggests deloads, jumps or a lift that isn't in the program", () => {
    const all = (["now", "train", "fuel", "ascent", "gym", "recipe", undefined] as const).flatMap((k) => {
      const p = promptsFor(k, { days: { arms: "A", chest: "B" } });
      return [p.lead, ...p.more];
    });
    for (const q of all) expect(q).not.toMatch(/deload|bench|jump|sprint/i);
  });
});

describe("splitVerdict", () => {
  it("lifts a short opening sentence out as the verdict", () => {
    const r = splitVerdict("On pace, at the top of your corridor. You gain **0.4 lb** a week.\n\n- Rate: 0.4 lb/wk");
    expect(r.verdict).toBe("On pace, at the top of your corridor.");
    expect(r.rest).toBe("You gain 0.4 lb a week.\n\n- Rate: 0.4 lb/wk");
  });
  it("keeps decimals inside the sentence", () => {
    expect(splitVerdict("Hold 3,300 kcal at 0.36 lb a week.").verdict).toBe("Hold 3,300 kcal at 0.36 lb a week.");
  });
  it("has no verdict for lists, headings or long openings", () => {
    expect(splitVerdict("- one\n- two").verdict).toBeNull();
    expect(splitVerdict("### Training\nSix sessions").verdict).toBeNull();
    const long = `${"word ".repeat(40)}end.`;
    expect(splitVerdict(long)).toEqual({ verdict: null, rest: long });
  });
  it("handles the dev mock's bold opening", () => {
    const r = splitVerdict("**Dev mock — not AI.** This reply is a fixture.\n\n- **Plan:** Push A");
    expect(r.verdict).toBe("Dev mock — not AI.");
    expect(r.rest.startsWith("This reply is a fixture.")).toBe(true);
  });
});
