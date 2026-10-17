import { describe, expect, it } from "vitest";
import { getExercise } from "./library";
import { PROGRAM_BY_KEY } from "./program";
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
