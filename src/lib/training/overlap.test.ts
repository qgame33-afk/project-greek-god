import { describe, expect, it } from "vitest";
import { adjustFromAdvice, OVERLAP, overlapApplies, overlapInSession, overlapLifts, overlapNextArmDay, overlapPreStart, setDipped, type OverlapSession, type OverlapSet } from "./overlap";
import { TEMPLATE_DEFS } from "./programs";
import type { PastSet } from "./progression";

const MON = "2026-10-26";
const TUE = "2026-10-27";
const cbA = TEMPLATE_DEFS.chest_a;
const armA = TEMPLATE_DEFS.arms_a;
const armDone: OverlapSession = { id: "mon", local_date: MON, status: "done", name: "Arms & Shoulders", template_key: "arms_a" };
/** 22.5 kg and 60 kg as stored (lb, 0.1). */
const P = 49.6;
const LAT = 132.3;
/** Chest & Back with 3 sets on the accessories: the drop-a-set path (a customised day or PPL-sized volume). */
const cb3 = { ...cbA, exercises: cbA.exercises.map((e) => (e.slug === "machine-chest-press" || e.slug === "seated-cable-row" ? { ...e, sets: 3 } : e)) };
const yesterday = { session: armDone, sets: [] as OverlapSet[] };

const ts = (date: string, min: number) => new Date(Date.parse(`${date}T18:00:00Z`) + min * 60_000).toISOString();
/** Logged sets of one lift in a session: [weight, reps][] with 2.5 min between sets. */
const logged = (session: string, date: string, slug: string, sets: [number, number][], restMin = 2.5, start = 0): OverlapSet[] =>
  sets.map(([w, r], i) => ({ id: `${session}-${slug}-${i}`, session_id: session, exercise_slug: slug, set_index: i, weight_lb: w, reps: r, kind: "working", completed: true, completed_at: ts(date, start + i * restMin) }));
const open = (session: string, slug: string, n: number, from = 0): OverlapSet[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${session}-${slug}-o${i}`, session_id: session, exercise_slug: slug, set_index: from + i, weight_lb: null, reps: null, kind: "working", completed: false, completed_at: null }));
const past = (session: string, date: string, sets: [number, number][], restMin = 2.5): PastSet[] =>
  sets.map(([w, r], i) => ({ local_date: date, session_id: session, set_index: i, weight_lb: w, reps: r, duration_sec: null, rir: null, mode: "standard", completed_at: ts(date, i * restMin) }));

describe("when the overlap rules apply", () => {
  it("only on chest and back after an arm day (by family, or by the arm sets logged)", () => {
    expect(overlapApplies(cbA, yesterday)).toBe(true);
    expect(overlapApplies(TEMPLATE_DEFS.chest_b, { session: { ...armDone, template_key: "arms_b" }, sets: [] })).toBe(true);
    expect(overlapApplies(cbA, null)).toBe(false);
    expect(overlapApplies(armA, yesterday)).toBe(false);
    const rearranged = { session: { ...armDone, template_key: "lower_a" }, sets: logged("mon", MON, "incline-db-curl", [[30, 10], [30, 10], [30, 10]]).concat(logged("mon", MON, "cable-triceps-pushdown", [[40, 12], [40, 12], [40, 12]])) };
    expect(overlapApplies(cbA, rearranged)).toBe(true);
    expect(overlapApplies(cbA, { ...rearranged, sets: rearranged.sets.slice(0, 5) })).toBe(false);
  });

  it("never on Push/Pull/Legs days", () => {
    expect(overlapApplies(TEMPLATE_DEFS.pull_a, yesterday)).toBe(false);
    expect(overlapApplies(TEMPLATE_DEFS.push_b, { session: { ...armDone, template_key: "push_a" }, sets: [] })).toBe(false);
  });

  it("watches the first press and pull and eases the second press and pull", () => {
    for (const t of [cbA, TEMPLATE_DEFS.chest_b]) {
      const l = overlapLifts(t);
      expect([l.press?.slug, l.pull?.slug, l.pressAccessory?.slug, l.pullAccessory?.slug, l.chestIsolation?.slug]).toEqual(["incline-db-press", "lat-pulldown", "machine-chest-press", "seated-cable-row", "cable-chest-fly"]);
    }
  });
});

describe("overlapPreStart (arms still sore)", () => {
  it("keeps both sets and stops 1–2 reps short on the accessories when the check-in soreness is 4+", () => {
    const a = overlapPreStart({ today: TUE, template: cbA, yesterday, checkin: { local_date: TUE, soreness: 4 } })!;
    expect(a.actions).toEqual([
      { kind: "rir", slug: "machine-chest-press", rir: "1–2" },
      { kind: "rir", slug: "seated-cable-row", rir: "1–2" },
    ]);
    expect(a.text).toBe("Arms still sore from Arms & Shoulders. Today: stop 1–2 reps short on Machine Chest Press and Seated Cable Row.");
    expect(overlapPreStart({ today: TUE, template: cbA, yesterday, checkin: { local_date: TUE, soreness: 3 } })).toBeNull();
    expect(overlapPreStart({ today: TUE, template: cbA, yesterday: null, checkin: { local_date: TUE, soreness: 5 } })).toBeNull();
  });

  it("drops a set instead when an accessory has 3 or more", () => {
    const a = overlapPreStart({ today: TUE, template: cb3, yesterday, checkin: { local_date: TUE, soreness: 5 } })!;
    expect(a.actions).toEqual([
      { kind: "drop", slug: "machine-chest-press", sets: 1 },
      { kind: "drop", slug: "seated-cable-row", sets: 1 },
    ]);
    expect(a.text).toBe("Arms still sore from Arms & Shoulders. Today: one set fewer on Machine Chest Press and Seated Cable Row.");
  });
});

describe("overlapInSession (first two sets of a watched lift)", () => {
  const prior = { "incline-db-press": past("prev", "2026-10-20", [[P, 10], [P, 10]]), "lat-pulldown": past("prev", "2026-10-20", [[LAT, 12], [LAT, 11]]) };
  const rest = [...open("t", "lat-pulldown", 2), ...open("t", "machine-chest-press", 2), ...open("t", "seated-cable-row", 2), ...open("t", "cable-chest-fly", 2), ...open("t", "straight-arm-pulldown", 2)];
  const run = (press: [number, number][], restMin = 2.5, extra: OverlapSet[] = rest, fired: ("triceps" | "biceps")[] = [], template = cbA) =>
    overlapInSession({ template, sets: [...logged("t", TUE, "incline-db-press", press, restMin), ...extra], prior, yesterday, sessionId: "t", fired });

  it("a 1-rep drop does not fire; 2 fewer reps at the same load does, in kg", () => {
    expect(run([[P, 9], [P, 9]])).toBeNull();
    const a = run([[P, 8], [P, 8]])!;
    expect(a.muscle).toBe("triceps");
    expect(a.actions).toEqual([
      { kind: "reorder", move: "cable-chest-fly", before: "machine-chest-press" },
      { kind: "rir", slug: "machine-chest-press", rir: "1–2" },
    ]);
    expect(a.text).toBe("Triceps look tired from Monday: Incline Dumbbell Press is down 2 reps at 22.5 kg. Try the fly next, and stop 1–2 reps short on Machine Chest Press.");
    expect(a.evidence[0]).toMatchObject({ slug: "incline-db-press", weightLb: P, reps: 8, refReps: 10 });
    expect(overlapInSession({ template: cbA, unit: "lb", sets: [...logged("t", TUE, "incline-db-press", [[P, 8], [P, 8]]), ...rest], prior, yesterday, sessionId: "t" })!.text).toContain("at 49.6 lb");
  });

  it("a heavier load with fewer reps fires only when the e1RM fell 3%+", () => {
    expect(setDipped({ weight_lb: 75, reps: 8 }, { weight_lb: 70, reps: 10 })).toBe(false); // 95 vs 93.3: stronger
    expect(setDipped({ weight_lb: 75, reps: 5 }, { weight_lb: 70, reps: 10 })).toBe(true); // 87.5 vs 93.3
    expect(setDipped({ weight_lb: 65, reps: 10 }, { weight_lb: 70, reps: 10 })).toBe(true);
    expect(OVERLAP.e1rmDropPct).toBe(0.03);
  });

  it("does not judge set 2 after a rest 45 s+ shorter than last time", () => {
    expect(run([[P, 8], [P, 8]], 1.5)).toBeNull();
  });

  it("fires once per muscle, and pulls advise the biceps", () => {
    expect(run([[P, 8], [P, 8]], 2.5, rest, ["triceps"])).toBeNull();
    const pulls = [...logged("t", TUE, "lat-pulldown", [[LAT, 10], [LAT, 9]], 2.5, 20), ...open("t", "machine-chest-press", 2), ...open("t", "seated-cable-row", 2)];
    const b = overlapInSession({ template: cbA, sets: pulls, prior, yesterday, sessionId: "t" })!;
    expect(b.muscle).toBe("biceps");
    expect(b.actions).toEqual([{ kind: "rir", slug: "seated-cable-row", rir: "1–2" }]);
    expect(b.text).toBe("Biceps look tired from Monday: Lat Pulldown is down 2 reps at 60 kg. Stop 1–2 reps short on Seated Cable Row.");
  });

  it("skips exercises already done, and a 3-set accessory never goes below one set", () => {
    const mcpDone = rest.filter((s) => s.exercise_slug !== "machine-chest-press").concat(logged("t", TUE, "machine-chest-press", [[150, 12], [150, 12]], 2, 40));
    expect(run([[P, 8], [P, 8]], 2.5, mcpDone)).toBeNull();
    // a 2-set accessory with one set left is still eased by effort
    const oneLeft = rest.filter((s) => s.exercise_slug !== "machine-chest-press").concat(open("t", "machine-chest-press", 1));
    expect(run([[P, 8], [P, 8]], 2.5, oneLeft)!.actions.at(-1)).toEqual({ kind: "rir", slug: "machine-chest-press", rir: "1–2" });
    // with 3 sets it drops one, but not when only one set is planned
    const three = rest.filter((s) => s.exercise_slug !== "machine-chest-press").concat(open("t", "machine-chest-press", 3));
    expect(run([[P, 8], [P, 8]], 2.5, three, [], cb3)!.actions.at(-1)).toEqual({ kind: "drop", slug: "machine-chest-press", sets: 1 });
    expect(run([[P, 8], [P, 8]], 2.5, oneLeft, [], cb3)).toBeNull();
  });

  it("turns the advice into this session's adjustments", () => {
    const a = run([[P, 8], [P, 8]])!;
    const adj = adjustFromAdvice(a, cbA.exercises)!;
    expect(adj.dropSets).toBeUndefined();
    expect(adj.rir).toEqual({ "machine-chest-press": "1–2" });
    expect(adj.order!.indexOf("cable-chest-fly")).toBe(adj.order!.indexOf("machine-chest-press") - 1);
  });
});

describe("overlapNextArmDay (prevention)", () => {
  // three Mon/Tue pairs; the Tuesday press dipped against the week before on 2 of 3
  const pairs = ["2026-10-05", "2026-10-12", "2026-10-19"];
  const sessions: OverlapSession[] = [];
  const sets: OverlapSet[] = [];
  // a reference Tuesday before the first pair
  sessions.push({ id: "ref", local_date: "2026-09-29", status: "done", template_key: "chest_a", mode: "standard" });
  sets.push(...logged("ref", "2026-09-29", "incline-db-press", [[P, 10], [P, 10]]));
  pairs.forEach((mon, i) => {
    const tue = `2026-10-${String(Number(mon.slice(8)) + 1).padStart(2, "0")}`;
    sessions.push({ id: `m${i}`, local_date: mon, status: "done", template_key: "arms_a" }, { id: `t${i}`, local_date: tue, status: "done", template_key: "chest_a", mode: "standard" });
    const reps = i === 1 ? 10 : 8; // dips in weeks 0 and 2
    sets.push(...logged(`t${i}`, tue, "incline-db-press", [[P, reps], [P, reps]]));
  });

  it("eases Monday's shoulder press (both sets kept, 2–3 reps left) after pressing dropped 2 of the last 3 times", () => {
    // week 2 (i=2) compares with week 1 (10 reps) → dip; week 1 vs week 0 (8) → no dip; week 0 vs ref (10) → dip
    const a = overlapNextArmDay({ sessions, sets, template: armA })!;
    expect(a.trigger).toBe("pattern");
    expect(a.actions).toEqual([{ kind: "rir", slug: "seated-db-shoulder-press", rir: "2–3" }]);
    expect(a.text).toBe("Your pressing dropped the day after arm day 2 of the last 3 times. Today: stop with 2–3 reps left on Seated Dumbbell Shoulder Press.");
  });

  it("needs 2 of 3, and only suggests on an arm day", () => {
    expect(overlapNextArmDay({ sessions: sessions.filter((s) => s.id !== "t2"), sets, template: armA })).toBeNull();
    expect(overlapNextArmDay({ sessions, sets, template: cbA })).toBeNull();
    expect(overlapNextArmDay({ sessions, sets, template: TEMPLATE_DEFS.push_a })).toBeNull();
  });
});
