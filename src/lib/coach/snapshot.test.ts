import { describe, expect, it } from "vitest";
import { ALL_ACCESS, accessChipLabel, normalizeAccess } from "./access";
import { buildMockReply } from "./mock";
import { buildSystemPrompt, COACH_SYSTEM_RULES } from "./prompt";
import { sanitizeAnswer, sanitizeFollowUps, titleFrom } from "./schema";
import { buildSnapshot, chipsFor, dateInZone, type RawCoachData } from "./snapshot";
import { validateSuggestions } from "./suggestions";
import { rateAt, trendAt } from "@/lib/progress/pace";

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
      custom: {},
    },
    nutrition: {
      days: [
        { local_date: today, calories: 1850, protein_g: 120, carbs_g: 210, fat_g: 60, entries: 5 },
        { local_date: "2026-10-15", calories: 3100, protein_g: 180, carbs_g: 400, fat_g: 90, entries: 6 },
      ],
      water: [{ local_date: today, total_ml: 1500 }],
    },
    recovery: { logs: [{ local_date: "2026-10-15", sleep_hours: 6.5, sleep_quality: 3, energy: 3, soreness: 4, fatigue: 3, stress: 2, pain_notes: "left knee ache on landings" }] },
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

  it("resolves today's plan from the weekly schedule (a new account follows the Arnold split)", () => {
    expect(fact("plan.today")).toMatchObject({ value: "Chest & Back B", kind: "plan" });
    expect(fact("prog.active")?.value).toBe("Arnold split");
    expect(fact("prog.saved")?.value).toBe("Push/Pull/Legs (saved, not active)");
    expect(fact("prog.chest_back_b")?.detail).toMatch(/^Incline Smith Machine Press 3×8–12 @1–3 RIR/);
    expect(fact("prog.push_a")).toBeUndefined();
    expect(snap.text).toContain("## PROGRAM RULES (Arnold split)");
    expect(snap.text).toContain("Six training days are not mandatory.");
  });

  it("follows Push/Pull/Legs for an account still on it, and names the switch date", () => {
    const ppl = buildSnapshot(raw({ profile: { ...raw().profile, weekly_schedule: { "1": "push_a", "2": "pull_a", "3": "legs_a", "4": "push_b", "5": "pull_b", "6": "legs_b", "0": "rest" } } }));
    expect(ppl.facts.find((f) => f.id === "plan.today")?.value).toBe("Pull B");
    expect(ppl.facts.find((f) => f.id === "prog.active")?.value).toBe("Push/Pull/Legs");
    const switched = buildSnapshot(raw({ profile: { ...raw().profile, prefs: { program: "arnold", programSwitch: { from: "ppl", to: "arnold", at: "2026-10-14T12:00:00Z", date: "2026-10-14", frozen: 0, mapped: 0 } } } }));
    expect(switched.facts.find((f) => f.id === "prog.active")?.value).toBe("Arnold split since Oct 14");
  });

  it("never mentions volleyball or jump tests", () => {
    expect(snap.facts.some((f) => /^(vb|ath)\./.test(f.id) || f.id === "prof.volleyball")).toBe(false);
    expect(snap.text).not.toMatch(/volley|jump test|vertical/i);
  });

  it("covers lifts, muscle volume, recovery pain notes and measurements", () => {
    expect(fact("lift.barbell-bench-press")?.href).toBe("/training/exercise/barbell-bench-press");
    expect(fact("vol.biceps")?.value).toBe("1 set");
    expect(fact("vol.hamstrings")?.value).toBe("0 sets");
    // a secondary muscle counts half a set: bench press → triceps 0.5
    expect(fact("vol.triceps")?.value).toBe("0.5 sets");
    expect(fact("vol.chest")?.label).toBe("Upper chest and chest sets, last 7 days");
    expect(fact("rec.pain")?.detail).toMatch(/left knee ache/);
    expect(fact("rec.sleep")?.value).toBe("6.5 h");
    expect(fact("rec.2026-10-15")?.detail).toMatch(/stress 2\/5, PAIN NOTE/);
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

  it("states THE rate (pace.rateAt) and no other weekly rate", () => {
    const r = raw();
    const s = buildSnapshot(r);
    const f = (id: string) => s.facts.find((x) => x.id === id);
    const rt = rateAt(r.weights!, today, r.profile.start_date);
    expect(rt.status).toBe("ok");
    expect(f("bw.rate")?.value).toBe(`${rt.lbPerWeek! > 0 ? "+" : ""}${rt.lbPerWeek!.toFixed(2)} lb/wk`);
    expect(f("bw.week")).toBeUndefined();
    expect(s.derived.trendLb).toBe(trendAt(r.weights!, today).lb);
    expect(s.derived.calorieCheck?.kind).not.toBe("insufficient");
    // too few weigh-ins: says so, never a number
    const few = buildSnapshot(raw({ weights: r.weights!.slice(-3) }));
    expect(few.facts.find((x) => x.id === "bw.rate")?.value).toBe("Not enough data yet");
  });

  it("is honest about missing bodyweight data", () => {
    const s = buildSnapshot(raw({ weights: [] }));
    expect(s.text).toContain("No weigh-ins logged yet.");
    expect(s.derived.trendLb).toBeNull();
    expect(s.derived.calorieCheck).toBeNull();
  });

  it("never counts planned days before the start date as missed", () => {
    const p = { ...raw().profile, start_date: today };
    const s = buildSnapshot(raw({ profile: p, training: { ...raw().training!, sessions: [], sets: [] } }));
    const f = (id: string) => s.facts.find((x) => x.id === id);
    expect(f("tr.count7")?.detail).toBe("0 of 0 planned training days done so far (counting from the start date, Oct 16)");
    expect(f("tr.count28")?.detail).not.toMatch(/adherence/);
    expect(f("plan.week")?.detail).toMatch(/Mon Shoulders, Biceps & Triceps A — before the start date/);
    expect(f("plan.week")?.detail).not.toMatch(/not logged/);
  });

  it("dates goal changes in the user's time zone, not UTC", () => {
    // 9:30 pm Oct 1 in Toronto is already Oct 2 in UTC
    const g = [{ field: "calorie_goal", old_value: 3100, new_value: 3300, changed_at: "2026-10-02T01:30:00+00:00", source: "suggestion" }];
    const toronto = buildSnapshot(raw({ goalChanges: g, timeZone: "America/Toronto" }));
    expect(toronto.derived.lastCalorieChange).toBe("2026-10-01");
    expect(toronto.facts.find((f) => f.id === "goal.change.1")?.detail).toBe("on Oct 1 (suggestion)");
    expect(buildSnapshot(raw({ goalChanges: g, timeZone: null })).derived.lastCalorieChange).toBe("2026-10-02");
    expect(dateInZone("2026-10-02T01:30:00Z", "Not/AZone")).toBe("2026-10-02");
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
  it("keeps comparisons that only look like tags", () => {
    expect(sanitizeAnswer("Keep sets < 10 and rest > 2 min <b>now</b>")).toBe("Keep sets < 10 and rest > 2 min now");
  });
  it("keeps up to three short, unique follow-ups", () => {
    expect(sanitizeFollowUps(["What now?", "What now?", 3, "x", "**Bold** one", "a".repeat(120), "Four?", "Five?"])).toEqual(["What now?", "Bold one", "Four?"]);
  });
  it("titles conversations from the first question", () => {
    expect(titleFrom("  Am I eating enough?  ")).toBe("Am I eating enough?");
    expect(titleFrom("[About: Push A today]\nWhat should I focus on?")).toBe("What should I focus on?");
    expect(titleFrom("Give me my weekly summary: training, nutrition, bodyweight and recovery for the last 7 days.")).toBe("Weekly summary");
    expect(titleFrom("Should I trim my chest day because my arms are still sore from yesterday?")).toBe("Should I trim my chest day because my arms are still sore…");
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

describe("coach prompt and mock (PROGRAM-ARNOLD §6.3)", () => {
  it("coaches the Arnold split and never mentions volleyball or jumps", () => {
    expect(COACH_SYSTEM_RULES).toContain("Arnold");
    expect(COACH_SYSTEM_RULES).toContain("1–3 reps in reserve");
    expect(COACH_SYSTEM_RULES).not.toMatch(/volley|jump/i);
  });
  it("the dev mock never mentions volleyball, and answers the overlap question", () => {
    const snap = buildSnapshot(raw());
    for (const q of ["Is my arm day hurting my chest day?", "Do I need a lighter week?", "Should I drink more water?", "What should I train today?", "Should I go easy on legs?"]) {
      const m = buildMockReply(q, snap, raw().profile);
      expect(JSON.stringify(m), q).not.toMatch(/volley|jump/i);
    }
    expect(buildMockReply("Is my arm day hurting my chest day?", snap, raw().profile).cited_fact_ids).toContain("plan.today");
  });
});
