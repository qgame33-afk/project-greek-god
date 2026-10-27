import { describe, expect, it } from "vitest";
import { displayLoad } from "@/lib/training/loads";
import { aimLine, finishLine, lastTimeText, spokenTime, tipRows, tipTitle, verdict, weightUnit, winSentence, workUnit } from "./words";

const id = (n: number) => n;

describe("workout words", () => {
  it("names the weight unit by how the lift is loaded", () => {
    expect(weightUnit({ perHand: true }, "weight_reps", "kg")).toBe("kg each hand");
    expect(weightUnit({ perHand: false }, "weight_reps", "kg")).toBe("kg");
    expect(weightUnit(undefined, "bodyweight_reps", "kg")).toBe("kg added");
  });

  it("says each side for per-side reps and sec for timed sets", () => {
    expect(workUnit("weight_reps", true)).toBe("reps each side");
    expect(workUnit("weight_reps", false)).toBe("reps");
    expect(workUnit("weight_time", false)).toBe("sec");
  });

  it("writes the aim line", () => {
    expect(aimLine(12, 20, "reps")).toBe("aim 12–20 reps");
    expect(aimLine(10, 15, "each")).toBe("aim 10–15 reps each side");
    expect(aimLine(30, 45, "sec")).toBe("aim 30–45 sec");
    expect(aimLine(null, null, "reps")).toBeNull();
  });

  it("writes last time with one weight when every set used it", () => {
    const s = (w: number, r: number) => ({ weight_lb: w, reps: r, duration_sec: null });
    expect(lastTimeText([s(25, 16), s(25, 15), s(25, 14), s(25, 13)], "weight_reps", id)).toBe("25 × 16, 15, 14, 13");
    expect(lastTimeText([s(135, 8), s(140, 6)], "weight_reps", id)).toBe("135 × 8, 140 × 6");
    // stored values shown once through the display helper: 50 → 22.5 kg, 49.6 → 22.5 kg
    expect(lastTimeText([s(50, 12), s(49.6, 10)], "weight_reps", (v) => displayLoad(v, "kg"))).toBe("22.5 × 12, 10");
    expect(lastTimeText([s(0, 12), s(0, 10)], "bodyweight_reps", id)).toBe("12, 10");
    expect(lastTimeText([], "weight_reps", id)).toBeNull();
  });

  it("words the new best by case", () => {
    expect(winSentence({ weightLb: 49.6, reps: 17 }, { weightLb: 49.6, reps: 16 }, "22.5 kg", "each hand")).toBe("Most reps you've done at 22.5 kg each hand.");
    expect(winSentence({ weightLb: 140, reps: 10 }, { weightLb: 135, reps: 10 }, "63.5 kg", "")).toBe("Heaviest you've done for 10 reps.");
    expect(winSentence({ weightLb: 140, reps: 8 }, { weightLb: 120, reps: 12 }, "63.5 kg", "")).toBe("Your strongest set yet.");
  });

  it("turns lift results into plain verdicts, never the estimate's jargon", () => {
    expect(verdict({ timing: "record", delta: "+6 e1RM" })).toEqual({ text: "New best", win: true });
    expect(verdict({ timing: "beat", delta: "+1 rep" })?.text).toBe("+1 rep");
    expect(verdict({ timing: "below", delta: "−1 rep" })?.text).toBe("−1 rep");
    expect(verdict({ timing: "matched", delta: "= last" })?.text).toBe("Same");
    expect(verdict({ timing: "beat", delta: "+4 e1RM" })?.text).toBe("Better");
    expect(verdict({ timing: null, delta: null })).toBeNull();
  });

  it("speaks times", () => {
    expect(spokenTime(72)).toBe("1 minute 12 seconds");
    expect(spokenTime(60)).toBe("1 minute");
    expect(spokenTime(5)).toBe("5 seconds");
  });

  it("builds the tip rows from the advice", () => {
    const names: Record<string, string> = { "pec-deck": "Pec Deck", "db-bench-press": "Flat Dumbbell Bench Press", "machine-shoulder-press": "Machine Shoulder Press" };
    const rows = tipRows(
      {
        actions: [
          { kind: "reorder", move: "pec-deck", before: "db-bench-press" },
          { kind: "drop", slug: "db-bench-press", sets: 1 },
          { kind: "rir", slug: "machine-shoulder-press", rir: "2–3" },
        ],
      },
      (s) => names[s],
      () => 2,
    );
    expect(rows).toEqual([
      { title: "Pec Deck next", detail: "Before Flat Dumbbell Bench Press" },
      { title: "Flat Dumbbell Bench Press", detail: "1 set instead of 2" },
      { title: "Stop with 2–3 reps left", detail: "On Machine Shoulder Press" },
    ]);
    expect(tipTitle({ muscle: "triceps" }, "Thursday")).toBe("Triceps tired from Thursday");
    expect(tipRows({ actions: [{ kind: "rir", slug: "machine-shoulder-press", rir: "0" }] }, (s) => names[s], () => 2)[0].title).toBe("Go to failure");
  });

  it("counts what finishing drops", () => {
    expect(finishLine(2, 17)).toBe("2 sets are not logged. They will be dropped.");
    expect(finishLine(1, 18)).toBe("1 set is not logged. It will be dropped.");
    expect(finishLine(0, 19)).toBe("All 19 sets are logged.");
  });
});
