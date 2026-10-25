import { describe, expect, it } from "vitest";
import { getExercise } from "./library";
import { TEMPLATE_DEFS as PROGRAM_BY_KEY } from "./programs";
import { plannedSetCount, suggest, type Mode, type PastSet } from "./progression";

const bench = PROGRAM_BY_KEY.push_a.exercises.find((e) => e.slug === "barbell-bench-press")!; // 3 × 5–8
const lib = getExercise("barbell-bench-press");

let n = 0;
/** One past session: "185x8@2" specs, newest sessions first in the history passed to suggest. */
function session(date: string, mode: Mode, specs: string[]): PastSet[] {
  const id = `s${++n}`;
  return specs.map((spec, i) => {
    const [, w, r, rir] = spec.match(/^([\d.]+)x(\d+)(?:@(\d))?$/)!;
    return { local_date: date, session_id: id, set_index: i, weight_lb: Number(w), reps: Number(r), duration_sec: null, rir: rir == null ? null : Number(rir), mode };
  });
}

describe("suggest: each past session is judged against what it prescribed", () => {
  it("intro volume plans one set fewer, so 2 of 2 at the top is a load increase", () => {
    expect(plannedSetCount(bench, lib, "intro")).toBe(2);
    const h = session("2026-10-16", "intro", ["185x8@2", "185x8@2"]);
    const s = suggest(bench, lib, h, "intro");
    expect(s.kind).toBe("increase");
    expect(s.weightLb).toBe(190);
    expect(s.reason).toContain("Add 5 lb");
  });

  it("two intro sessions at the top are never 'missed the range twice'", () => {
    const h = [...session("2026-10-19", "intro", ["185x8@2", "185x8@2"]), ...session("2026-10-16", "intro", ["185x8@2", "185x8@2"])];
    const s = suggest(bench, lib, h, "intro");
    expect(s.kind).toBe("increase");
    expect(s.weightLb).toBe(190);
    expect(s.reason).not.toMatch(/Missed/);
  });

  it("an intro session followed by a standard one: the intro's 2 sets were all that was asked", () => {
    const s = suggest(bench, lib, session("2026-10-16", "intro", ["185x7@2", "185x6@2"]), "standard");
    expect(s.kind).toBe("add_reps");
    expect(s.weightLb).toBe(185);
  });

  it("a standard session with a set left unlogged holds the load, with honest copy", () => {
    const s = suggest(bench, lib, session("2026-10-16", "standard", ["185x8@2", "185x8@2"]), "standard");
    expect(s.kind).toBe("hold");
    expect(s.weightLb).toBe(185);
    expect(s.reason).toBe("Last time 2 of 3 sets were completed. Keep 185 lb and complete all 3.");
  });

  it("pluralises one completed set and a two-set plan", () => {
    const ext = { ...bench, slug: "oh-cable-triceps-extension", sets: 2, repLow: 10, repHigh: 15 };
    const s = suggest(ext, undefined, session("2026-10-16", "standard", ["60x12@1"]), "standard");
    expect(s.reason).toBe("Last time 1 of 2 sets was completed. Keep 60 lb and complete both.");
  });

  it("unlogged sets twice in a row are a hold, never a 10% reset", () => {
    const h = [...session("2026-10-19", "standard", ["185x8@2", "185x8@2"]), ...session("2026-10-16", "standard", ["185x8@2", "185x8@2"])];
    const s = suggest(bench, lib, h, "standard");
    expect(s.kind).toBe("hold");
    expect(s.weightLb).toBe(185);
  });

  it("still resets after the rep range is missed twice at the same load", () => {
    const h = [...session("2026-10-19", "standard", ["185x5", "185x4", "185x4"]), ...session("2026-10-16", "standard", ["185x5", "185x4", "185x3"])];
    const s = suggest(bench, lib, h, "standard");
    expect(s.kind).toBe("reset");
    expect(s.weightLb).toBe(165);
  });

  it("counts an intro session's rep miss toward the reset rule", () => {
    const h = [...session("2026-10-19", "standard", ["185x5", "185x4", "185x4"]), ...session("2026-10-16", "intro", ["185x4", "185x4"])];
    expect(suggest(bench, lib, h, "standard").kind).toBe("reset");
  });
});

describe("suggest: deloads are planned lighter work, not a performance drop", () => {
  const standard = session("2026-10-09", "standard", ["180x8@2", "180x6@2", "180x6@1"]);
  const deload = session("2026-10-16", "deload", ["160x6@3", "160x6@3"]);

  it("the session after a deload progresses from the last standard session", () => {
    const s = suggest(bench, lib, [...deload, ...standard], "standard");
    expect(s.kind).toBe("add_reps");
    expect(s.weightLb).toBe(180);
    expect(s.reason).not.toMatch(/2 of 3/);
    // "Last" still describes what was actually done most recently
    expect(s.last).toContain("160×6");
  });

  it("a top-of-range standard session before the deload still earns the increase", () => {
    const top = session("2026-10-09", "standard", ["180x8@2", "180x8@2", "180x8@1"]);
    const s = suggest(bench, lib, [...deload, ...top], "standard");
    expect(s.kind).toBe("increase");
    expect(s.weightLb).toBe(185);
  });

  it("a deload never feeds the two-misses reset", () => {
    const miss = session("2026-10-09", "standard", ["185x5", "185x4", "185x4"]);
    const deloadMiss = session("2026-10-16", "deload", ["185x4", "185x4"]);
    expect(suggest(bench, lib, [...deloadMiss, ...miss], "standard").kind).toBe("hold");
  });

  it("a deload is ~10% under the last real load, even right after another deload", () => {
    expect(suggest(bench, lib, standard, "deload").weightLb).toBe(160);
    expect(suggest(bench, lib, [...deload, ...standard], "deload").weightLb).toBe(160);
  });

  it("with only deloads logged, starts from the deload load", () => {
    const s = suggest(bench, lib, deload, "standard");
    expect(s.kind).toBe("hold");
    expect(s.weightLb).toBe(160);
    expect(s.reason).toContain("deload at 160 lb");
  });
});

describe("suggest: unchanged basics", () => {
  it("first time has no load", () => {
    expect(suggest(bench, lib, [], "standard").kind).toBe("first");
  });

  it("grinding at 0 RIR holds instead of adding load", () => {
    const s = suggest(bench, lib, session("2026-10-16", "standard", ["185x8@0", "185x8@0", "185x8@1"]), "standard");
    expect(s.kind).toBe("hold");
  });

  it("sessions without a known mode are read as standard", () => {
    const h = session("2026-10-16", "standard", ["185x8@2", "185x8@2"]).map(({ mode: _m, ...s }) => s);
    expect(suggest(bench, lib, h, "standard").kind).toBe("hold");
  });
});

/* ------------------------------------------------- Arnold Split 2.0 (§4.1) */

describe("double progression on the Arnold split (PROGRAM-ARNOLD §4.1)", () => {
  const T = (key: keyof typeof PROGRAM_BY_KEY, slug: string) => PROGRAM_BY_KEY[key].exercises.find((e) => e.slug === slug)!;
  const withKey = (h: PastSet[], template_key: string) => h.map((s) => ({ ...s, template_key }));
  const incline = T("chest_back_a", "incline-db-press"); // 3 × 6–10 @1–3
  const L = (s: string) => getExercise(s);

  it("1. all three sets at 10 within 1–3 RIR → one step up (60 → 65)", () => {
    const h = withKey(session("2026-10-20", "standard", ["60x10@2", "60x10@1", "60x10@1"]), "push_a");
    const s = suggest(incline, L("incline-db-press"), h, "standard", { templateKey: "chest_back_a" });
    expect(s).toMatchObject({ kind: "increase", weightLb: 65 });
    expect(s.reason).toBe("You hit 10, 10, 10 at 60 lb, the top of the range at your target effort. Add 5 lb.");
  });

  it("2. the same reps at 0, 0, 1 RIR on a heavy compound → hold at 60", () => {
    const h = session("2026-10-20", "standard", ["60x10@0", "60x10@0", "60x10@1"]);
    const s = suggest(incline, L("incline-db-press"), h, "standard", { templateKey: "chest_back_a" });
    expect(s).toMatchObject({ kind: "hold", weightLb: 60 });
    expect(s.reason).toMatch(/reps in reserve on a heavy lift/);
  });

  it("3. lateral raises at 20 reps and 0 RIR progress: 0 is on target for isolation", () => {
    const lat = T("shoulders_arms_a", "cable-lateral-raise");
    const h = session("2026-10-20", "standard", ["15x20@0", "15x20@0", "15x20@0", "15x20@0"]);
    expect(suggest(lat, L("cable-lateral-raise"), h, "standard", { templateKey: "shoulders_arms_a" })).toMatchObject({ kind: "increase", weightLb: 20 });
  });

  it("4. last time PPL Push B with 3 sets → judged on today's 2, never as missed sets", () => {
    const press = T("shoulders_arms_a", "seated-db-shoulder-press"); // 2 × 6–10
    const h = withKey(session("2026-10-15", "standard", ["50x12", "50x12", "50x12"]), "push_b");
    const s = suggest(press, L("seated-db-shoulder-press"), h, "standard", { templateKey: "shoulders_arms_a" });
    expect(s).toMatchObject({ kind: "increase", weightLb: 55 });
    expect(s.reason).not.toMatch(/sets were completed|set was completed/);
  });

  it("5. fewer sets logged last time than now planned (other template) → judged on what was logged", () => {
    const lat = T("shoulders_arms_a", "cable-lateral-raise"); // 4 sets now
    const h = withKey(session("2026-10-12", "standard", ["15x20@1", "15x20@1", "15x20@1"]), "push_a");
    expect(suggest(lat, L("cable-lateral-raise"), h, "standard", { templateKey: "shoulders_arms_a" }).kind).toBe("increase");
  });

  it("6. the same template with a set left unlogged → hold, as before", () => {
    const h = withKey(session("2026-10-20", "standard", ["60x10@2", "60x10@2"]), "chest_back_a");
    const s = suggest(incline, L("incline-db-press"), h, "standard", { templateKey: "chest_back_a" });
    expect(s).toMatchObject({ kind: "hold", weightLb: 60 });
    expect(s.reason).toContain("Last time 2 of 3 sets were completed");
  });

  it("7. back squat now 3 × 5–8 after PPL's 225 × 6, 6, 6, 5 → the first three judged: add reps", () => {
    const squat = T("legs_abs_a", "back-squat");
    const h = withKey(session("2026-10-14", "standard", ["225x6", "225x6", "225x6", "225x5"]), "legs_a");
    expect(suggest(squat, L("back-squat"), h, "standard", { templateKey: "legs_abs_a" })).toMatchObject({ kind: "add_reps", weightLb: 225 });
  });

  it("8. never more than one load step, whatever the reps in reserve", () => {
    const h = session("2026-10-20", "standard", ["60x10@5", "60x10@5", "60x10@5"]);
    const s = suggest(incline, L("incline-db-press"), h, "standard", { templateKey: "chest_back_a" });
    expect(s).toMatchObject({ kind: "increase", weightLb: 65 });
    expect(s.reason).toContain("with reps to spare");
  });

  it("machine chest press at 150 × 12 @0 three times holds (compound at 0 RIR)", () => {
    const mcp = T("chest_back_a", "machine-chest-press");
    const h = withKey(session("2026-10-15", "standard", ["150x12@0", "150x12@0", "150x12@0"]), "push_b");
    expect(suggest(mcp, L("machine-chest-press"), h, "intro", { templateKey: "chest_back_a" })).toMatchObject({ kind: "hold", weightLb: 150 });
  });
});
