import { describe, expect, it } from "vitest";
import { ALL_ACCESS, accessChipLabel, normalizeAccess } from "./access";
import { buildMockReply } from "./mock";
import { buildSystemPrompt } from "./prompt";
import { sanitizeAnswer, sanitizeFollowUps, titleFrom } from "./schema";
import { buildSnapshot, chipsFor, type RawCoachData } from "./snapshot";
import { validateSuggestions } from "./suggestions";

const today = "2026-10-16"; // a Friday

function raw(over: Partial<RawCoachData> = {}): RawCoachData {
  const weights = Array.from({ length: 30 }, (_, i) => ({ local_date: `2026-09-${String(17 + i).padStart(2, "0")}`.replace(/-09-(3[1-9]|4\d)$/, (_m, d) => `-10-${String(Number(d) - 30).padStart(2, "0")}`), weight_lb: 163 + i * 0.02 }));
  return {
    today,
    localTime: "14:05",
    profile: {
      display_name: "Q",
      height_cm: 189.2,
      start_weight_lb: 163,
      goal_weight_lb: 183,
      goal_range_min_lb: 180,
      goal_range_max_lb: 185,
      start_date: "2026-09-11",
      target_date: "2027-08-01",
      experience: "intermediate",
      weight_unit: "lb",
      length_unit: "in",
      calorie_goal: 3300,
      protein_goal: 185,
      carb_goal: 449,
      fat_goal: 85,
      water_goal_ml: 3000,
      sleep_goal_h: 8,
      weekly_schedule: null,
      training_mode: "standard",
      volleyball_per_week: 2,
    },
    access: ALL_ACCESS,
    goalChanges: [],
    weights,
    training: {
      sessions: [{ id: "s1", local_date: "2026-10-15", name: "Push B", template_key: "push_b", duration_sec: 3900, total_volume_lb: 12000, sets_completed: 13, pr_count: 1, status: "done" }],
      sets: [
        { session_id: "s0", local_date: "2026-10-12", exercise_slug: "barbell-bench-press", exercise_name: "Barbell Bench Press", set_index: 0, weight_lb: 185, reps: 6, duration_sec: null, e1rm_lb: 222 },
        { session_id: "s1", local_date: "2026-10-15", exercise_slug: "ez-bar-curl", exercise_name: "EZ-Bar Biceps Curl", set_index: 0, weight_lb: 60, reps: 10, duration_sec: null, e1rm_lb: 80 },
      ],
      bests: [],
      prs: [],
      templates: [],
      overrides: [],
      volleyball: [{ local_date: "2026-10-15", kind: "practice", duration_min: 90, intensity: 4 }],
      athletic: [],
      custom: {},
    },
    nutrition: {
      days: [
        { local_date: today, calories: 1850, protein_g: 120, carbs_g: 210, fat_g: 60, entries: 5 },
        { local_date: "2026-10-15", calories: 3100, protein_g: 180, carbs_g: 400, fat_g: 90, entries: 6 },
      ],
      water: [{ local_date: today, total_ml: 1500 }],
    },
    recovery: { logs: [{ local_date: "2026-10-15", sleep_hours: 6.5, sleep_quality: 3, energy: 3, soreness: 4, fatigue: 3, stress: 2, pain_notes: "left knee ache on landings", volleyball: true }] },
    measurements: { rows: [{ local_date: "2026-09-11", waist_in: 30.5 }, { local_date: "2026-10-09", waist_in: 30.75 }] },
    ...over,
  };
}

describe("buildSnapshot", () => {
  const snap = buildSnapshot(raw());
  const fact = (id: string) => snap.facts.find((f) => f.id === id);

  it("states today's intake and what's left from the real log", () => {
    expect(fact("nut.today.protein")?.value).toBe("120 g");
    expect(fact("nut.left.protein")).toMatchObject({ label: "Protein left today", value: "65 g", kind: "logged", href: "/nutrition" });
    expect(fact("nut.left.kcal")?.value).toBe("1,450 kcal");
    expect(fact("nut.avg7")?.detail).toMatch(/1 of 7 days/);
  });

  it("resolves today's plan from the weekly schedule", () => {
    expect(fact("plan.today")).toMatchObject({ value: "Pull B", kind: "plan" });
    expect(fact("vb.yesterday")).toMatchObject({ value: "Yes · practice · 90 min", detail: "Oct 15: practice, 90 min, intensity 4/5" });
  });

  it("covers lifts, muscle volume, recovery pain notes and measurements", () => {
    expect(fact("lift.barbell-bench-press")?.href).toBe("/training/exercise/barbell-bench-press");
    expect(fact("vol.biceps")?.value).toBe("1 set");
    expect(fact("vol.hamstrings")?.value).toBe("0 sets");
    expect(fact("rec.pain")?.detail).toMatch(/left knee ache/);
    expect(fact("rec.sleep")?.value).toBe("6.5 h");
    expect(fact("rec.2026-10-15")?.detail).toMatch(/played volleyball, PAIN NOTE/);
    expect(fact("meas.waist")?.value).toBe("30.5 in → 30.75 in");
    expect(snap.text).toContain("[nut.left.protein] Protein left today: 65 g");
    expect(snap.text).toContain("Everything is shared.");
  });

  it("omits categories that aren't shared and says so", () => {
    const s = buildSnapshot(raw({ access: { ...ALL_ACCESS, nutrition: false, recovery: false }, nutrition: null, recovery: null }));
    expect(s.facts.some((f) => f.category === "nutrition" || f.id.startsWith("nut."))).toBe(false);
    expect(s.facts.some((f) => f.id.startsWith("rec."))).toBe(false);
    expect(s.text).toMatch(/NOT SHARED: Nutrition, Recovery/);
    expect(s.shared).not.toContain("nutrition");
  });

  it("is honest about missing bodyweight data", () => {
    const s = buildSnapshot(raw({ weights: [] }));
    expect(s.text).toContain("No weigh-ins logged yet.");
    expect(s.derived.trendLb).toBeNull();
    expect(s.derived.calorieCheck).toBeNull();
  });

  it("uses the user's units", () => {
    const s = buildSnapshot(raw({ profile: { ...raw().profile, weight_unit: "kg", length_unit: "cm" } }));
    expect(s.facts.find((f) => f.id === "goal.weight")?.value).toBe("83.0 kg");
    expect(s.facts.find((f) => f.id === "meas.waist")?.value).toBe("77.5 cm → 78.1 cm");
  });
});

describe("chipsFor", () => {
  it("maps cited ids to server facts and ignores unknown or bracketed ids", () => {
    const snap = buildSnapshot(raw());
    const chips = chipsFor(["[nut.left.protein]", "made.up", "nut.left.protein", 42, "plan.today"], snap.facts);
    expect(chips.map((c) => c.id)).toEqual(["nut.left.protein", "plan.today"]);
    expect(chips[0]).toEqual({ id: "nut.left.protein", kind: "logged", label: "Protein left today", value: "65 g", href: "/nutrition", category: "nutrition" });
  });
});

describe("schema helpers", () => {
  it("sanitises model markdown", () => {
    expect(sanitizeAnswer("You have **65 g** left [nut.left.protein].\n\n\n\n<script>x</script>Ok ![img](http://x) [site](https://evil.example)")).toBe("You have **65 g** left.\n\nxOk  site");
  });
  it("keeps up to three short, unique follow-ups", () => {
    expect(sanitizeFollowUps(["What now?", "What now?", 3, "x", "**Bold** one", "a".repeat(120), "Four?", "Five?"])).toEqual(["What now?", "Bold one", "Four?"]);
  });
  it("titles conversations from the first question", () => {
    expect(titleFrom("  Am I eating enough?  ")).toBe("Am I eating enough?");
    expect(titleFrom("Should I reduce leg training because I played volleyball yesterday and my knees hurt?")).toBe("Should I reduce leg training because I played volleyball…");
  });
  it("puts the context inside the system prompt", () => {
    expect(buildSystemPrompt("CTX")).toMatch(/=== ACCOUNT CONTEXT[\s\S]*CTX[\s\S]*END ACCOUNT CONTEXT ===$/);
  });
});

describe("access", () => {
  it("normalises coach_access and labels the chip", () => {
    expect(normalizeAccess({ nutrition: false, junk: 1 })).toEqual({ ...ALL_ACCESS, nutrition: false });
    expect(normalizeAccess(null)).toEqual(ALL_ACCESS);
    expect(accessChipLabel({ ...ALL_ACCESS, measurements: false, profile: false })).toBe("Using: Training · Nutrition · Recovery · Weight");
    expect(accessChipLabel(ALL_ACCESS)).toBe("Using: Training · Nutrition · Recovery · Weight +2");
    expect(accessChipLabel({ profile: false, training: false, nutrition: false, bodyweight: false, recovery: false, measurements: false })).toMatch(/nothing/);
  });
});

describe("dev mock", () => {
  it("echoes only real facts and survives the same validation", () => {
    const snap = buildSnapshot(raw());
    const m = buildMockReply("How much protein do I have left today?", snap, raw().profile);
    expect(m.cited_fact_ids).toContain("nut.left.protein");
    expect(m.answer_markdown).toMatch(/Dev mock — not AI/);
    expect(m.answer_markdown).toContain("**Protein left today:** 65 g");
    const water = buildMockReply("Should I drink more water?", snap, raw().profile);
    const v = validateSuggestions(water.suggestions, { profile: raw().profile, access: ALL_ACCESS, trendLb: snap.derived.trendLb, calorieCheck: snap.derived.calorieCheck }, () => "x");
    expect(v.suggestions[0]).toMatchObject({ kind: "water_goal_ml", proposed: 3500 });
  });
});

describe("dev mock topics", () => {
  it("routes the weekly summary and deload prompts to the right facts", () => {
    const snap = buildSnapshot(raw());
    expect(buildMockReply("Give me my weekly summary: training, nutrition, bodyweight and recovery", snap, raw().profile).cited_fact_ids).toContain("plan.week");
    const d = buildMockReply("Do I need a deload week?", snap, raw().profile);
    expect(d.cited_fact_ids).toContain("tr.mode");
    expect(d.suggestions.map((s) => s.kind)).toEqual(["deload_week"]);
  });
});
