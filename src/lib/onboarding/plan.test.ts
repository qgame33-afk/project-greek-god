import { describe, expect, it } from "vitest";
import { macroLine, macrosOverflow } from "./macros";
import {
  OATH_STEPS,
  answersFromProfile,
  firstInvalidOathStep,
  paceVerdict,
  validateOathStep,
  normalizeSchedule,
  planSummary,
  profileUpdateFromAnswers,
  restoreDraft,
  roadmapSteps,
  SCHEDULE_OPTIONS,
  scheduleSummary,
  shiftRange,
  validateStep,
  weeklyRateText,
  type OnboardingAnswers,
} from "./plan";

const TODAY = "2026-10-16";

const ownerProfile = {
  display_name: null,
  height_cm: 189.2,
  start_weight_lb: 163,
  goal_weight_lb: 183,
  goal_range_min_lb: 180,
  goal_range_max_lb: 185,
  start_date: "2026-10-16",
  target_date: "2027-08-01",
  experience: "intermediate",
  weight_unit: "lb",
  length_unit: "in",
  calorie_goal: 3300,
  protein_goal: 185,
  fat_goal: 85,
  water_goal_ml: 3000,
  sleep_goal_h: 8,
  weekly_schedule: { "0": "rest", "1": "push_a", "2": "pull_a", "3": "legs_a", "4": "push_b", "5": "pull_b", "6": "legs_b" },
  training_mode: "standard",
  timezone: "America/Toronto",
  onboarded: false,
};

const owner = (): OnboardingAnswers => answersFromProfile(ownerProfile, TODAY, "America/Toronto");

describe("macroLine", () => {
  it("confirms the owner's targets add up", () => {
    const l = macroLine({ calories: 3300, protein: 185, carbs: 449, fat: 85 });
    expect(l.ok).toBe(true);
    expect(l.total).toBe(3301);
    expect(l.text).toBe("Macros = 3,301 kcal ✓");
  });
  it("calls out targets above the calorie goal", () => {
    // 185×4 + 504×4 + 85×9 = 3,521 → "3,520"-ish example from DESIGN, here exact
    const l = macroLine({ calories: 3300, protein: 185, carbs: 504, fat: 85 });
    expect(l.ok).toBe(false);
    expect(l.diff).toBe(221);
    expect(l.text).toBe("Macros total 3,521 kcal, 221 above target");
  });
  it("calls out targets below the calorie goal", () => {
    const l = macroLine({ calories: 3300, protein: 150, carbs: 400, fat: 70 });
    expect(l.text).toBe("Macros total 2,830 kcal, 470 below target");
  });
  it("detects protein + fat overflowing calories", () => {
    expect(macrosOverflow(1500, 250, 100)).toBe(true);
    expect(macrosOverflow(3300, 185, 85)).toBe(false);
  });
});

describe("answersFromProfile", () => {
  it("prefills the owner's profile and starts today", () => {
    const a = owner();
    expect(a.startWeightLb).toBe(163);
    expect(a.goalWeightLb).toBe(183);
    expect(a.heightCm).toBe(189.2);
    expect(a.startDate).toBe(TODAY);
    expect(a.targetDate).toBe("2027-08-01");
    expect(a.experience).toBe("intermediate");
    expect(a.calorieGoal).toBe(3300);
    expect(a.proteinGoal).toBe(185);
    expect(a.todayWeighInLb).toBeNull();
    expect(a.introVolume).toBe(false);
  });
  it("handles numeric strings and a missing profile", () => {
    const a = answersFromProfile({ start_weight_lb: "170.5", sleep_goal_h: "8.5" }, TODAY, null);
    expect(a.startWeightLb).toBe(170.5);
    expect(a.sleepGoalH).toBe(8.5);
    expect(a.timezone).toBe("UTC");
    const b = answersFromProfile(null, TODAY, "Europe/London");
    expect(b.startWeightLb).toBe(163);
    expect(b.timezone).toBe("Europe/London");
  });
  it("keeps an onboarded user's start date and never proposes a past target", () => {
    const a = answersFromProfile({ ...ownerProfile, onboarded: true, start_date: "2026-09-11", target_date: "2026-01-01" }, TODAY, null);
    expect(a.startDate).toBe("2026-09-11");
    expect(a.targetDate).toBe("2027-08-01");
  });
});

describe("normalizeSchedule / restoreDraft", () => {
  it("fills missing or bad days from the Arnold week (a Push/Pull/Legs day is not an option)", () => {
    const s = normalizeSchedule({ "1": "legs_abs_b", "2": "nonsense", "3": "legs_a" });
    expect(s["1"]).toBe("legs_abs_b");
    expect(s["2"]).toBe("chest_back_a");
    expect(s["3"]).toBe("legs_abs_a");
    expect(s["0"]).toBe("rest");
    expect(normalizeSchedule(undefined)).toEqual({ "1": "shoulders_arms_a", "2": "chest_back_a", "3": "legs_abs_a", "4": "shoulders_arms_b", "5": "chest_back_b", "6": "legs_abs_b", "0": "rest" });
  });
  it("offers the Arnold days by their short names, then Rest", () => {
    expect(SCHEDULE_OPTIONS.map((o) => o.label)).toEqual(["Shoulders & Arms A", "Chest & Back A", "Legs & Abs A", "Shoulders & Arms B", "Chest & Back B", "Legs & Abs B", "Rest"]);
  });
  it("restores a stored draft but drops malformed fields", () => {
    const d = restoreDraft(owner(), { goalWeightLb: 185, weightUnit: "stone", calorieGoal: "lots", todayWeighInLb: 163.4, schedule: { "0": "chest_back_a" } });
    expect(d.goalWeightLb).toBe(185);
    expect(d.weightUnit).toBe("lb");
    expect(d.calorieGoal).toBe(3300);
    expect(d.todayWeighInLb).toBe(163.4);
    expect(d.schedule["0"]).toBe("chest_back_a");
    expect(restoreDraft(owner(), null)).toEqual(owner());
  });
});

describe("shiftRange", () => {
  it("leaves the band alone while the goal is inside it", () => {
    expect(shiftRange(183, 180, 185)).toEqual({ min: 180, max: 185 });
  });
  it("moves the band with the goal, keeping its shape", () => {
    expect(shiftRange(190, 180, 185)).toEqual({ min: 187, max: 192 });
    expect(shiftRange(170, 180, 185)).toEqual({ min: 167, max: 172 });
  });
  it("shifted from a fixed anchor, typing a goal keystroke by keystroke never drags the band", () => {
    // the goal field passes through 1 → 18 → 184 while the user types "184"
    let band = { min: 180, max: 185 };
    for (const v of [1, 18, 184]) band = shiftRange(v, 180, 185);
    expect(band).toEqual({ min: 180, max: 185 });
    // and leaving the band then coming back restores it exactly
    expect(shiftRange(200, 180, 185)).toEqual({ min: 197, max: 202 });
    expect(shiftRange(183, 180, 185)).toEqual({ min: 180, max: 185 });
  });
});

describe("planSummary", () => {
  it("builds the owner's placard", () => {
    const p = planSummary(owner());
    expect(p.days).toBe(289);
    expect(p.weeks).toBe(42);
    expect(p.trainingDays).toBe(6);
    expect(p.weeklyRateLb).toBe(0.48);
    expect(p.tooFast).toBe(false);
    expect(p.carbs).toBe(449);
    expect(p.macro.text).toBe("Macros = 3,301 kcal ✓");
    expect(p.placard).toBe("163 → 183 LB · 42 WEEKS · 6 DAYS A WEEK · 3,300 KCAL · 185 G");
  });
  it("uses the display unit on the placard", () => {
    const p = planSummary({ ...owner(), weightUnit: "kg" });
    expect(p.placard.startsWith("73.9 → 83 KG")).toBe(true);
  });
  it("flags a pace above 1 lb per week", () => {
    const p = planSummary({ ...owner(), targetDate: "2026-12-31" });
    expect(p.weeklyRateLb).toBeGreaterThan(1);
    expect(p.tooFast).toBe(true);
  });
  it("counts singular days and weeks", () => {
    const s = { ...owner().schedule, "2": "rest", "3": "rest", "4": "rest", "5": "rest", "6": "rest" } as OnboardingAnswers["schedule"];
    const p = planSummary({ ...owner(), schedule: s, targetDate: "2026-10-20" });
    expect(p.placard).toContain("1 WEEK ·");
    expect(p.placard).toContain("1 DAY A WEEK ·");
  });
});

describe("roadmapSteps", () => {
  it("maps October → August onto the eleven SPEC milestones", () => {
    const r = roadmapSteps("2026-10-16", "2027-08-01", 163, "lb");
    expect(r).toHaveLength(11);
    expect(r[0]).toMatchObject({ label: "OCT", year: 2026, title: "The start" });
    expect(r[0].detail).toContain("Start at 163 lb");
    expect(r[2].title).toBe("First progress review");
    expect(r[5].title).toBe("Midpoint");
    expect(r[10]).toMatchObject({ label: "AUG", year: 2027, title: "Final review" });
  });
  it("compresses shorter plans but keeps the first and final months", () => {
    const r = roadmapSteps("2026-10-16", "2027-02-10", 163, "kg");
    expect(r.map((x) => x.label)).toEqual(["OCT", "NOV", "DEC", "JAN", "FEB"]);
    expect(r[0].detail).toContain("73.9 kg");
    expect(r.at(-1)!.title).toBe("Final review");
    expect(new Set(r.map((x) => x.title)).size).toBe(r.length);
  });
  it("caps very long plans", () => {
    expect(roadmapSteps("2026-10-16", "2030-10-01", 163, "lb", 24)).toHaveLength(24);
  });
});

describe("weeklyRateText", () => {
  it("formats gain, loss and hold", () => {
    expect(weeklyRateText(0.48, "lb")).toBe("≈ 0.48 lb per week");
    expect(weeklyRateText(0.5, "lb")).toBe("≈ 0.5 lb per week");
    expect(weeklyRateText(1.2, "lb")).toBe("≈ 1.2 lb per week");
    expect(weeklyRateText(-0.3, "lb")).toBe("≈ 0.3 lb loss per week");
    expect(weeklyRateText(0, "lb")).toBe("Hold your current weight");
    expect(weeklyRateText(0.48, "kg")).toBe("≈ 0.22 kg per week");
    expect(weeklyRateText(null, "lb")).toContain("after your start date");
  });
});

describe("validateStep", () => {
  it("passes the owner's defaults on every step", () => {
    for (const s of ["welcome", "body", "goal", "training", "nutrition", "units", "finale"] as const) expect(validateStep(s, owner(), TODAY)).toEqual({});
  });
  it("rejects a target date that isn't after today", () => {
    expect(validateStep("goal", { ...owner(), targetDate: TODAY }, TODAY).targetDate).toBe("Pick a date after today.");
    expect(validateStep("goal", { ...owner(), targetDate: "2026-01-01" }, TODAY).targetDate).toBe("Pick a date after today.");
    expect(validateStep("goal", { ...owner(), targetDate: "" }, TODAY).targetDate).toBe("Pick a target date.");
  });
  it("rejects impossible body values and a bad optional weigh-in", () => {
    const e = validateStep("body", { ...owner(), startWeightLb: 20, heightCm: 40, todayWeighInLb: 900 }, TODAY);
    expect(e.startWeightLb).toBeTruthy();
    expect(e.heightCm).toBeTruthy();
    expect(e.todayWeighInLb).toBeTruthy();
  });
  it("rejects macros that can't add up", () => {
    expect(validateStep("nutrition", { ...owner(), calorieGoal: 1500, proteinGoal: 300, fatGoal: 120 }, TODAY).macros).toBeTruthy();
    expect(validateStep("nutrition", { ...owner(), calorieGoal: 900 }, TODAY).calorieGoal).toBeTruthy();
  });
});

describe("profileUpdateFromAnswers", () => {
  it("derives carbs, marks onboarded and widens the range to include the goal", () => {
    const u = profileUpdateFromAnswers({ ...owner(), displayName: "  Quinton ", goalWeightLb: 186, introVolume: true });
    expect(u.display_name).toBe("Quinton");
    expect(u.carb_goal).toBe(449);
    expect(u.onboarded).toBe(true);
    expect(u.training_mode).toBe("intro");
    expect(u.goal_range_max_lb).toBe(186);
    expect(u.start_date).toBe(TODAY);
    expect(u.weekly_schedule["0"]).toBe("rest");
    // a Push/Pull/Legs week from an old profile starts on the Arnold split; volleyball is never written
    expect(u.weekly_schedule["1"]).toBe("shoulders_arms_a");
    expect("volleyball_per_week" in u).toBe(false);
  });
  it("stores an empty name as null", () => {
    expect(profileUpdateFromAnswers(owner()).display_name).toBeNull();
  });
  it("keeps a quarter-hour sleep goal", () => {
    expect(profileUpdateFromAnswers({ ...owner(), sleepGoalH: 8.25 }).sleep_goal_h).toBe(8.25);
    expect(profileUpdateFromAnswers({ ...owner(), sleepGoalH: 7.75 }).sleep_goal_h).toBe(7.75);
  });
});

describe("scheduleSummary", () => {
  it("names the default split", () => {
    expect(scheduleSummary(owner().schedule)).toBe("6 days · Arnold split");
    expect(scheduleSummary({ ...owner().schedule, "6": "rest" })).toBe("5 days · Arnold split");
  });
});

describe("the Oath (five steps)", () => {
  it("reads the usual training time from prefs and never writes it to the profile", () => {
    const a = answersFromProfile({ ...ownerProfile, prefs: { day: { trainAt: "16:30" }, tapLogsGhost: false } }, TODAY, "America/Toronto");
    expect(a.trainAt).toBe("16:30");
    expect(owner().trainAt).toBeNull();
    // the same answers give the same profile columns whatever the training time
    expect(profileUpdateFromAnswers(a)).toEqual(profileUpdateFromAnswers({ ...a, trainAt: null }));
    expect("trainAt" in profileUpdateFromAnswers(a)).toBe(false);
  });
  it("restores a drafted training time, and drops a malformed one", () => {
    expect(restoreDraft(owner(), { trainAt: "17:15" }).trainAt).toBe("17:15");
    expect(restoreDraft(owner(), { trainAt: null }).trainAt).toBeNull();
    expect(restoreDraft(owner(), { trainAt: "late" }).trainAt).toBeNull();
  });
  it("validates exactly what the seven steps validated, grouped into five", () => {
    const bad = { ...owner(), startWeightLb: 20, timezone: " ", goalWeightLb: 9, calorieGoal: 100 };
    expect(Object.keys(validateOathStep("climber", bad, TODAY)).sort()).toEqual(["startWeightLb", "timezone"]);
    expect(validateOathStep("summit", bad, TODAY).goalWeightLb).toBeTruthy();
    expect(validateOathStep("training", { ...bad, volleyballPerWeek: 20 }, TODAY)).toEqual({});
    expect(validateOathStep("fuel", bad, TODAY).calorieGoal).toBeTruthy();
    expect(validateOathStep("oath", bad, TODAY)).toEqual({});
    expect(firstInvalidOathStep(bad, TODAY)).toBe("climber");
    for (const st of OATH_STEPS) expect(validateOathStep(st, owner(), TODAY)).toEqual({});
    expect(firstInvalidOathStep(owner(), TODAY)).toBeNull();
    expect(validateOathStep("training", { ...owner(), trainAt: "25:00" }, TODAY).trainAt).toBeTruthy();
  });
  it("names the pace in plain words", () => {
    expect(paceVerdict(null)).toBeNull();
    expect(paceVerdict(0)).toBe("hold");
    expect(paceVerdict(0.43)).toBe("achievable");
    expect(paceVerdict(0.7)).toBe("fast");
    expect(paceVerdict(1.4)).toBe("too_fast");
    expect(paceVerdict(-0.5)).toBe("loss");
  });
});
