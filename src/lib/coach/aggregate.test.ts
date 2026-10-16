import { describe, expect, it } from "vitest";
import {
  describeSets,
  liftTrends,
  measurementChanges,
  mergeSchedule,
  monthlyWeights,
  muscleSets,
  nutritionWindow,
  recoverySummary,
  resolvePlan,
  signed,
  trainingAdherence,
  type HistorySet,
} from "./aggregate";

const set = (date: string, session: string, slug: string, w: number | null, reps: number | null, idx = 0, name = slug): HistorySet => ({
  session_id: session,
  local_date: date,
  exercise_slug: slug,
  exercise_name: name,
  set_index: idx,
  weight_lb: w,
  reps,
  duration_sec: null,
  e1rm_lb: w && reps && reps <= 12 ? Math.round(w * (1 + reps / 30) * 10) / 10 : null,
});

describe("liftTrends", () => {
  it("tracks first vs latest e1RM and the last top sets", () => {
    const rows = [
      set("2026-09-14", "a", "barbell-bench-press", 165, 6, 0, "Barbell Bench Press"),
      set("2026-09-14", "a", "barbell-bench-press", 165, 5, 1, "Barbell Bench Press"),
      set("2026-09-21", "b", "barbell-bench-press", 170, 6, 0, "Barbell Bench Press"),
      set("2026-09-28", "c", "barbell-bench-press", 175, 6, 0, "Barbell Bench Press"),
      set("2026-09-28", "c", "barbell-bench-press", 175, 5, 1, "Barbell Bench Press"),
    ];
    const [t] = liftTrends(rows);
    expect(t.slug).toBe("barbell-bench-press");
    expect(t.sessions).toHaveLength(3);
    expect(t.firstE1rm).toBe(198);
    expect(t.latestE1rm).toBe(210);
    expect(t.change).toBe(12);
    expect(t.stalled).toBe(false);
    expect(t.sessionsSinceGain).toBe(0);
    expect(describeSets(t.sessions.at(-1)!.sets, (lb) => String(lb))).toBe("175×6, 175×5");
  });

  it("flags a stall after 3+ sessions with no e1RM gain", () => {
    const rows = [
      set("2026-09-01", "a", "back-squat", 225, 5),
      set("2026-09-08", "b", "back-squat", 225, 5),
      set("2026-09-15", "c", "back-squat", 220, 5),
      set("2026-09-22", "d", "back-squat", 225, 4),
    ];
    const [t] = liftTrends(rows);
    expect(t.sessionsSinceGain).toBe(3);
    expect(t.stalled).toBe(true);
  });

  it("is not a stall with only two flat sessions after a gain", () => {
    const rows = [set("2026-09-01", "a", "back-squat", 225, 5), set("2026-09-08", "b", "back-squat", 235, 5), set("2026-09-15", "c", "back-squat", 235, 5), set("2026-09-22", "d", "back-squat", 230, 5)];
    const [t] = liftTrends(rows);
    expect(t.sessionsSinceGain).toBe(2);
    expect(t.stalled).toBe(false);
  });

  it("handles bodyweight-only sets without inventing an e1RM", () => {
    const [t] = liftTrends([set("2026-09-01", "a", "pull-up", null, 10), set("2026-09-08", "b", "pull-up", 0, 11)]);
    expect(t.firstE1rm).toBeNull();
    expect(t.change).toBeNull();
    expect(t.stalled).toBe(false);
    expect(describeSets(t.sessions[1].sets, String)).toBe("BW×11");
  });

  it("puts compound lifts before isolation lifts", () => {
    const t = liftTrends([set("2026-09-01", "a", "cable-lateral-raise", 15, 15), set("2026-09-01", "a", "back-squat", 225, 5)]);
    expect(t.map((x) => x.slug)).toEqual(["back-squat", "cable-lateral-raise"]);
  });
});

describe("muscleSets", () => {
  it("counts primary-muscle working sets in the window and skips jumps", () => {
    const rows = [
      set("2026-10-10", "a", "ez-bar-curl", 60, 10),
      set("2026-10-10", "a", "ez-bar-curl", 60, 9, 1),
      set("2026-10-12", "b", "preacher-curl", 55, 10),
      set("2026-10-12", "b", "hammer-curl", 30, 12),
      set("2026-10-12", "b", "box-jump", null, 3),
      set("2026-10-01", "z", "ez-bar-curl", 60, 10), // outside window
    ];
    const v = muscleSets(rows, "2026-10-10", "2026-10-16");
    const biceps = v.find((x) => x.muscle === "biceps")!;
    expect(biceps.sets).toBe(3);
    expect(biceps.exercises.sort()).toEqual(["ez-bar-curl", "preacher-curl"]);
    expect(v.find((x) => x.muscle === "brachialis")?.sets).toBe(1);
    // reported even when nothing was trained
    expect(v.find((x) => x.muscle === "hamstrings")?.sets).toBe(0);
    expect(v.find((x) => x.muscle === "quads")?.sets ?? 0).toBe(0);
  });

  it("uses custom exercise muscles when the slug isn't in the library", () => {
    const v = muscleSets([set("2026-10-10", "a", "my-curl", 20, 12)], "2026-10-10", "2026-10-10", { "my-curl": ["biceps"] });
    expect(v.find((x) => x.muscle === "biceps")?.sets).toBe(1);
  });
});

describe("schedule", () => {
  it("merges the weekly schedule and applies per-date overrides", () => {
    const s = mergeSchedule({ "1": "pull_a", bogus: "x" });
    expect(s["1"]).toBe("pull_a");
    expect(s["0"]).toBe("rest");
    expect(resolvePlan("2026-10-16", s, []).key).toBe("pull_b"); // Friday default
    const o = resolvePlan("2026-10-16", s, [{ plan_date: "2026-10-16", template_key: "rest", reason: "rest", moved_from: null }]);
    expect(o).toMatchObject({ key: "rest", overridden: true, reason: "rest" });
  });

  it("measures adherence against planned days, not counting an unfinished today", () => {
    const s = mergeSchedule(null);
    const plan = (d: string) => resolvePlan(d, s, []).key;
    // Mon 12 → Fri 16 Oct 2026 are training days; Mon/Tue/Thu done, Wed missed, Fri (today) not yet
    const a = trainingAdherence(["2026-10-12", "2026-10-13", "2026-10-15"], "2026-10-12", "2026-10-18", "2026-10-16", plan);
    expect(a).toEqual({ planned: 4, done: 3, plannedDone: 3, extra: 0 });
    // an extra session on a rest day counts as extra
    const b = trainingAdherence(["2026-10-11"], "2026-10-11", "2026-10-11", "2026-10-16", plan);
    expect(b).toEqual({ planned: 0, done: 1, plannedDone: 0, extra: 1 });
  });
});

describe("nutritionWindow", () => {
  const day = (d: string, kcal: number, p: number, entries = 3) => ({ local_date: d, calories: kcal, protein_g: p, carbs_g: 300, fat_g: 80, entries });
  it("averages logged days only and reports how many were logged", () => {
    const w = nutritionWindow([day("2026-10-15", 3000, 180), day("2026-10-14", 3200, 170), day("2026-10-13", 0, 0, 0), day("2026-10-01", 9999, 9)], "2026-10-15", 7);
    expect(w.from).toBe("2026-10-09");
    expect(w.daysLogged).toBe(2);
    expect(w.avg).toEqual({ calories: 3100, protein: 175, carbs: 300, fat: 80 });
  });
  it("returns null averages when nothing was logged", () => {
    expect(nutritionWindow([], "2026-10-15", 14)).toMatchObject({ daysLogged: 0, avg: null });
  });
});

describe("monthlyWeights", () => {
  it("groups weigh-ins by calendar month", () => {
    const m = monthlyWeights([
      { local_date: "2026-10-02", weight_lb: 164 },
      { local_date: "2026-09-29", weight_lb: 163 },
      { local_date: "2026-10-16", weight_lb: 166 },
    ]);
    expect(m.map((x) => x.month)).toEqual(["2026-09", "2026-10"]);
    expect(m[1]).toMatchObject({ avg: 165, n: 2, first: { date: "2026-10-02", lb: 164 }, last: { date: "2026-10-16", lb: 166 } });
  });
});

describe("recoverySummary", () => {
  const ci = (d: string, extra: Partial<Parameters<typeof recoverySummary>[0][number]> = {}) => ({
    local_date: d,
    sleep_hours: 7,
    sleep_quality: 3,
    energy: 3,
    soreness: 2,
    fatigue: 2,
    stress: 2,
    pain_notes: null,
    volleyball: false,
    ...extra,
  });
  it("keeps the latest n check-ins, averages filled fields and surfaces pain notes", () => {
    const logs = [ci("2026-10-01", { sleep_hours: 4 }), ...Array.from({ length: 7 }, (_, i) => ci(`2026-10-1${i}`, i === 3 ? { pain_notes: " left knee ache ", soreness: 5 } : {}))];
    const r = recoverySummary(logs, 7);
    expect(r.recent).toHaveLength(7);
    expect(r.recent[0].local_date).toBe("2026-10-16");
    expect(r.avg.sleep_hours).toBe(7); // the old 4 h night is outside the window
    expect(r.avg.soreness).toBe(2.4);
    expect(r.pain).toEqual([{ date: "2026-10-13", note: "left knee ache" }]);
  });
  it("ignores blank metrics instead of counting them as zero", () => {
    const r = recoverySummary([ci("2026-10-15", { energy: null }), ci("2026-10-16", { energy: 4 })]);
    expect(r.avg.energy).toBe(4);
    expect(r.counts.energy).toBe(1);
  });
});

describe("measurementChanges", () => {
  it("compares first vs latest per field, skipping blanks", () => {
    const c = measurementChanges([
      { local_date: "2026-10-09", waist_in: 30.75, biceps_flexed_in: null },
      { local_date: "2026-09-11", waist_in: 30.5, biceps_flexed_in: 14.25 },
    ]);
    const waist = c.find((x) => x.key === "waist_in")!;
    expect(waist).toMatchObject({ change: 0.25, entries: 2, first: { date: "2026-09-11" }, latest: { date: "2026-10-09" } });
    const biceps = c.find((x) => x.key === "biceps_flexed_in")!;
    expect(biceps.entries).toBe(1);
    expect(c.find((x) => x.key === "calf_in")).toBeUndefined();
  });
});

describe("signed", () => {
  it("uses a true minus and no sign for zero", () => {
    expect(signed(0.44)).toBe("+0.4");
    expect(signed(-1.25, 2)).toBe("−1.25");
    expect(signed(0.01)).toBe("0");
  });
});
