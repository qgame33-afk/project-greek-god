// Yesterday's recap for Today: what was actually logged on the previous calendar day.
// Pure — every value comes from rows the trackers wrote. Anything not logged stays null so the
// card shows "—"; nothing here is framed as a miss.

import { addDays, dayName, daysBetween, shortDate, type ISODate } from "@/lib/dates";
import { caloriesHit, proteinHit } from "@/lib/nutrition";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { latestRecords, type PREventRow } from "./records";

export interface RecapSession {
  id: string;
  name: string;
  local_date: ISODate;
  status: string;
  sets_completed: number | null;
  total_volume_lb: number | string | null;
  duration_sec: number | null;
  started_at: string;
  ended_at: string | null;
}

export interface YesterdayInput {
  /** Today's date; the recap covers the day before it. */
  today: ISODate;
  /** Profile start date: days before it have nothing to recap. */
  startDate: ISODate | null;
  /** Name of the workout planned for yesterday, or null when it was a rest day. */
  plannedName: string | null;
  sessions: RecapSession[];
  prEvents: PREventRow[];
  volleyball: { local_date: ISODate; kind: string | null; duration_min: number | null }[];
  food: { local_date: ISODate | null; calories: number | string | null; protein_g: number | string | null; entries: number | null }[];
  water: { local_date: ISODate | null; total_ml: number | null }[];
  /** Weigh-ins, any order. */
  weights: { local_date: ISODate; weight_lb: number | string }[];
  recovery: { local_date: ISODate; sleep_hours: number | string | null; volleyball?: boolean | null }[];
  /** Yesterday's mission score from the habit evaluator, when it has been computed. */
  mission: { done: number; total: number } | null;
  goals: { calories: number; protein: number; waterMl: number; sleepH: number };
}

export type RecapTraining =
  | { kind: "done"; name: string; sessionId: string | null; sessions: number; sets: number; volumeLb: number; minutes: number | null; prs: number }
  | { kind: "open"; name: string; sessionId: string }
  | { kind: "volleyball" }
  | { kind: "rest" }
  | { kind: "unlogged"; planned: string };

export interface RecapMetric {
  /** Logged value, or null when nothing was logged. */
  value: number | null;
  goal: number;
  met: boolean;
  /** value ÷ goal, 0 when either is missing. */
  ratio: number;
}

export interface YesterdayRecap {
  date: ISODate;
  /** Yesterday predates the plan: there is nothing to recap yet. */
  beforeStart: boolean;
  training: RecapTraining;
  /** Volleyball played yesterday (shown beside a lifting session, or as the day's training). */
  volleyball: { kind: string | null; minutes: number | null } | null;
  calories: RecapMetric;
  protein: RecapMetric;
  water: RecapMetric;
  sleep: RecapMetric;
  weight: { lb: number | null; deltaLb: number | null; prevDate: ISODate | null };
  missions: { done: number; total: number; complete: boolean } | null;
  /** Trackers with anything logged for the day — 0 means the card shows guidance. */
  logged: number;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const metric = (value: number | null, goal: number, met: (v: number, g: number) => boolean): RecapMetric => ({
  value,
  goal,
  met: value != null && goal > 0 && met(value, goal),
  ratio: value != null && goal > 0 ? Math.max(0, value) / goal : 0,
});

function sessionSeconds(s: RecapSession): number | null {
  if (s.duration_sec != null && s.duration_sec > 0) return s.duration_sec;
  if (!s.ended_at) return null;
  const secs = (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000;
  return Number.isFinite(secs) && secs > 0 ? secs : null;
}

export function yesterdayRecap(i: YesterdayInput): YesterdayRecap {
  const date = addDays(i.today, -1);
  const beforeStart = !!i.startDate && date < i.startDate;

  // Training — a finished session wins, then one still open, then volleyball, then the plan.
  const sessions = i.sessions.filter((s) => s.local_date === date && s.status !== "discarded");
  const done = sessions.filter((s) => s.status === "done").sort((a, b) => a.started_at.localeCompare(b.started_at));
  const open = sessions.find((s) => s.status === "active") ?? null;
  const vbRows = i.volleyball.filter((v) => v.local_date === date);
  const rec = i.recovery.find((r) => r.local_date === date) ?? null;
  const volleyball =
    vbRows.length || rec?.volleyball
      ? {
          kind: vbRows[0]?.kind ?? null,
          minutes: vbRows.some((v) => v.duration_min != null) ? vbRows.reduce((t, v) => t + (v.duration_min ?? 0), 0) : null,
        }
      : null;

  let training: RecapTraining;
  if (done.length) {
    const secs = done.map(sessionSeconds).filter((s): s is number => s != null);
    training = {
      kind: "done",
      name: done.map((s) => s.name).join(" + "),
      sessionId: done.length === 1 ? done[0].id : null,
      sessions: done.length,
      sets: done.reduce((t, s) => t + (s.sets_completed ?? 0), 0),
      volumeLb: Math.round(done.reduce((t, s) => t + (num(s.total_volume_lb) ?? 0), 0)),
      minutes: secs.length ? Math.max(1, Math.round(secs.reduce((t, s) => t + s, 0) / 60)) : null, // "1 min" floor, as on the summary
      // one record per exercise per session, same as the Records card
      prs: latestRecords(
        i.prEvents.filter((e) => e.local_date === date),
        Number.POSITIVE_INFINITY,
      ).length,
    };
  } else if (open) {
    training = { kind: "open", name: open.name, sessionId: open.id };
  } else if (volleyball) {
    training = { kind: "volleyball" };
  } else if (i.plannedName) {
    training = { kind: "unlogged", planned: i.plannedName };
  } else {
    training = { kind: "rest" };
  }

  // Fuel — a day with no food rows is "not logged", never "0 kcal".
  const food = i.food.find((f) => f.local_date === date && (f.entries ?? 0) > 0) ?? null;
  const calories = metric(food ? (num(food.calories) ?? 0) : null, i.goals.calories, caloriesHit);
  const protein = metric(food ? (num(food.protein_g) ?? 0) : null, i.goals.protein, proteinHit);
  const ml = i.water.filter((w) => w.local_date === date).reduce((t, w) => t + (w.total_ml ?? 0), 0);
  const water = metric(ml > 0 ? ml : null, i.goals.waterMl, (v, g) => v >= g);

  // Sleep from yesterday's check-in.
  const sleep = metric(num(rec?.sleep_hours), i.goals.sleepH, (v, g) => v >= g);

  // Weigh-in, with the change since the one before it.
  const sorted = [...i.weights].sort((a, b) => a.local_date.localeCompare(b.local_date));
  const w = sorted.find((x) => x.local_date === date) ?? null;
  const prev = [...sorted].reverse().find((x) => x.local_date < date) ?? null;
  const lb = num(w?.weight_lb);
  const prevLb = num(prev?.weight_lb);
  const weight = {
    lb,
    deltaLb: lb != null && prevLb != null ? Math.round((lb - prevLb) * 10) / 10 : null,
    prevDate: lb != null && prev ? prev.local_date : null,
  };

  const missions = i.mission && i.mission.total > 0 ? { done: i.mission.done, total: i.mission.total, complete: i.mission.done >= i.mission.total } : null;

  const logged =
    (training.kind === "done" || training.kind === "open" || training.kind === "volleyball" ? 1 : 0) +
    (calories.value != null ? 1 : 0) +
    (water.value != null ? 1 : 0) +
    (sleep.value != null ? 1 : 0) +
    (weight.lb != null ? 1 : 0);

  return { date, beforeStart, training, volleyball, calories, protein, water, sleep, weight, missions, logged };
}

/**
 * Short weigh-in caption that fits a phone ledger cell: "+0.4 vs Tue" against a weigh-in in the
 * week before, else "−0.2 vs Oct 2"; "±0.0" when it rounds to no change in the display unit.
 */
export function weighInCaption(deltaLb: number, prevDate: ISODate, date: ISODate, unit: WeightUnit, today: ISODate): string {
  const v = round(toDisplayWeight(deltaLb, unit), 1);
  const d = v === 0 ? "±0.0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;
  return `${d} vs ${daysBetween(prevDate, date) <= 6 ? dayName(prevDate, true) : shortDate(prevDate, today)}`;
}
