import { describe, expect, it } from "vitest";
import { contextFromPath, promptsFor, splitContext, splitVerdict, usesFoodCoach, withContext } from "./context";

describe("context prefix", () => {
  it("round-trips the screen a question came from", () => {
    const sent = withContext("  What should I focus on?  ", { kind: "now", label: "Push A today" });
    expect(sent).toBe("[About: Push A today]\nWhat should I focus on?");
    expect(splitContext(sent)).toEqual({ about: "Push A today", question: "What should I focus on?" });
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
    expect(promptsFor(undefined).more.length).toBeGreaterThan(1);
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
