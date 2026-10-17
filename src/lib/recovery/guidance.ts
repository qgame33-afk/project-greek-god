// Readiness guidance — a transparent, rule-based heuristic over what the user logged.
// Every point it adds has a visible reason, nothing is inferred from missing data, and
// the result is a training suggestion, never a medical assessment. Pure: the Today,
// Training and Recovery screens all call `computeGuidance` with the same inputs.

import { addDays, type ISODate } from "@/lib/dates";
import { formatHours } from "./checkin";

export interface CheckinLite {
  local_date: ISODate;
  sleep_hours: number | string | null;
  sleep_quality: number | null;
  energy: number | null;
  soreness: number | null;
  fatigue: number | null;
  stress: number | null;
  pain_notes: string | null;
  volleyball: boolean;
}

export interface SessionLite {
  local_date: ISODate;
  status: string;
  name?: string | null;
  sets_completed: number | string | null;
  total_volume_lb?: number | string | null;
}

export interface PlanLite {
  /** "rest" or a template key such as "legs_a" */
  key: string;
  name: string | null;
  /** Lower-body day (squats, hinges, jumps). */
  isLegs: boolean;
  /** The day opens with jumps (box, broad, approach). */
  hasJumps: boolean;
}

export interface ReadinessInput {
  date: ISODate;
  sleepGoalH: number;
  /** Check-ins around the date (the last ~2 weeks is plenty). */
  checkins: CheckinLite[];
  /** Dates with volleyball, from logged sessions and/or the check-in switch. */
  volleyballDates: ISODate[];
  /** Workout sessions over the last ~4 weeks (only `done` ones count). */
  sessions: SessionLite[];
  plan: PlanLite;
}

export type ReadinessLevel =
  "unknown" | "go" | "legs" | "trim" | "ease" | "recover" | "rest";

export interface GuidanceFactor {
  key:
    | "sleep"
    | "sleep_debt"
    | "quality"
    | "energy"
    | "soreness"
    | "fatigue"
    | "stress"
    | "pain"
    | "volleyball"
    | "streak"
    | "volume";
  label: string;
  /** What was logged, e.g. "5.5 of 8 h" */
  value: string;
  /** Strain points this factor adds (0 = fine). */
  points: number;
}

export interface Adjustments {
  /** Sets to drop from each exercise (0 = none). */
  dropSets: number;
  /** Target reps in reserve while the suggestion stands, e.g. "2–3". Null = as planned. */
  rir: string | null;
  /** Percent change to working loads, e.g. −10. Null = as planned. */
  loadPct: number | null;
  skipJumps: boolean;
  /** Move the session and take the day off. */
  rest: boolean;
}

export interface Guidance {
  level: ReadinessLevel;
  title: string;
  detail: string;
  /** Short, factual reasons in order of weight (max 3). */
  reasons: string[];
  /** Extra one-liners (sleep tonight, pain). */
  extras: string[];
  /** Total strain points behind the level. */
  score: number;
  factors: GuidanceFactor[];
  adjustments: Adjustments;
  /** True when today's check-in has at least one recovery signal. */
  hasCheckin: boolean;
  /**
   * A check-in row exists for the date but holds no recovery signal yet (only the
   * volleyball switch, say), so the call is "finish the check-in", not "start one".
   */
  partialCheckin: boolean;
  /** Text of the pain note when one was logged for the date. */
  pain: string | null;
  /**
   * Today's workout: not started, underway or finished. Once it is underway or done the
   * call speaks to that (never "move it to tomorrow" for a session already lifted).
   */
  session: SessionState;
}

export type SessionState = "none" | "active" | "done";

/** The state of the date's workout from the sessions already loaded for readiness. */
export function sessionStateOn(sessions: SessionLite[], date: ISODate): { state: SessionState; name: string | null } {
  const on = sessions.filter((s) => s.local_date === date);
  const done = on.find((s) => s.status === "done");
  if (done) return { state: "done", name: done.name ?? null };
  const active = on.find((s) => s.status === "active");
  if (active) return { state: "active", name: active.name ?? null };
  return { state: "none", name: null };
}

export const DISCLAIMER = "Not a medical assessment.";

/** Score thresholds: 0–1 go · 2–3 trim · 4–5 ease · 6+ recover. */
export const THRESHOLDS = { trim: 2, ease: 4, recover: 6 } as const;

const num = (v: number | string | null | undefined) =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

export function hasSignal(c: CheckinLite | null | undefined) {
  if (!c) return false;
  return (
    [
      c.sleep_hours,
      c.sleep_quality,
      c.energy,
      c.soreness,
      c.fatigue,
      c.stress,
    ].some((v) => num(v) != null) || !!c.pain_notes?.trim()
  );
}

/** Points for a night against the goal: ≥2.5 h short 3 · ≥1.5 h 2 · ≥0.75 h 1. */
export function sleepPoints(hours: number, goal: number) {
  const deficit = goal - hours;
  if (deficit >= 2.5) return 3;
  if (deficit >= 1.5) return 2;
  if (deficit >= 0.75) return 1;
  return 0;
}

/** Points for a 1–5 rating where 5 is bad (soreness, fatigue): 5 → 2, 4 → 1. */
export function highBadPoints(v: number | null) {
  if (v == null) return 0;
  if (v >= 5) return 2;
  if (v >= 4) return 1;
  return 0;
}

/** Points for a 1–5 rating where 1 is bad (energy, sleep quality): 1 → 2, 2 → 1. */
export function lowBadPoints(v: number | null) {
  if (v == null) return 0;
  if (v <= 1) return 2;
  if (v <= 2) return 1;
  return 0;
}

/** Consecutive days with a finished session, counting back from the day before `date`. */
export function trainingStreak(sessions: SessionLite[], date: ISODate) {
  const done = new Set(
    sessions.filter((s) => s.status === "done").map((s) => s.local_date),
  );
  let n = 0;
  let d = addDays(date, -1);
  while (done.has(d) && n < 60) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/**
 * Working sets in the 7 days up to `date` vs the weekly average of the 21 days before.
 * Returns null when there isn't enough history to compare.
 */
export function volumeChange(sessions: SessionLite[], date: ISODate) {
  const done = sessions.filter((s) => s.status === "done");
  const sum = (from: ISODate, to: ISODate) =>
    done
      .filter((s) => s.local_date >= from && s.local_date <= to)
      .reduce((a, s) => a + (num(s.sets_completed) ?? 0), 0);
  const recent = sum(addDays(date, -6), date);
  const priorSessions = done.filter(
    (s) =>
      s.local_date >= addDays(date, -27) && s.local_date <= addDays(date, -7),
  ).length;
  if (priorSessions < 4) return null;
  const priorWeekly = sum(addDays(date, -27), addDays(date, -7)) / 3;
  if (priorWeekly <= 0) return null;
  return { recent, priorWeekly, ratio: recent / priorWeekly };
}

const pct = (r: number) => `${Math.round((r - 1) * 100)}%`;

/**
 * The day's call, aware of today's workout: the plan-level call from the logs, then, once
 * the session is underway or finished, words that fit that (post-session recovery advice
 * after it, "keep the rest light" during it). Reasons and extras are kept either way.
 */
export function computeGuidance(input: ReadinessInput): Guidance {
  const g = planCall(input);
  const { state, name: sessionName } = sessionStateOn(input.sessions, input.date);
  if (state === "none") return g;
  const name = sessionName ?? input.plan.name ?? "Today's session";
  const goal = formatHours(input.sleepGoalH);
  const calm: Adjustments = { dropSets: 0, rir: null, loadPct: null, skipJumps: false, rest: false };

  if (state === "done") {
    const hard = g.level === "recover" || g.level === "ease" || g.score >= THRESHOLDS.ease;
    return {
      ...g,
      session: "done",
      title: `${name} done`,
      detail: hard
        ? `Recovery tonight: protein with dinner, an easy walk and ${goal} h of sleep. Tomorrow's check-in sets the next call.`
        : `Refuel tonight and aim for ${goal} h of sleep. Tomorrow's check-in sets the next call.`,
      // the detail already says how long to sleep
      extras: g.extras.filter((e) => !e.startsWith("Aim for")),
      adjustments: calm,
    };
  }

  // underway
  if (g.level === "recover")
    return {
      ...g,
      session: "active",
      title: `Keep ${name} light`,
      detail: "Your markers called for a recovery day. Finish with light sets at RIR 3–4, or stop early.",
      adjustments: { ...g.adjustments, rest: false, dropSets: Math.max(1, g.adjustments.dropSets), rir: "3–4", loadPct: -10, skipJumps: true },
    };
  if (g.level === "rest")
    return {
      ...g,
      session: "active",
      title: `${name} underway`,
      detail: "A rest day was planned. Keep it short and easy, well short of failure.",
      adjustments: { ...calm, rir: "3–4" },
    };
  if (g.level === "unknown")
    return {
      ...g,
      session: "active",
      detail: `Sleep, energy and soreness say how hard to push the rest of ${name}.`,
    };
  return { ...g, session: "active" };
}

function planCall(input: ReadinessInput): Guidance {
  const { date, sleepGoalH: goal, plan } = input;
  const byDate = new Map(input.checkins.map((c) => [c.local_date, c]));
  const today = byDate.get(date) ?? null;
  const hasCheckin = hasSignal(today);
  const partialCheckin = !!today && !hasCheckin;
  const factors: GuidanceFactor[] = [];

  /* sleep: last night, plus a 3-night average for accumulated debt */
  const sleep = num(today?.sleep_hours);
  let sleepPts = 0;
  if (sleep != null) {
    sleepPts = sleepPoints(sleep, goal);
    factors.push({
      key: "sleep",
      label: "Sleep",
      value: `${formatHours(sleep)} of ${formatHours(goal)} h`,
      points: sleepPts,
    });
  }
  const nights = [0, -1, -2]
    .map((o) => num(byDate.get(addDays(date, o))?.sleep_hours))
    .filter((v): v is number => v != null);
  if (sleep != null && nights.length >= 2) {
    const avg = nights.reduce((a, b) => a + b, 0) / nights.length;
    const debt = goal - avg >= 1 && sleepPts < 3 ? 1 : 0;
    factors.push({
      key: "sleep_debt",
      label: `${nights.length}-night average`,
      value: `${formatHours(Math.round(avg * 4) / 4)} h`,
      points: debt,
    });
  }

  const q = num(today?.sleep_quality);
  if (q != null)
    factors.push({
      key: "quality",
      label: "Sleep quality",
      value: `${q}/5`,
      points: lowBadPoints(q),
    });
  const energy = num(today?.energy);
  if (energy != null)
    factors.push({
      key: "energy",
      label: "Energy",
      value: `${energy}/5`,
      points: lowBadPoints(energy),
    });
  const soreness = num(today?.soreness);
  if (soreness != null)
    factors.push({
      key: "soreness",
      label: "Soreness",
      value: `${soreness}/5`,
      points: highBadPoints(soreness),
    });
  const fatigue = num(today?.fatigue);
  if (fatigue != null)
    factors.push({
      key: "fatigue",
      label: "Fatigue",
      value: `${fatigue}/5`,
      points: highBadPoints(fatigue),
    });
  const stress = num(today?.stress);
  if (stress != null)
    factors.push({
      key: "stress",
      label: "Stress",
      value: `${stress}/5`,
      points: stress >= 4 ? 1 : 0,
    });
  const pain = today?.pain_notes?.trim() || null;
  if (pain)
    factors.push({
      key: "pain",
      label: "Pain noted",
      value: pain.length > 40 ? `${pain.slice(0, 38)}…` : pain,
      points: 1,
    });

  /* context the trackers already know, with or without a check-in */
  const vbSet = new Set(input.volleyballDates);
  const vbDays7 = [...vbSet].filter(
    (d) => d >= addDays(date, -6) && d <= date,
  ).length;
  const vbRecent =
    vbSet.has(date) || vbSet.has(addDays(date, -1)) || !!today?.volleyball;
  if (vbDays7 > 0)
    factors.push({
      key: "volleyball",
      label: "Volleyball, 7 days",
      value: `${vbDays7} ${vbDays7 === 1 ? "day" : "days"}`,
      points: vbDays7 >= 3 ? 1 : 0,
    });
  const streak = trainingStreak(input.sessions, date);
  if (streak >= 3)
    factors.push({
      key: "streak",
      label: "Straight training days",
      value: String(streak),
      points: streak >= 6 ? 1 : 0,
    });
  const vol = volumeChange(input.sessions, date);
  if (vol && vol.ratio >= 1.15) {
    const spike = vol.ratio >= 1.3 && vol.recent - vol.priorWeekly >= 10;
    factors.push({
      key: "volume",
      label: "Sets vs 3-wk average",
      value: `+${pct(vol.ratio)}`,
      points: spike ? 1 : 0,
    });
  }

  // sleep (night + debt) contributes at most 3 so one bad metric can't dominate
  const sleepTotal = Math.min(
    3,
    factors
      .filter((f) => f.key === "sleep" || f.key === "sleep_debt")
      .reduce((a, f) => a + f.points, 0),
  );
  const score =
    sleepTotal +
    factors
      .filter((f) => f.key !== "sleep" && f.key !== "sleep_debt")
      .reduce((a, f) => a + f.points, 0);

  const heavy = factors
    .filter((f) => f.points > 0)
    .sort((a, b) => b.points - a.points);
  const reasonOf = (f: GuidanceFactor) =>
    f.key === "sleep"
      ? `Slept ${f.value}`
      : f.key === "pain"
        ? `Pain noted: ${f.value}`
        : f.key === "volleyball"
          ? `Volleyball ${f.value} of the last 7`
          : `${f.label} ${f.value}`;
  const positives = factors.filter(
    (f) =>
      f.points === 0 &&
      ["sleep", "energy", "soreness", "fatigue", "quality"].includes(f.key),
  );

  const extras: string[] = [];
  if (sleep != null && goal - sleep >= 1)
    extras.push(`Aim for ${formatHours(goal)} h tonight.`);
  if (pain)
    extras.push(
      "Work around the sore area and skip anything that hurts. Sharp or lasting pain: get it checked.",
    );

  const legsLoaded =
    plan.isLegs && vbRecent && ((soreness ?? 0) >= 3 || (fatigue ?? 0) >= 3);
  const base = (
    level: ReadinessLevel,
    title: string,
    detail: string,
    adjustments: Partial<Adjustments> = {},
  ): Guidance => ({
    level,
    title,
    detail,
    reasons: (heavy.length ? heavy : positives).slice(0, 3).map(reasonOf),
    extras,
    score,
    factors,
    adjustments: {
      dropSets: 0,
      rir: null,
      loadPct: null,
      skipJumps: false,
      rest: false,
      ...adjustments,
    },
    hasCheckin,
    partialCheckin,
    pain,
    session: "none",
  });

  /* rest day: no training decision to make, just how to use it */
  if (plan.key === "rest") {
    if (!hasCheckin)
      return {
        ...base(
          "rest",
          "Recovery day",
          partialCheckin
            ? "Walk, mobility and an early night. Add sleep and how you feel to your check-in."
            : "Walk, mobility and an early night. Check in to log how you slept.",
        ),
        reasons: heavy.slice(0, 3).map(reasonOf),
      };
    return base(
      "rest",
      score >= THRESHOLDS.ease ? "Rest fully today" : "Recovery day",
      score >= THRESHOLDS.ease
        ? "An easy walk at most, then sleep. Your markers say the rest is needed."
        : "Walk, mobility and an early night. Training resumes next session.",
      { rest: true },
    );
  }

  const session = plan.name ?? "the session";

  if (!hasCheckin) {
    return {
      ...base(
        "unknown",
        partialCheckin
          ? "Add sleep and soreness"
          : "Check in for today's guidance",
        partialCheckin
          ? `${today?.volleyball ? "Volleyball is logged. " : ""}Sleep, energy and soreness decide whether to run ${session} as planned.`
          : `Sleep, energy and soreness decide whether to run ${session} as planned. It takes 20 seconds.`,
      ),
      reasons: heavy.slice(0, 3).map(reasonOf),
    };
  }

  if (score >= THRESHOLDS.recover)
    return base(
      "recover",
      "Take a recovery day",
      `Walk, mobility, sleep. Move ${session} to tomorrow.`,
      { rest: true, skipJumps: true },
    );

  if (score >= THRESHOLDS.ease)
    return base(
      "ease",
      "Go lighter today",
      "Same exercises, about 10% lighter, one set fewer per exercise, and stop at RIR 3.",
      {
        dropSets: 1,
        rir: "3",
        loadPct: -10,
        skipJumps: plan.hasJumps,
      },
    );

  if (legsLoaded) {
    // Name what triggered the call (volleyball + tired legs) even when neither scores points,
    // so the reasons never read as "all fine" next to "skip the jumps".
    const vbWhen =
      vbSet.has(date) || today?.volleyball
        ? "Volleyball today"
        : "Volleyball yesterday";
    const legs =
      (soreness ?? 0) >= (fatigue ?? 0)
        ? `Soreness ${soreness}/5`
        : `Fatigue ${fatigue}/5`;
    const why = [vbWhen, legs];
    return {
      ...base(
        "legs",
        plan.hasJumps ? "Skip the jumps today" : "Ease off the legs",
        plan.hasJumps
          ? `Swap jumps for extra rest; legs are carrying volleyball fatigue.${score >= THRESHOLDS.trim ? " Drop one set per exercise too." : ""}`
          : `Keep leg work at RIR 2–3; legs are carrying volleyball fatigue.${score >= THRESHOLDS.trim ? " Drop one set per exercise." : ""}`,
        {
          skipJumps: plan.hasJumps,
          rir: "2–3",
          dropSets: score >= THRESHOLDS.trim ? 1 : 0,
        },
      ),
      reasons: [
        ...why,
        ...heavy
          .filter((f) => f.key !== "volleyball")
          .map(reasonOf)
          .filter((r) => !why.includes(r)),
      ].slice(0, 3),
    };
  }

  if (score >= THRESHOLDS.trim)
    return base(
      "trim",
      "Trim the session",
      "Keep the session but drop one set per exercise and stay at RIR 2–3.",
      { dropSets: 1, rir: "2–3" },
    );

  return base(
    "go",
    "Train as planned",
    pain
      ? `Other markers look fine. Run ${session} at the planned RIR and work around the sore area.`
      : `Recovery markers look fine. Run ${session} at the planned RIR.`,
  );
}

/** Lower-body templates and whether they open with jumps (from the template's exercises). */
export function planLite(
  key: string,
  name: string | null,
  exerciseSlugs: string[],
): PlanLite {
  const JUMPS = /jump/;
  return {
    key,
    name,
    isLegs: key.startsWith("legs"),
    hasJumps: exerciseSlugs.some((s) => JUMPS.test(s)),
  };
}

/**
 * The guidance as one sentence for other screens (Today's daily line, the Training start
 * card), so every screen says the same thing for the same check-in (SPEC §25). Null when
 * there's no check-in to go on, or nothing worth saying. Kept short: every variant fits
 * the Today hero in full on a 375 px phone (unit-tested).
 */
export function readinessLine(
  g: Pick<Guidance, "level" | "score" | "adjustments"> & {
    pain?: string | null;
    session?: SessionState;
  },
  session: string | null,
): string | null {
  const n = session ?? "Today's session";
  // A logged pain note travels with the call on every screen (not only on Recovery).
  const hurts = g.pain ? " Skip anything that hurts." : "";
  const drop = g.adjustments.dropSets > 0 ? ", one set fewer" : "";
  if (g.session === "done") {
    return g.level === "recover" || g.level === "ease" || g.score >= THRESHOLDS.ease
      ? `${n} done. Recovery tonight: protein, an easy walk, an early night.`
      : `${n} done. Refuel and sleep well tonight.`;
  }
  if (g.session === "active" && g.level === "recover") return `${n} underway: keep the rest light, RIR 3–4, or stop early.${hurts}`;
  switch (g.level) {
    case "recover":
      return `Recovery day suggested. Move ${n} to tomorrow: walk, mobility, sleep.`;
    case "ease":
      return `${n} today, lighter: 10% less load, one set fewer, RIR 3.${hurts}`;
    case "trim":
      return `${n} today, trimmed: one set fewer per exercise, RIR 2–3.${hurts}`;
    case "legs":
      return g.adjustments.skipJumps
        ? `${n} today without the jumps${drop}. Volleyball has tired your legs.${hurts}`
        : `${n} today, leg work at RIR 2–3${drop}. Volleyball has tired your legs.${hurts}`;
    case "go":
      return g.pain ? `${n} today as planned, around the sore area.${hurts}` : `${n} today as planned. Recovery markers look fine.`;
    case "rest":
      return g.score >= THRESHOLDS.ease ? "Rest fully today. An easy walk at most, then sleep." : null;
    default:
      return null;
  }
}
