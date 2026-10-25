import { describe, expect, it } from "vitest";
import type { PastSet } from "@/lib/training/progression";
import { mkSet } from "./fixtures";
import { classifyLog, prSetIds, type PriorBest } from "./pr";
import { groupSets } from "./session";
import { modeFamily, priorSameIndex, recordReps, setTiming, timeBetweenSets, timingsForGroup } from "./timing";

const prior = (e1rm: number | null, sets = 9): PriorBest => ({ e1rm, sets, weightLb: null, reps: null });
const done = (p: Parameters<typeof mkSet>[0] = {}) => mkSet({ completed: true, ...p });
const last = (weight_lb: number | null, reps: number | null, duration_sec: number | null = null) => ({ weight_lb, reps, duration_sec });

describe("setTiming", () => {
  it("nothing for warm-ups and unlogged sets", () => {
    expect(setTiming(mkSet({ weight_lb: 200, reps: 5 }), last(190, 5), prior(220))).toEqual({ timing: null, e1rm: null, delta: null });
    expect(setTiming(done({ kind: "warmup", weight_lb: 95, reps: 5 }), last(95, 5), prior(220)).timing).toBeNull();
  });

  it("first benchmark with no history, never a record", () => {
    const r = setTiming(done({ weight_lb: 185, reps: 6 }), null, prior(null, 0));
    expect(r.timing).toBe("first");
    expect(r.e1rm).toBe(222);
    expect(r.delta).toBeNull();
  });

  it("record beats 'beat': a set over the all-time best is a record, with the gain", () => {
    const r = setTiming(done({ weight_lb: 190, reps: 6 }), last(185, 6), prior(222));
    expect(r.timing).toBe("record");
    expect(r.e1rm).toBe(228);
    expect(r.delta).toEqual({ e1rm: 6 });
  });

  it("the 1 lb margin: 185×7 over 180×8 is not a record (§4.3)", () => {
    // 185×7 → 228.2, 180×8 → 228.0
    const r = setTiming(done({ weight_lb: 185, reps: 7 }), last(180, 8), prior(228));
    expect(r.timing).not.toBe("record");
    expect(r.timing).toBe("matched");
    expect(r.delta).toEqual({ e1rm: 0.2 });
  });

  it("beat / matched / below last time on e1RM with a ±1 lb band", () => {
    const best = prior(240);
    expect(setTiming(done({ weight_lb: 190, reps: 6 }), last(185, 6), best)).toMatchObject({ timing: "beat", delta: { e1rm: 6 } });
    expect(setTiming(done({ weight_lb: 185, reps: 6 }), last(185, 6), best)).toMatchObject({ timing: "matched", delta: { e1rm: 0 } });
    expect(setTiming(done({ weight_lb: 185, reps: 5 }), last(185, 6), best)).toMatchObject({ timing: "below", delta: { e1rm: -6.2 } });
    // exactly 1 lb up is beat; less is matched
    expect(setTiming(done({ weight_lb: 186, reps: 6 }), last(185.2, 6), best).timing).toBe("beat"); // 223.2 vs 222.2: +1.0
    expect(setTiming(done({ weight_lb: 186, reps: 6 }), last(185.5, 6), best).timing).toBe("matched"); // 223.2 vs 222.6: +0.6
    expect(setTiming(done({ weight_lb: 200, reps: 3 }), last(190, 5), best).timing).toBe("below"); // 220 vs 221.7
  });

  it("no comparison without a prior set", () => {
    expect(setTiming(done({ weight_lb: 190, reps: 5 }), null, prior(240))).toEqual({ timing: null, e1rm: 221.7, delta: null });
    expect(setTiming(done({ weight_lb: 190, reps: 5 }), null, undefined).timing).toBeNull();
  });

  it("high-rep sets compare weight, then reps", () => {
    const best = prior(150);
    expect(setTiming(done({ weight_lb: 50, reps: 15 }), last(45, 20), best)).toMatchObject({ timing: "beat", delta: { weightLb: 5, reps: -5 } });
    expect(setTiming(done({ weight_lb: 45, reps: 18 }), last(45, 15), best)).toMatchObject({ timing: "beat", delta: { weightLb: 0, reps: 3 } });
    expect(setTiming(done({ weight_lb: 45, reps: 15 }), last(45, 15), best).timing).toBe("matched");
    expect(setTiming(done({ weight_lb: 45, reps: 13 }), last(45, 15), best).timing).toBe("below");
  });

  it("bodyweight reps and timed sets", () => {
    expect(setTiming(done({ weight_lb: null, reps: 12 }), last(null, 10), prior(null)).timing).toBe("beat");
    expect(setTiming(done({ weight_lb: null, reps: 8 }), last(null, 10), prior(null))).toMatchObject({ timing: "below", delta: { reps: -2 } });
    const plank = done({ weight_lb: null, reps: null, duration_sec: 75 });
    expect(setTiming(plank, last(null, null, 60), prior(null))).toEqual({ timing: "beat", e1rm: null, delta: { durationSec: 15 } });
    expect(setTiming(plank, last(null, null, 75), prior(null)).timing).toBe("matched");
    // a weighted carry: heavier beats longer
    expect(setTiming(done({ weight_lb: 70, duration_sec: 30 }), last(60, null, 45), prior(null)).timing).toBe("beat");
  });

  it("a deload week has nothing to compare with until an earlier deload exists", () => {
    const history: PastSet[] = [
      { local_date: "2026-10-12", session_id: "s-std", set_index: 0, weight_lb: 185, reps: 6, duration_sec: null, rir: 1, mode: "standard" },
      { local_date: "2026-09-01", session_id: "s-old", set_index: 0, weight_lb: 160, reps: 8, duration_sec: null, rir: 3, mode: "deload" },
      { local_date: "2026-09-01", session_id: "s-old", set_index: 1, weight_lb: 160, reps: 8, duration_sec: null, rir: 3, mode: "deload" },
    ];
    expect(priorSameIndex(history, 0, "standard")).toEqual(last(185, 6));
    expect(priorSameIndex(history, 0, "intro")).toEqual(last(185, 6)); // intro is the standard family
    expect(priorSameIndex(history, 1, "deload")).toEqual(last(160, 8));
    expect(priorSameIndex(history.slice(0, 1), 0, "deload")).toBeNull();
    expect(priorSameIndex(history, 4, "standard")).toBeNull(); // an extra set last time didn't have
    expect(setTiming(done({ weight_lb: 165, reps: 8 }), priorSameIndex(history.slice(0, 1), 0, "deload"), prior(222)).timing).toBeNull();
    expect(modeFamily(undefined)).toBe("standard");
  });
});

describe("agreement with the one record rule (prSetIds / classifyLog)", () => {
  const fixtures: { name: string; prior: PriorBest; sets: { w: number | null; r: number | null }[] }[] = [
    { name: "two records in a row", prior: prior(222), sets: [{ w: 190, r: 6 }, { w: 195, r: 6 }, { w: 190, r: 5 }] },
    { name: "a record then a tie of it", prior: prior(222), sets: [{ w: 190, r: 6 }, { w: 190, r: 6 }] },
    { name: "the 1 lb margin", prior: prior(228), sets: [{ w: 185, r: 7 }, { w: 180, r: 8 }, { w: 186, r: 7 }] },
    { name: "first benchmark", prior: prior(null, 0), sets: [{ w: 135, r: 8 }, { w: 145, r: 8 }] },
    { name: "history without an e1RM", prior: prior(null, 4), sets: [{ w: 100, r: 10 }] },
    { name: "high reps never a record", prior: prior(150), sets: [{ w: 140, r: 15 }, { w: 120, r: 6 }] },
    { name: "missing weight", prior: prior(200), sets: [{ w: null, r: 8 }, { w: 200, r: 3 }] },
  ];

  for (const f of fixtures) {
    it(f.name, () => {
      const sets = f.sets.map((x, i) =>
        mkSet({ id: `x${i}`, set_index: i, completed: true, completed_at: `2026-10-19T17:0${i}:00Z`, weight_lb: x.w, reps: x.r }),
      );
      const [g] = groupSets(sets);
      const records = prSetIds(g, f.prior);
      const timings = timingsForGroup(g.working, f.prior, [], "standard");
      for (const s of g.working) {
        expect(timings.get(s.id)!.timing === "record", `${s.id} timing vs prSetIds`).toBe(records.has(s.id));
        // the live classification at the moment of the tap agrees too
        const before = groupSets(sets.map((x) => (x.completed_at! >= s.completed_at! ? { ...x, completed: false } : x)))[0];
        const live = classifyLog(s, before, f.prior);
        expect(live.kind === "pr", `${s.id} classifyLog`).toBe(records.has(s.id));
        if (f.prior.sets === 0) expect(timings.get(s.id)!.timing).toBe("first");
      }
    });
  }
});

describe("timingsForGroup", () => {
  it("compares each set with the same set of last session", () => {
    const history: PastSet[] = [0, 1, 2].map((i) => ({ local_date: "2026-10-12", session_id: "p", set_index: i, weight_lb: 185, reps: 6 - i, duration_sec: null, rir: 1, mode: "standard" as const }));
    const sets = [
      done({ id: "a", set_index: 0, completed_at: "2026-10-19T17:00:00Z", weight_lb: 185, reps: 6 }),
      done({ id: "b", set_index: 1, completed_at: "2026-10-19T17:04:00Z", weight_lb: 185, reps: 6 }),
      done({ id: "c", set_index: 2, completed_at: "2026-10-19T17:08:00Z", weight_lb: 185, reps: 3 }),
      mkSet({ id: "d", set_index: 3, weight_lb: 185, reps: 6 }), // not logged
    ];
    const t = timingsForGroup(sets, prior(240), history, "standard");
    expect(t.get("a")!.timing).toBe("matched");
    expect(t.get("b")!.timing).toBe("beat");
    expect(t.get("c")!.timing).toBe("below");
    expect(t.has("d")).toBe(false);
  });
});

describe("recordReps (the record carrot)", () => {
  it("the fewest reps at this load that set a record", () => {
    // best 222: 190 × 6 = 228 ✓, 190 × 5 = 221.7 ✗
    expect(recordReps(190, prior(222))).toEqual({ reps: 6, e1rm: 228, best: 222 });
    // must clear the 1 lb margin: 185 × 7 = 228.2 vs best 228 → 8 reps (234.3)
    expect(recordReps(185, prior(228))!.reps).toBe(8);
  });
  it("nothing for a first benchmark, without a load, or when 12 reps can't do it", () => {
    expect(recordReps(190, prior(null, 0))).toBeNull();
    expect(recordReps(190, prior(null, 3))).toBeNull();
    expect(recordReps(null, prior(222))).toBeNull();
    expect(recordReps(100, prior(222))).toBeNull(); // 100 × 12 = 140
    expect(recordReps(190, undefined)).toBeNull();
  });
});

describe("timeBetweenSets (§3.8)", () => {
  it("is the gap to the previous logged set of the same session; null for the first, a break or an open set", () => {
    const t = (m: number) => new Date(Date.UTC(2026, 9, 20, 18, m)).toISOString();
    const sets = [
      { id: "a", session_id: "x", completed: true, completed_at: t(0) },
      { id: "b", session_id: "x", completed: true, completed_at: t(2) },
      { id: "c", session_id: "x", completed: true, completed_at: t(30) },
      { id: "d", session_id: "x", completed: false, completed_at: null },
      { id: "e", session_id: "y", completed: true, completed_at: t(3) },
    ];
    const m = timeBetweenSets(sets);
    expect(m.get("a")).toBeNull();
    expect(m.get("b")).toBe(120);
    expect(m.get("c")).toBeNull(); // 28 min: a break, not a rest
    expect(m.get("d")).toBeNull();
    expect(m.get("e")).toBeNull();
  });
});
