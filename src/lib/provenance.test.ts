import { describe, expect, it } from "vitest";
import { BADGE_TAG, explainTag, isTagKind, spokenTag, TAG_KINDS, TAG_MEANING, TAG_SPOKEN, tagText } from "./provenance";

describe("provenance vocabulary", () => {
  it("has exactly the six kinds, each with a meaning and a spoken label", () => {
    expect([...TAG_KINDS]).toEqual(["LOG", "PLAN", "RULE", "CALC", "PROJ", "AI"]);
    for (const k of TAG_KINDS) {
      expect(TAG_MEANING[k].length).toBeGreaterThan(5);
      expect(TAG_SPOKEN[k].length).toBeGreaterThan(2);
      expect(explainTag(k)).toBe(TAG_MEANING[k]);
      // no exclamation marks, no guilt
      expect(TAG_MEANING[k]).not.toMatch(/!/);
    }
    expect(TAG_MEANING.AI).toMatch(/Nothing is saved until you confirm/);
    expect(TAG_MEANING.PROJ).toMatch(/Not a promise/);
  });

  it("text and VoiceOver labels", () => {
    expect(tagText("PROJ")).toBe("PROJ");
    expect(tagText("AI", "estimate")).toBe("AI · ESTIMATE");
    expect(spokenTag("PROJ")).toBe("projection");
    expect(spokenTag("AI")).toBe("AI, not saved");
    expect(spokenTag("AI", "Estimate")).toBe("AI estimate");
    expect(spokenTag("RULE", "deload")).toBe("app rule, deload");
    expect(spokenTag("CALC")).toBe("calculated from your logs");
  });

  it("guards kinds and maps the old badges", () => {
    expect(isTagKind("CALC")).toBe(true);
    expect(isTagKind("calc")).toBe(false);
    expect(isTagKind(null)).toBe(false);
    expect(BADGE_TAG.logged).toBe("LOG");
    expect(BADGE_TAG.estimate.ai).toBe("AI");
    expect(BADGE_TAG.estimate.database).toBe("CALC");
    expect(BADGE_TAG.suggested.rule).toBe("RULE");
    expect(BADGE_TAG.suggested.coach).toBe("AI");
  });
});
