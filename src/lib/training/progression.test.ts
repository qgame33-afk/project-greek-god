import { describe, expect, it } from "vitest";
import { getExercise } from "./library";
import { TEMPLATE_DEFS as PROGRAM_BY_KEY } from "./programs";
import { displayLoad } from "./loads";
import { modeRir, plannedSetCount, suggest as suggestIn, type Mode, type PastSet } from "./progression";

/** The PPL cases below are written in pounds (an account that kept lb). */
const suggest = (...[t, l, h, m, ctx]: Parameters<typeof suggestIn>) => suggestIn(t, l, h, m, { unit: "lb", ...ctx });

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

/* ------------------------------------------- the two-set split, in kg (program-v3 §5) */

describe("double progression on the two-set split, in kg (PROGRAM-V3 §4.1)", () => {
  const T = (key: keyof typeof PROGRAM_BY_KEY, slug: string) => PROGRAM_BY_KEY[key].exercises.find((e) => e.slug === slug)!;
  const withKey = (h: PastSet[], template_key: string) => h.map((s) => ({ ...s, template_key }));
  const L = (s: string) => getExercise(s);
  const kg = (t: Parameters<typeof suggestIn>[0], slug: string, h: PastSet[], mode: Mode = "standard", key = "chest_a") => suggestIn(t, L(slug), h, mode, { templateKey: key, unit: "kg" });
  const incline = T("chest_a", "incline-db-press"); // 2 × 6–10 @0–1
  // stored pounds for 22.5 kg dumbbells
  const P = 49.6;

  it("both sets at the top of the range → one 2 kg dumbbell step (22.5 → 24.5 kg)", () => {
    const s = kg(incline, "incline-db-press", session("2026-10-20", "standard", [`${P}x10@0`, `${P}x10@1`]));
    expect(s).toMatchObject({ kind: "increase", weightLb: 54 });
    expect(displayLoad(s.weightLb!, "kg")).toBe(24.5);
    expect(s.reason).toBe("You hit 10, 10 at 22.5 kg, the top of the range at your target effort. Add 2 kg.");
  });

  it("only one set at the top → keep the load and add reps; never an automatic increase", () => {
    const s = kg(incline, "incline-db-press", session("2026-10-20", "standard", [`${P}x10@0`, `${P}x9@0`]));
    expect(s).toMatchObject({ kind: "add_reps", weightLb: P });
    expect(s.reason).toBe("Stay at 22.5 kg and add a rep wherever you can (last time 10, 9). Load goes up once every set reaches 10.");
  });

  it("one of the two sets logged → hold, with honest copy", () => {
    const s = kg(incline, "incline-db-press", withKey(session("2026-10-20", "standard", [`${P}x10@0`]), "chest_a"));
    expect(s).toMatchObject({ kind: "hold", weightLb: P });
    expect(s.reason).toBe("Last time 1 of 2 sets was completed. Keep 22.5 kg and complete both.");
  });

  it("isolation to failure: lateral raises at 20, 20 and 0 RIR progress (10 → 12 kg)", () => {
    const lat = T("arms_a", "db-lateral-raise");
    const s = kg(lat, "db-lateral-raise", session("2026-10-20", "standard", ["22x20@0", "22x20@0"]), "standard", "arms_a");
    expect(s.kind).toBe("increase");
    expect(displayLoad(s.weightLb!, "kg")).toBe(12);
  });

  it("the squat keeps its 1–2 RIR safety margin: the top at 0 RIR holds; at 1 RIR it adds 2.5 kg", () => {
    const squat = T("lower_a", "back-squat");
    const fail = kg(squat, "back-squat", session("2026-10-21", "standard", ["220.5x10@0", "220.5x10@0"]), "standard", "lower_a");
    expect(fail).toMatchObject({ kind: "hold", weightLb: 220.5 });
    expect(fail.reason).toBe("Top of the range at 100 kg, but at 0 reps in reserve on a heavy lift. Repeat 100 kg and own every rep.");
    const ok = kg(squat, "back-squat", session("2026-10-21", "standard", ["220.5x10@1", "220.5x10@2"]), "standard", "lower_a");
    expect(ok.kind).toBe("increase");
    expect(displayLoad(ok.weightLb!, "kg")).toBe(102.5);
  });

  it("cable stacks and lunges step in kg (60 → 62.5 kg row, 20 → 22 kg dumbbells)", () => {
    const row = kg(T("chest_a", "seated-cable-row"), "seated-cable-row", session("2026-10-20", "standard", ["132.3x12@0", "132.3x12@0"]));
    expect(displayLoad(row.weightLb!, "kg")).toBe(62.5);
    const lunge = kg(T("lower_a", "walking-lunge"), "walking-lunge", session("2026-10-21", "standard", ["44.1x12@1", "44.1x12@2"]), "standard", "lower_a");
    expect(displayLoad(lunge.weightLb!, "kg")).toBe(22);
  });

  it("last time PPL with 3 sets → judged on today's 2, never as missed sets", () => {
    const press = T("arms_a", "seated-db-shoulder-press");
    const s = kg(press, "seated-db-shoulder-press", withKey(session("2026-10-15", "standard", ["50x12", "50x12", "50x12"]), "push_b"), "standard", "arms_a");
    expect(s.kind).toBe("increase");
    expect(displayLoad(s.weightLb!, "kg")).toBe(24.5);
    expect(s.reason).not.toMatch(/sets were completed|set was completed/);
  });

  it("easier and deload weeks keep both sets and change the effort (2–3, then 3–4 in reserve, ~10% lighter)", () => {
    const lib = L("incline-db-press");
    expect([plannedSetCount(incline, lib, "standard"), plannedSetCount(incline, lib, "intro"), plannedSetCount(incline, lib, "deload")]).toEqual([2, 2, 2]);
    expect([modeRir(incline, "standard"), modeRir(incline, "intro"), modeRir(incline, "deload")]).toEqual(["0–1", "2–3", "3–4"]);
    const d = kg(incline, "incline-db-press", session("2026-10-20", "standard", [`${P}x10@0`, `${P}x10@0`]), "deload");
    expect(displayLoad(d.weightLb!, "kg")).toBe(20);
    expect(d.reason).toBe("Deload: about 10% lighter, finish every set with 3+ reps in reserve.");
  });

  it("first time on a failure lift says so", () => {
    expect(kg(T("chest_a", "cable-chest-fly"), "cable-chest-fly", []).reason).toBe("First time: choose a weight you can lift for 15 reps to the last clean rep. This sets your baseline.");
  });
});
