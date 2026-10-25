// The Day Engine (DESIGN-V2 §4.2): which phase of the day it is, what the one next action
// is, and the day's timeline for Now's phase rail and its Later / Earlier lists. Pure: the
// Now screen assembles DayInput from the existing hooks (useDayInput) and re-evaluates it
// every minute and on focus. Times are minutes since local midnight.

import type { ISODate } from "@/lib/dates";
import type { Min } from "@/lib/prefs";

export type { Min };
export type Phase = "dawn" | "fuel" | "train" | "live" | "refuel" | "dusk" | "seal";

export interface PlannedMealSlot {
  id: string;
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  position: number;
  name: string;
  kcal: number;
  protein: number;
  at: Min; // from plannedTime() (§4.4)
  role: "breakfast" | "lunch" | "dinner" | "snack" | "pre" | "post";
  eaten: boolean; // a linked food entry exists today
}

export interface TrainPlan {
  key: string;
  name: string;
  at: Min | null;
  durationMin: number | null;
}

export interface DayInput {
  date: ISODate;
  now: Min;
  /** Train or rest. (The `volleyball` variant is @deprecated: read as its training session, or rest; removed in P2.) */
  plan: ({ kind: "train" } & TrainPlan) | { kind: "rest" } | { kind: "volleyball"; train?: TrainPlan };
  session: { status: "none" } | { status: "active"; startedAt: Min } | { status: "done"; endedAt: Min };
  meals: PlannedMealSlot[];
  checkInDone: boolean; // the 3 Dawn questions answered (sleep, soreness, energy non-null)
  weighInDone: boolean; // a weigh-in exists for date
  dawnDismissed: boolean; // "Later" tapped on Dawn
  sealed: boolean; // localStorage pgg.sealed.<date>
  lightsOut: Min | null; // reminders.sleep.time, else null (rail uses 22:30)
  /** When Dawn was completed or dismissed today, if known: the rail's Fuel starts there. */
  dawnDoneAt?: Min | null;
}

export interface DayItem {
  at: Min | null;
  kind: "meal" | "session" | "checkin" | "weighin" | "rite" | "chronicle";
  id: string;
  label: string;
  done: boolean;
}

export type NextAction =
  | { kind: "checkin" }
  | { kind: "weighin" }
  | { kind: "eat"; mealId: string }
  | { kind: "begin"; key: string }
  | { kind: "return" }
  | { kind: "log_food" }
  | { kind: "seal" }
  | { kind: "none" };

export type RailPhase = Exclude<Phase, "live">;

export interface DayState {
  phase: Phase;
  rail: { phase: RailPhase; startsAt: Min; state: "done" | "now" | "later" | "skipped" }[];
  marks: { at: Min; kind: "meal" | "session" | "lights"; done: boolean }[];
  next: NextAction;
  later: DayItem[]; // at ≥ now or untimed-and-not-done, time order
  earlier: DayItem[]; // done or past
  skippedChip: string | null; // e.g. "Check-in · 2 left"
}

export const DAY_START: Min = 5 * 60;
export const DAWN_UNTIL: Min = 10 * 60 + 30;
export const TRAIN_LEAD: Min = 90;
/** The Train phase stays up this long after the planned time if the session hasn't started. */
export const TRAIN_GRACE: Min = 180;
export const REFUEL_FOR: Min = 120;
export const DUSK_FROM: Min = 18 * 60;
export const SEAL_FROM: Min = 21 * 60;
export const LIGHTS_OUT_DEFAULT: Min = 22 * 60 + 30;
/** Session length assumed when the template's typical duration is unknown. */
export const DEFAULT_SESSION_MIN = 75;
/** Refuel looks for a meal from this long before the session ended. */
export const REFUEL_MEAL_LEAD = 30;
/** Fuel/Dusk offer a meal that was due up to this long ago before looking further ahead. */
export const MEAL_GRACE = 60;

/** Minutes since local midnight for a Date (local wall clock, so DST days read as the clock does). */
export function minutesSinceMidnight(d: Date): Min {
  return d.getHours() * 60 + d.getMinutes();
}

/** Today's training session, if any. */
export function trainOf(plan: DayInput["plan"]): TrainPlan | null {
  if (plan.kind === "train") return { key: plan.key, name: plan.name, at: plan.at, durationMin: plan.durationMin };
  if (plan.kind === "volleyball" && plan.train) return plan.train;
  return null;
}

const durationOf = (t: TrainPlan | null) => (t?.durationMin && t.durationMin > 0 ? t.durationMin : DEFAULT_SESSION_MIN);

/**
 * The phase, first match wins:
 * live > refuel (≤ 2 h after the session) > seal (21:00–05:00) > dawn (check-in or weigh-in
 * left, not dismissed, before 10:30) > train (90 min before the planned time until 3 h
 * after it; all day until 18:00 when no time is set) > dusk (from 18:00) > fuel.
 */
export function dayPhase(i: DayInput): Phase {
  const s = i.session;
  if (s.status === "active") return "live";
  if (s.status === "done" && i.now - s.endedAt <= REFUEL_FOR) return "refuel";
  if (i.now >= SEAL_FROM || i.now < DAY_START) return "seal";
  if (!(i.checkInDone && i.weighInDone) && !i.dawnDismissed && i.now < DAWN_UNTIL) return "dawn";
  const t = trainOf(i.plan);
  if (t && s.status === "none") {
    if (t.at != null) {
      if (i.now >= t.at - TRAIN_LEAD && i.now < t.at + TRAIN_GRACE) return "train";
    } else if (i.now < DUSK_FROM) return "train";
  }
  if (i.now >= DUSK_FROM) return "dusk";
  return "fuel";
}

const byTime = (a: PlannedMealSlot, b: PlannedMealSlot) => a.at - b.at || a.position - b.position;

function nextAction(i: DayInput, phase: Phase): NextAction {
  const open = i.meals.filter((m) => !m.eaten).sort(byTime);
  const eat = (m: PlannedMealSlot | undefined): NextAction => (m ? { kind: "eat", mealId: m.id } : { kind: "log_food" });
  switch (phase) {
    case "dawn":
      return i.checkInDone ? { kind: "weighin" } : { kind: "checkin" };
    case "train":
      return { kind: "begin", key: trainOf(i.plan)!.key };
    case "live":
      return { kind: "return" };
    case "seal":
      return i.sealed ? { kind: "none" } : { kind: "seal" };
    case "refuel": {
      const end = i.session.status === "done" ? i.session.endedAt : i.now;
      return eat(open.find((m) => m.at >= end - REFUEL_MEAL_LEAD));
    }
    case "fuel":
    case "dusk":
      return eat(open.find((m) => m.at >= i.now - MEAL_GRACE) ?? open[0]);
  }
}

/**
 * The day's phases as segments, by evaluating the same rules over the day: what has
 * happened stays where it happened, what is planned shows where it will fall. A live
 * session shows as Train. Fuel can appear twice (before and after an early session).
 */
function segments(i: DayInput): { phase: RailPhase; startsAt: Min; endsAt: Min }[] {
  const t = trainOf(i.plan);
  const dur = durationOf(t);
  const dawnOver = i.checkInDone && i.weighInDone;
  const dawnEnd = dawnOver || i.dawnDismissed ? Math.min(DAWN_UNTIL, i.dawnDoneAt ?? (i.now < DAWN_UNTIL ? i.now : DAWN_UNTIL)) : DAWN_UNTIL;
  // the session at minute m, as far as we know it
  const sessionAt = (m: Min): DayInput["session"] => {
    const s = i.session;
    if (s.status === "active") {
      if (m < s.startedAt) return { status: "none" };
      const end = Math.max(s.startedAt + dur, i.now + 1);
      return m < end ? { status: "active", startedAt: s.startedAt } : { status: "done", endedAt: end };
    }
    if (s.status === "done") {
      if (m >= s.endedAt) return s;
      return m >= s.endedAt - dur ? { status: "active", startedAt: s.endedAt - dur } : { status: "none" };
    }
    // Not started: while the Train window is still open, the planned session is assumed to
    // happen at its time (or from now, if late), so Refuel shows where it will fall.
    if (t && t.at != null && m > i.now && i.now < t.at + TRAIN_GRACE) {
      const start = Math.max(t.at, i.now + 1);
      if (m >= start + dur) return { status: "done", endedAt: start + dur };
      if (m >= start) return { status: "active", startedAt: start };
    }
    return s;
  };
  const out: { phase: RailPhase; startsAt: Min; endsAt: Min }[] = [];
  for (let m = DAY_START; m < 24 * 60; m++) {
    const sim: DayInput = {
      ...i,
      now: m,
      session: sessionAt(m),
      checkInDone: m >= dawnEnd,
      weighInDone: m >= dawnEnd,
      dawnDismissed: false,
    };
    const p = dayPhase(sim);
    const phase: RailPhase = p === "live" ? "train" : p;
    const last = out.at(-1);
    if (last && last.phase === phase) last.endsAt = m + 1;
    else out.push({ phase, startsAt: m, endsAt: m + 1 });
  }
  return out;
}

/** Everything Now needs for the day: phase, rail, marks, the next action and the lists. */
export function dayState(i: DayInput): DayState {
  const phase = dayPhase(i);
  const t = trainOf(i.plan);
  const dawnLeft = (i.checkInDone ? 0 : 1) + (i.weighInDone ? 0 : 1);

  const mealsIn = (a: Min, b: Min) => i.meals.filter((m) => m.at >= a && m.at < b);
  const actionDone = (p: RailPhase, a: Min, b: Min): boolean => {
    if (p === "dawn") return dawnLeft === 0;
    if (p === "train") return i.session.status !== "none";
    return mealsIn(a, b).every((m) => m.eaten); // nothing planned in it counts as done
  };
  const rail: DayState["rail"] = segments(i).map((g) => ({
    phase: g.phase,
    startsAt: g.startsAt,
    state: i.now >= g.startsAt && i.now < g.endsAt ? "now" : g.endsAt <= i.now ? (actionDone(g.phase, g.startsAt, g.endsAt) ? "done" : "skipped") : "later",
  }));
  const dawnSkipped = rail.some((r) => r.phase === "dawn" && r.state === "skipped");

  // When the session happened (or will): its start, estimated from the end when it's done.
  const s = i.session;
  const sessionAt = !t ? null : s.status === "active" ? s.startedAt : s.status === "done" ? Math.max(0, s.endedAt - durationOf(t)) : t.at;
  const marks: DayState["marks"] = i.meals.map((m) => ({ at: m.at, kind: "meal" as const, done: m.eaten }));
  if (sessionAt != null) marks.push({ at: sessionAt, kind: "session", done: s.status === "done" });
  marks.push({ at: i.lightsOut ?? LIGHTS_OUT_DEFAULT, kind: "lights", done: false });
  marks.sort((a, b) => a.at - b.at);

  const items: DayItem[] = i.meals.map((m) => ({ at: m.at, kind: "meal", id: m.id, label: m.name, done: m.eaten }));
  if (t) items.push({ at: sessionAt, kind: "session", id: t.key, label: t.name, done: s.status === "done" });
  // Check-in and weigh-in live on the Dawn card (or the skipped chip) until done; then they move to Earlier.
  if (i.checkInDone) items.push({ at: null, kind: "checkin", id: "checkin", label: "Check-in", done: true });
  if (i.weighInDone) items.push({ at: null, kind: "weighin", id: "weighin", label: "Weigh-in", done: true });

  const isEarlier = (x: DayItem) => x.done || (x.kind !== "session" && x.at != null && x.at < i.now);
  const order = (nullsFirst: boolean) => (a: DayItem, b: DayItem) => {
    if (a.at == null || b.at == null) return a.at == null && b.at == null ? 0 : (a.at == null) === nullsFirst ? -1 : 1;
    return a.at - b.at;
  };
  const later = items.filter((x) => !isEarlier(x)).sort(order(false));
  const earlier = items.filter(isEarlier).sort(order(true));

  return {
    phase,
    rail,
    marks,
    next: nextAction(i, phase),
    later,
    earlier,
    skippedChip: dawnSkipped && dawnLeft > 0 ? `Check-in · ${dawnLeft} left` : null,
  };
}
