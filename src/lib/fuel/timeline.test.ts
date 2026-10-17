import { describe, expect, it } from "vitest";
import { DEFAULT_DAY_SCHEDULE, toMinutes } from "@/lib/prefs";
import { dayLine, ifYouAdd } from "./consequence";
import { buildTimeline, portionChanged, type TimelineEntry, type TimelinePlanned } from "./timeline";

// The demo user's Monday (2026-10-19, Push A at 16:30): five planned meals, a diary with two
// meals logged from the plan (one at a changed portion), one unplanned food, a scanned plate of
// two items and a second serving of lunch logged from the plan.
const t = (hhmm: string) => toMinutes(hhmm);
const minuteOf = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
const MON = "2026-10-19";

const plan = (id: string, slot: TimelinePlanned["slot"], position: number, kcal: number, protein: number, servings = 1): TimelinePlanned => ({
  id,
  slot,
  position,
  servings,
  kcal,
  protein,
  carbs: Math.round(kcal / 8),
  fat: Math.round(kcal / 40),
});
const PLANNED = [
  plan("pm-bk", "breakfast", 0, 857, 70, 1.5),
  plan("pm-ln", "lunch", 0, 760, 38),
  plan("pm-dn", "dinner", 0, 770, 35),
  plan("pm-s1", "snack", 0, 380, 30),
  plan("pm-s2", "snack", 1, 523, 13),
];

const entry = (id: string, hhmm: string, kcal: number, protein: number, extra: Partial<TimelineEntry> = {}): TimelineEntry => ({
  id,
  eaten_at: `${MON}T${hhmm}:00`,
  meal_group_id: null,
  planned_meal_id: null,
  amount: 1,
  unit: "serving",
  calories: kcal,
  protein_g: protein,
  carbs_g: 10,
  fat_g: 5,
  ...extra,
});
const ENTRIES = [
  entry("e-bk", "07:32", 857, 70, { planned_meal_id: "pm-bk", amount: 1.5 }),
  entry("e-coffee", "09:10", 120, 6, { unit: "cup" }),
  entry("e-ln", "13:05", 1140, 57, { planned_meal_id: "pm-ln", amount: 1.5 }),
  entry("e-ln2", "13:40", 760, 38, { planned_meal_id: "pm-ln" }),
  entry("e-scan1", "10:40", 300, 20, { meal_group_id: "g1", unit: "g", amount: 150 }),
  entry("e-scan2", "10:40", 200, 4, { meal_group_id: "g1", unit: "g", amount: 60 }),
];

const times = { schedule: DEFAULT_DAY_SCHEDULE, snacksPerDay: 2, train: { at: t("16:30"), durationMin: 70 } };
const base = { date: MON, today: MON, now: t("15:47"), planned: PLANNED, entries: ENTRIES, times, minuteOf };

describe("buildTimeline — plan and diary as one list", () => {
  const tl = buildTimeline({ ...base, session: { name: "Push A", at: t("16:30"), durationMin: 70, done: false } });
  const ids = (k: string) => tl.rows.filter((r) => r.kind === k);

  it("shows every planned meal once and every logged entry once", () => {
    const plannedSeen = tl.rows.flatMap((r) => (r.kind === "planned" || r.kind === "elsewhere" ? [r.planned.id] : r.kind === "eaten" && r.planned ? [r.planned.id] : []));
    expect(plannedSeen.sort()).toEqual(PLANNED.map((p) => p.id).sort());
    const entriesSeen = tl.rows.flatMap((r) => (r.kind === "eaten" ? [r.entry.id] : r.kind === "group" ? r.entries.map((e) => e.id) : []));
    expect(entriesSeen.sort()).toEqual(ENTRIES.map((e) => e.id).sort());
  });

  it("merges a planned meal with the entry logged from it, and flags a changed portion", () => {
    const bk = tl.rows.find((r) => r.kind === "eaten" && r.entry.id === "e-bk");
    expect(bk).toMatchObject({ kind: "eaten", at: t("07:32"), changed: false });
    expect(bk && bk.kind === "eaten" && bk.planned?.id).toBe("pm-bk");
    const ln = tl.rows.find((r) => r.kind === "eaten" && r.entry.id === "e-ln");
    expect(ln && ln.kind === "eaten" && ln.planned?.id).toBe("pm-ln");
    expect(ln && ln.kind === "eaten" && ln.changed).toBe(true);
    // a second log of the same planned meal is its own row, never merged twice
    const ln2 = tl.rows.find((r) => r.kind === "eaten" && r.entry.id === "e-ln2");
    expect(ln2 && ln2.kind === "eaten" && ln2.planned).toBeNull();
    expect(ids("planned").map((r) => (r.kind === "planned" ? r.planned.id : ""))).not.toContain("pm-ln");
  });

  it("folds a scanned meal group into one row at its time", () => {
    const groups = ids("group");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ at: t("10:40"), totals: { kcal: 500, protein: 24 } });
  });

  it("places planned meals at his times, the pre-workout snack an hour before the session", () => {
    const at = (id: string) => tl.rows.find((r) => r.kind === "planned" && r.planned.id === id)?.at;
    expect(at("pm-s1")).toBe(t("15:30"));
    expect(tl.rows.find((r) => r.kind === "planned" && r.planned.id === "pm-s1")).toMatchObject({ role: "pre" });
    expect(at("pm-dn")).toBe(t("18:30"));
    expect(at("pm-s2")).toBe(t("21:30"));
  });

  it("puts the NOW line between the past and the rest, the session in time order", () => {
    const order = tl.rows.map((r) => r.key);
    expect(order.indexOf("now")).toBeGreaterThan(order.indexOf("p:pm-s1"));
    expect(order.indexOf("now")).toBeLessThan(order.indexOf("session"));
    expect(order.indexOf("session")).toBeLessThan(order.indexOf("p:pm-dn"));
    // sorted by time
    const ats = tl.rows.map((r) => r.at);
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
  });

  it("marks the due meal (earliest uneaten from an hour ago on) and nothing missed yet", () => {
    expect(tl.dueId).toBe("pm-s1");
    expect(tl.missedCount).toBe(0);
    expect(tl.rows.filter((r) => r.kind === "planned" && r.due)).toHaveLength(1);
  });

  it("counts every entry in eaten, and only meals still ahead in remaining", () => {
    expect(tl.eaten.kcal).toBe(857 + 120 + 1140 + 760 + 300 + 200);
    expect(tl.remaining).toMatchObject({ kcal: 380 + 770 + 523, protein: 30 + 35 + 13 });
    expect(tl.remainingCount).toBe(3);
  });
});

describe("buildTimeline — time passing", () => {
  it("a planned meal more than 2 h past its time is missed, and still the due one when nothing else is left", () => {
    const tl = buildTimeline({ ...base, now: t("22:30"), entries: [] });
    const states = Object.fromEntries(tl.rows.flatMap((r) => (r.kind === "planned" ? [[r.planned.id, r.state]] : [])));
    expect(states).toEqual({ "pm-bk": "missed", "pm-ln": "missed", "pm-s1": "missed", "pm-dn": "missed", "pm-s2": "upcoming" });
    expect(tl.dueId).toBe("pm-s2");
    expect(tl.remainingCount).toBe(1);
    expect(tl.missedCount).toBe(4);
  });

  it("falls back to the earliest uneaten meal when every one is over an hour past", () => {
    const tl = buildTimeline({ ...base, now: t("23:50"), entries: [] });
    expect(tl.dueId).toBe("pm-bk");
  });

  it("a past day has no NOW line, no due meal, and every uneaten meal reads not logged", () => {
    const tl = buildTimeline({ ...base, today: "2026-10-20" });
    expect(tl.rows.some((r) => r.kind === "now")).toBe(false);
    expect(tl.dueId).toBeNull();
    expect(tl.rows.filter((r) => r.kind === "planned").every((r) => r.kind === "planned" && r.state === "missed")).toBe(true);
    expect(tl.remainingCount).toBe(0);
  });

  it("a planned meal logged on another day shows as logged there, not as due or counted", () => {
    const tl = buildTimeline({ ...base, entries: [], loggedOn: { "pm-s1": ["2026-10-20"] } });
    expect(tl.rows.find((r) => r.key === "x:pm-s1")).toMatchObject({ kind: "elsewhere", loggedOn: "2026-10-20" });
    expect(tl.dueId).not.toBe("pm-s1");
    expect(tl.remaining.kcal).toBe(770 + 523);
  });

  it("with no plan and nothing logged there is only the NOW line", () => {
    const tl = buildTimeline({ ...base, planned: [], entries: [] });
    expect(tl.rows.map((r) => r.kind)).toEqual(["now"]);
    expect(tl.plannedCount).toBe(0);
  });
});

describe("portionChanged", () => {
  it("compares servings, and any non-serving unit counts as changed", () => {
    expect(portionChanged({ amount: 1.5, unit: "serving" }, { servings: 1.5 })).toBe(false);
    expect(portionChanged({ amount: "2", unit: "serving" }, { servings: 1.5 })).toBe(true);
    expect(portionChanged({ amount: 200, unit: "g" }, { servings: 1 })).toBe(true);
  });
});

describe("the day line and the consequence line", () => {
  it("the day line equals eaten plus every remaining planned meal", () => {
    const tl = buildTimeline(base);
    const remaining = tl.rows.flatMap((r) => (r.kind === "planned" && r.state === "upcoming" ? [r.planned] : []));
    const line = dayLine({ kcal: tl.eaten.kcal, protein: tl.eaten.protein }, remaining, { protein: 185 });
    expect(line.kind).toBe("lands");
    expect(line.kcal).toBe(tl.eaten.kcal + tl.remaining.kcal);
    expect(line.protein).toBe(tl.eaten.protein + tl.remaining.protein);
    expect(line.text).toBe(`Log the rest as planned and today lands at ${Math.round(line.kcal).toLocaleString("en-US")} kcal · ${Math.round(line.protein)} g`);
    expect(line.explain).toContain("eaten +");
  });

  it("with nothing left planned it says what protein is left, or that the goal is met", () => {
    expect(dayLine({ kcal: 2140, protein: 121 }, [], { protein: 185 })).toMatchObject({ kind: "to_go", text: "64 g to go · nothing else planned today" });
    expect(dayLine({ kcal: 3300, protein: 190 }, [], { protein: 185 })).toMatchObject({ kind: "met", text: "185 g reached · nothing else planned today" });
    expect(dayLine({ kcal: 0, protein: 0 }, [], null).kind).toBe("empty");
  });

  it("ifYouAdd is the day's totals plus the meal, with its working", () => {
    const c = ifYouAdd({ kcal: 2140, protein: 121 }, { kcal: 380, protein: 30 });
    expect(c).toMatchObject({ kcal: 2520, protein: 151, text: "If you eat it: 2,520 kcal · 151 g" });
    expect(c.explain).toBe("2,140 eaten + 380 = 2,520 kcal · 121 + 30 = 151 g protein");
    expect(ifYouAdd({ kcal: 3055, protein: 160 }, { kcal: 380, protein: 30 }, "add").text).toBe("If you add it: 3,435 kcal · 190 g");
    expect(ifYouAdd({ kcal: Number.NaN, protein: 10 }, { kcal: 5, protein: 1 }).kcal).toBe(5);
  });
});
