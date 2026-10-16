import { describe, expect, it } from "vitest";
import { ALL_ACCESS } from "./access";
import { parseProposedNumber, suggestionIsCurrent, validateSuggestions, type SuggestionContext } from "./suggestions";

let n = 0;
const id = () => `s${++n}`;

const base: SuggestionContext = {
  profile: { calorie_goal: 3300, protein_goal: 185, water_goal_ml: 3000, training_mode: "standard", start_weight_lb: 163 },
  access: ALL_ACCESS,
  trendLb: 170, // ≈ 77.1 kg → protein 108–185 g
  calorieCheck: { kind: "increase", ratePerWeek: 0.1, targetRate: 0.48, delta: 200 },
};
const s = (kind: string, proposed: string, extra: Record<string, unknown> = {}) => ({ kind, title: "Title", rationale: "Because of the numbers.", current: "whatever the model says", proposed, ...extra });

describe("parseProposedNumber", () => {
  it("reads numbers out of model strings", () => {
    expect(parseProposedNumber("3,450 kcal")).toBe(3450);
    expect(parseProposedNumber("3.5 L")).toBe(3.5);
    expect(parseProposedNumber(200)).toBe(200);
    expect(parseProposedNumber("more")).toBeNull();
    expect(parseProposedNumber(null)).toBeNull();
  });
});

describe("validateSuggestions — calories", () => {
  it("accepts a modest increase backed by the two-week check and uses the DB's current value", () => {
    const { suggestions, dropped } = validateSuggestions([s("calorie_goal", "3,500 kcal")], base, id);
    expect(dropped).toEqual([]);
    expect(suggestions[0]).toMatchObject({ kind: "calorie_goal", field: "calorie_goal", current: 3300, proposed: 3500, currentLabel: "3,300 kcal", proposedLabel: "3,500 kcal", status: "open" });
  });

  it("drops changes larger than 300 kcal/day", () => {
    const r = validateSuggestions([s("calorie_goal", "3700")], base, id);
    expect(r.suggestions).toHaveLength(0);
    expect(r.dropped[0].reason).toMatch(/exceeds/);
  });

  it("drops calorie changes without two weeks of data, during the cooldown, or when on track", () => {
    for (const calorieCheck of [
      { kind: "insufficient", daysOfData: 9, weighIns: 6 },
      { kind: "cooldown", lastChange: "2026-10-10", nextCheck: "2026-10-24" },
      { kind: "on_track", ratePerWeek: 0.45, targetRate: 0.48 },
    ] as const) {
      expect(validateSuggestions([s("calorie_goal", "3500")], { ...base, calorieCheck }, id).suggestions).toHaveLength(0);
    }
  });

  it("drops calorie changes when bodyweight isn't shared", () => {
    const r = validateSuggestions([s("calorie_goal", "3500")], { ...base, access: { ...ALL_ACCESS, bodyweight: false } }, id);
    expect(r.suggestions).toHaveLength(0);
  });

  it("drops a change that contradicts the trend", () => {
    expect(validateSuggestions([s("calorie_goal", "3100")], base, id).suggestions).toHaveLength(0);
    const fast = { ...base, calorieCheck: { kind: "reassess", ratePerWeek: 1.4, targetRate: 0.48, delta: -200 } as const };
    expect(validateSuggestions([s("calorie_goal", "3500")], fast, id).suggestions).toHaveLength(0);
    expect(validateSuggestions([s("calorie_goal", "3100")], fast, id).suggestions[0]).toMatchObject({ proposed: 3100 });
  });
});

describe("validateSuggestions — protein, water, modes", () => {
  it("keeps protein inside 1.4–2.4 g/kg of trend weight", () => {
    expect(validateSuggestions([s("protein_goal", "170 g")], base, id).suggestions[0]).toMatchObject({ current: 185, proposed: 170 });
    expect(validateSuggestions([s("protein_goal", "200")], base, id).suggestions).toHaveLength(0); // > 2.4 g/kg at 170 lb
    expect(validateSuggestions([s("protein_goal", "100")], base, id).suggestions).toHaveLength(0); // < 1.4 g/kg
    expect(validateSuggestions([s("protein_goal", "187")], base, id).suggestions).toHaveLength(0); // no meaningful change
  });

  it("falls back to start weight for protein bounds when there's no trend", () => {
    const r = validateSuggestions([s("protein_goal", "170")], { ...base, trendLb: null }, id);
    expect(r.suggestions).toHaveLength(1);
  });

  it("accepts water in mL or litres within safe bounds", () => {
    expect(validateSuggestions([s("water_goal_ml", "3.5 L")], base, id).suggestions[0]).toMatchObject({ proposed: 3500, proposedLabel: "3.5 L" });
    expect(validateSuggestions([s("water_goal_ml", "1500")], base, id).suggestions).toHaveLength(0);
    expect(validateSuggestions([s("water_goal_ml", "5000")], base, id).suggestions).toHaveLength(0); // +2 L in one step
  });

  it("validates training modes and deload weeks", () => {
    expect(validateSuggestions([s("training_mode", "intro")], base, id).suggestions[0]).toMatchObject({ field: "training_mode", current: "standard", proposed: "intro" });
    expect(validateSuggestions([s("training_mode", "standard")], base, id).suggestions).toHaveLength(0);
    expect(validateSuggestions([s("training_mode", "beast mode")], base, id).suggestions).toHaveLength(0);
    expect(validateSuggestions([s("deload_week", "deload")], base, id).suggestions[0]).toMatchObject({ proposed: "deload", proposedLabel: "Deload, 1 week" });
    const deloading = { ...base, profile: { ...base.profile, training_mode: "deload" } };
    expect(validateSuggestions([s("deload_week", "deload")], deloading, id).suggestions).toHaveLength(0);
  });

  it("keeps notes without values and drops unknown kinds, blanks and duplicates", () => {
    const r = validateSuggestions(
      [
        s("note", ""),
        s("note", "", { title: "Second note" }),
        { kind: "delete_account", title: "x", rationale: "y", proposed: "1" },
        s("protein_goal", "170", { title: "" }),
        s("water_goal_ml", "3500"),
        s("water_goal_ml", "3600"),
      ],
      base,
      id,
    );
    expect(r.suggestions.map((x) => x.kind)).toEqual(["note", "water_goal_ml"]);
    expect(r.suggestions[0]).toMatchObject({ field: null, current: null, proposed: null });
    expect(r.dropped.map((d) => d.reason)).toEqual(["duplicate", "unknown kind", "missing title or rationale", "duplicate"]);
  });

  it("allows at most two setting changes per answer and never both a mode change and a deload", () => {
    const r = validateSuggestions([s("deload_week", "deload"), s("training_mode", "intro"), s("water_goal_ml", "3500"), s("protein_goal", "170")], base, id);
    expect(r.suggestions.map((x) => x.kind)).toEqual(["deload_week", "water_goal_ml"]);
  });

  it("strips markdown from titles and caps lengths", () => {
    const r = validateSuggestions([s("note", "", { title: "**Skip** the `jumps`", rationale: "x".repeat(900) })], base, id);
    expect(r.suggestions[0].title).toBe("Skip the jumps");
    expect(r.suggestions[0].rationale.length).toBe(420);
  });

  it("handles junk input", () => {
    expect(validateSuggestions(null, base, id)).toEqual({ suggestions: [], dropped: [] });
    expect(validateSuggestions("nope", base, id).suggestions).toEqual([]);
  });
});

describe("suggestionIsCurrent", () => {
  it("disables Apply once the live value moved", () => {
    const [sug] = validateSuggestions([s("calorie_goal", "3500")], base, id).suggestions;
    expect(suggestionIsCurrent(sug, { calorie_goal: 3300 })).toBe(true);
    expect(suggestionIsCurrent(sug, { calorie_goal: 3400 })).toBe(false);
    const [mode] = validateSuggestions([s("deload_week", "deload")], base, id).suggestions;
    expect(suggestionIsCurrent(mode, { training_mode: "standard" })).toBe(true);
    expect(suggestionIsCurrent(mode, { training_mode: "deload" })).toBe(false);
  });
});
