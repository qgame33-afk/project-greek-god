import { describe, expect, it } from "vitest";
import { weekday } from "@/lib/dates";
import { DEFAULT_DAY_SCHEDULE, toMinutes } from "@/lib/prefs";
import { plannedTime } from "./meal-times";
import { dayPhase, dayState, DAWN_UNTIL, DUSK_FROM, minutesSinceMidnight, SEAL_FROM, type DayInput, type PlannedMealSlot } from "./day-engine";

const t = (hhmm: string) => toMinutes(hhmm);
const MONDAY = "2026-10-19"; // Push A by default
const SUNDAY = "2026-10-25";

const PUSH_A = { key: "push-a", name: "Push A", at: t("16:30"), durationMin: 70 };

/** The day's planned meals at default times (2 snacks), positioned around the session. */
function meals(train: { at: number | null; durationMin?: number | null } | null, eaten: string[] = []): PlannedMealSlot[] {
  const places = [
    { id: "b", slot: "breakfast" as const, position: 0, name: "Peameal sandwich", kcal: 720, protein: 48 },
    { id: "l", slot: "lunch" as const, position: 0, name: "Chicken rice bowl", kcal: 850, protein: 55 },
    { id: "d", slot: "dinner" as const, position: 0, name: "Salmon bowl", kcal: 900, protein: 52 },
    { id: "s0", slot: "snack" as const, position: 0, name: "Rice cakes, honey and whey", kcal: 380, protein: 30 },
    { id: "s1", slot: "snack" as const, position: 1, name: "Greek yogurt", kcal: 300, protein: 25 },
  ];
  return places.map((p) => ({ ...p, ...plannedTime(p, { schedule: DEFAULT_DAY_SCHEDULE, snacksPerDay: 2, train }), eaten: eaten.includes(p.id) }));
}

function day(p: Partial<DayInput> = {}): DayInput {
  return {
    date: MONDAY,
    now: t("07:00"),
    plan: { kind: "train", ...PUSH_A },
    session: { status: "none" },
    meals: meals(PUSH_A),
    checkInDone: false,
    weighInDone: false,
    dawnDismissed: false,
    sealed: false,
    lightsOut: null,
    ...p,
  };
}
const dawnDone = { checkInDone: true, weighInDone: true, dawnDoneAt: t("07:20") };

describe("the real default schedule: Monday Push A at 16:30 (§4.2 test 1)", () => {
  it("is a Monday", () => {
    expect(weekday(MONDAY)).toBe(1);
  });

  it("07:00 dawn → check-in first, then the weigh-in", () => {
    const s = dayState(day());
    expect(s.phase).toBe("dawn");
    expect(s.next).toEqual({ kind: "checkin" });
    expect(dayState(day({ checkInDone: true })).next).toEqual({ kind: "weighin" });
  });

  it("11:00 fuel → the next uneaten meal", () => {
    const s = dayState(day({ ...dawnDone, now: t("11:00"), meals: meals(PUSH_A, ["b"]) }));
    expect(s.phase).toBe("fuel");
    expect(s.next).toEqual({ kind: "eat", mealId: "l" });
  });

  it("15:10 train → Begin Push A", () => {
    const s = dayState(day({ ...dawnDone, now: t("15:10"), meals: meals(PUSH_A, ["b", "l"]) }));
    expect(s.phase).toBe("train");
    expect(s.next).toEqual({ kind: "begin", key: "push-a" });
    // the window opens 90 min before
    expect(dayPhase(day({ ...dawnDone, now: t("14:59") }))).toBe("fuel");
    expect(dayPhase(day({ ...dawnDone, now: t("15:00") }))).toBe("train");
  });

  it("17:00 with the session active → live, return", () => {
    const s = dayState(day({ ...dawnDone, now: t("17:00"), session: { status: "active", startedAt: t("16:35") } }));
    expect(s.phase).toBe("live");
    expect(s.next).toEqual({ kind: "return" });
  });

  it("18:10 after ending at 17:45 → refuel, the post-workout dinner", () => {
    const s = dayState(day({ ...dawnDone, now: t("18:10"), session: { status: "done", endedAt: t("17:45") }, meals: meals(PUSH_A, ["b", "l", "s0"]) }));
    expect(s.phase).toBe("refuel");
    expect(s.next).toEqual({ kind: "eat", mealId: "d" });
    expect(s.later.find((x) => x.id === "d")).toBeTruthy();
  });

  it("19:30 → dusk (and refuel lasts two hours after the session)", () => {
    expect(dayPhase(day({ ...dawnDone, now: t("19:30") }))).toBe("dusk"); // missed: the window closed at 19:30
    const ended = { ...dawnDone, session: { status: "done" as const, endedAt: t("17:45") } };
    expect(dayPhase(day({ ...ended, now: t("19:30") }))).toBe("refuel");
    expect(dayPhase(day({ ...ended, now: t("19:45") }))).toBe("refuel");
    expect(dayPhase(day({ ...ended, now: t("19:46") }))).toBe("dusk");
  });

  it("21:30 → seal, then nothing once sealed", () => {
    const s = dayState(day({ ...dawnDone, now: t("21:30"), session: { status: "done", endedAt: t("17:45") } }));
    expect(s.phase).toBe("seal");
    expect(s.next).toEqual({ kind: "seal" });
    expect(dayState(day({ ...dawnDone, now: t("21:30"), sealed: true })).next).toEqual({ kind: "none" });
  });

  it("the rail: Dawn done at 07:20, Fuel, Train now, then Refuel at the planned end, Dusk, Seal", () => {
    const s = dayState(day({ ...dawnDone, now: t("15:10"), meals: meals(PUSH_A, ["b", "l"]) }));
    expect(s.rail).toEqual([
      { phase: "dawn", startsAt: t("05:00"), state: "done" },
      { phase: "fuel", startsAt: t("07:20"), state: "done" },
      { phase: "train", startsAt: t("15:00"), state: "now" },
      { phase: "refuel", startsAt: t("17:40"), state: "later" },
      { phase: "dusk", startsAt: t("19:41"), state: "later" }, // refuel runs through 2 h inclusive
      { phase: "seal", startsAt: SEAL_FROM, state: "later" },
    ]);
    // fuel with a planned meal not eaten → skipped (a quiet mark, never a count)
    const missedLunch = dayState(day({ ...dawnDone, now: t("15:10"), meals: meals(PUSH_A, ["b"]) }));
    expect(missedLunch.rail[1]).toEqual({ phase: "fuel", startsAt: t("07:20"), state: "skipped" });
    expect(missedLunch.skippedChip).toBeNull();
  });

  it("the rail before Dawn completes: Fuel starts at 10:30", () => {
    const s = dayState(day());
    expect(s.rail.map((r) => [r.phase, r.startsAt, r.state])).toEqual([
      ["dawn", t("05:00"), "now"],
      ["fuel", DAWN_UNTIL, "later"],
      ["train", t("15:00"), "later"],
      ["refuel", t("17:40"), "later"],
      ["dusk", t("19:41"), "later"],
      ["seal", SEAL_FROM, "later"],
    ]);
  });

  it("marks: meals, the session and lights out, in time order", () => {
    const s = dayState(day({ ...dawnDone, now: t("15:10"), meals: meals(PUSH_A, ["b"]), lightsOut: t("22:00") }));
    expect(s.marks).toEqual([
      { at: t("07:40"), kind: "meal", done: true },
      { at: t("12:30"), kind: "meal", done: false },
      { at: t("15:30"), kind: "meal", done: false }, // the pre-workout snack
      { at: t("16:30"), kind: "session", done: false },
      { at: t("18:30"), kind: "meal", done: false },
      { at: t("21:30"), kind: "meal", done: false },
      { at: t("22:00"), kind: "lights", done: false },
    ]);
    expect(dayState(day()).marks.at(-1)).toEqual({ at: t("22:30"), kind: "lights", done: false });
  });

  it("later / earlier lists", () => {
    const s = dayState(day({ ...dawnDone, now: t("15:10"), meals: meals(PUSH_A, ["b"]) }));
    expect(s.later.map((x) => x.id)).toEqual(["s0", "push-a", "d", "s1"]);
    expect(s.earlier.map((x) => x.id)).toEqual(["checkin", "weighin", "b", "l"]);
    expect(s.earlier.find((x) => x.id === "l")!.done).toBe(false);
  });
});

describe("other days", () => {
  it("a rest day (Sunday) has no train phase (§4.2 test 2)", () => {
    const rest = day({ date: SUNDAY, plan: { kind: "rest" }, meals: meals(null), ...dawnDone });
    for (let m = 0; m < 24 * 60; m += 5) expect(dayPhase({ ...rest, now: m })).not.toBe("train");
    const s = dayState({ ...rest, now: t("15:10") });
    expect(s.phase).toBe("fuel");
    expect(s.rail.map((r) => r.phase)).toEqual(["dawn", "fuel", "dusk", "seal"]);
    expect(s.marks.some((m) => m.kind === "session")).toBe(false);
    expect(s.later.some((x) => x.kind === "session")).toBe(false);
  });

  it("Dawn done by 07:20 → fuel at 07:21 (§4.2 test 3)", () => {
    expect(dayPhase(day({ ...dawnDone, now: t("07:21") }))).toBe("fuel");
  });

  it("Dawn not done at 10:31 → fuel with a quiet chip (§4.2 test 4)", () => {
    const s = dayState(day({ now: t("10:31") }));
    expect(s.phase).toBe("fuel");
    expect(s.skippedChip).toBe("Check-in · 2 left");
    expect(s.rail[0]).toEqual({ phase: "dawn", startsAt: t("05:00"), state: "skipped" });
    expect(dayState(day({ now: t("10:31"), checkInDone: true })).skippedChip).toBe("Check-in · 1 left");
    expect(dayState(day({ now: t("10:29") })).phase).toBe("dawn");
  });

  it("'Later' on Dawn moves on and leaves the chip", () => {
    const s = dayState(day({ now: t("07:05"), dawnDismissed: true, dawnDoneAt: t("07:04") }));
    expect(s.phase).toBe("fuel");
    expect(s.skippedChip).toBe("Check-in · 2 left");
    expect(s.rail[1]).toMatchObject({ phase: "fuel", startsAt: t("07:04"), state: "now" });
  });

  it("no training time → Train right after Dawn until 18:00 (§4.2 test 5)", () => {
    const free = day({ plan: { kind: "train", key: "push-a", name: "Push A", at: null, durationMin: null }, meals: meals({ at: null }) });
    expect(dayPhase({ ...free, now: t("07:00") })).toBe("dawn");
    expect(dayPhase({ ...free, ...dawnDone, now: t("07:21") })).toBe("train");
    expect(dayPhase({ ...free, now: t("10:31") })).toBe("train"); // Dawn skipped
    expect(dayPhase({ ...free, ...dawnDone, now: t("17:59") })).toBe("train");
    expect(dayPhase({ ...free, ...dawnDone, now: DUSK_FROM })).toBe("dusk");
    expect(dayState({ ...free, ...dawnDone, now: t("12:00") }).next).toEqual({ kind: "begin", key: "push-a" });
    // after an early session the day returns to Fuel
    const after = { ...free, ...dawnDone, session: { status: "done" as const, endedAt: t("12:00") } };
    expect(dayPhase({ ...after, now: t("14:01") })).toBe("fuel");
    expect(dayState({ ...after, now: t("15:00") }).rail.map((r) => r.phase)).toEqual(["dawn", "train", "refuel", "fuel", "dusk", "seal"]);
  });

  it("a missed session at 20:00 → dusk, still in Later, not started (§4.2 test 6)", () => {
    const s = dayState(day({ ...dawnDone, now: t("20:00"), meals: meals(PUSH_A, ["b", "l", "s0", "d"]) }));
    expect(s.phase).toBe("dusk");
    const session = s.later.find((x) => x.kind === "session");
    expect(session).toEqual({ at: t("16:30"), kind: "session", id: "push-a", label: "Push A", done: false });
    expect(s.rail.find((r) => r.phase === "train")!.state).toBe("skipped");
    expect(s.rail.some((r) => r.phase === "refuel")).toBe(false); // no session invented after the window
    expect(s.next).toEqual({ kind: "eat", mealId: "s1" });
  });

  it("next-meal selection (§4.2 test 7)", () => {
    // fuel: a meal due up to an hour ago comes first …
    expect(dayState(day({ ...dawnDone, now: t("13:20"), meals: meals(PUSH_A, ["b"]) })).next).toEqual({ kind: "eat", mealId: "l" });
    // … older than that, the next one ahead
    expect(dayState(day({ ...dawnDone, now: t("13:40"), meals: meals(PUSH_A, ["b"]) })).next).toEqual({ kind: "eat", mealId: "s0" });
    // nothing ahead: the earliest uneaten meal of the day
    expect(dayState(day({ ...dawnDone, now: t("20:00"), meals: meals(PUSH_A, ["l", "s0", "d", "s1"]) })).next).toEqual({ kind: "eat", mealId: "b" });
    // everything eaten: log food
    expect(dayState(day({ ...dawnDone, now: t("20:00"), meals: meals(PUSH_A, ["b", "l", "s0", "d", "s1"]) })).next).toEqual({ kind: "log_food" });
    // no plan at all
    expect(dayState(day({ ...dawnDone, now: t("11:00"), meals: [] })).next).toEqual({ kind: "log_food" });
    // refuel after an early session: the first uneaten meal from 30 min before it ended
    const early = day({ ...dawnDone, now: t("13:10"), session: { status: "done", endedAt: t("12:50") }, meals: meals(PUSH_A, ["b"]) });
    expect(dayState(early).phase).toBe("refuel");
    expect(dayState(early).next).toEqual({ kind: "eat", mealId: "l" });
    // refuel with everything after it eaten → log food
    const fed = day({ ...dawnDone, now: t("18:50"), session: { status: "done", endedAt: t("17:45") }, meals: meals(PUSH_A, ["d", "s1"]) });
    expect(dayState(fed).next).toEqual({ kind: "log_food" });
  });

  it("midnight and 04:59 → seal; 05:00 → dawn (§4.2 test 8)", () => {
    expect(dayPhase(day({ now: 0 }))).toBe("seal");
    expect(dayPhase(day({ now: t("04:59") }))).toBe("seal");
    expect(dayPhase(day({ now: t("05:00") }))).toBe("dawn");
    const night = dayState(day({ now: t("00:30") }));
    expect(night.rail.every((r) => r.state === "later")).toBe(true);
    expect(night.skippedChip).toBeNull();
  });

  it("a live session wins at any hour, and refuel wins over seal", () => {
    expect(dayPhase(day({ now: t("23:30"), session: { status: "active", startedAt: t("22:40") } }))).toBe("live");
    expect(dayPhase(day({ now: t("00:20"), session: { status: "active", startedAt: t("23:40") } }))).toBe("live");
    expect(dayPhase(day({ ...dawnDone, now: t("21:15"), session: { status: "done", endedAt: t("20:30") } }))).toBe("refuel");
    expect(dayPhase(day({ ...dawnDone, now: t("22:31"), session: { status: "done", endedAt: t("20:30") } }))).toBe("seal");
  });

  it("a session started early still shows the live block on the rail as Train", () => {
    const s = dayState(day({ ...dawnDone, now: t("13:00"), session: { status: "active", startedAt: t("12:30") } }));
    expect(s.phase).toBe("live");
    expect(s.rail.find((r) => r.state === "now")).toEqual({ phase: "train", startsAt: t("12:30"), state: "now" });
    expect(s.marks.find((m) => m.kind === "session")!.at).toBe(t("12:30"));
  });

  it("minutesSinceMidnight reads the local wall clock", () => {
    expect(minutesSinceMidnight(new Date(2026, 9, 19, 16, 30))).toBe(990);
    expect(minutesSinceMidnight(new Date(2026, 9, 19, 0, 0))).toBe(0);
    expect(minutesSinceMidnight(new Date(2026, 10, 1, 23, 59))).toBe(1439); // DST end day
  });
});
