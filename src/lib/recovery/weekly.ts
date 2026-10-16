// Weekly recovery review: what the week's logs say about sleep, load and how you felt,
// compared with the week before, plus 1–3 concrete adjustments for the next week.
// Pure and deterministic — every number is computed from logged rows; missing data stays null.

import { addDays, dateRange, daysBetween, type ISODate } from "@/lib/dates";
import { formatHours } from "./checkin";
import type { CheckinLite, SessionLite } from "./guidance";

export interface VolleyballLite {
  local_date: ISODate;
  duration_min: number | null;
}

export interface WeeklyInput {
  /** Monday of the reviewed week. */
  weekStart: ISODate;
  today: ISODate;
  sleepGoalH: number;
  /** Check-ins covering this week and the previous one. */
  checkins: CheckinLite[];
  /** Sessions covering this week and the previous one. */
  sessions: SessionLite[];
  /** Logged volleyball sessions covering this week and the previous one. */
  volleyball: VolleyballLite[];
  /** Training days planned this week (rest days excluded). */
  plannedDates: ISODate[];
  /** The user's start date; earlier days aren't counted. */
  startDate?: ISODate | null;
}

export type Trend = "up" | "down" | "flat" | null;

export interface RatingSummary {
  avg: number | null;
  prevAvg: number | null;
  trend: Trend;
  n: number;
}

export interface WeeklyRecommendation {
  key:
    | "log"
    | "deload"
    | "lighter"
    | "sleep"
    | "consistency"
    | "volleyball"
    | "schedule"
    | "rest"
    | "volume"
    | "keep";
  title: string;
  reason: string;
}

export interface WeeklyReview {
  weekStart: ISODate;
  weekEnd: ISODate;
  dates: ISODate[];
  /** Days of the week up to today (and on/after the start date). */
  daysElapsed: number;
  inProgress: boolean;
  /** Nothing at all was logged this week. */
  empty: boolean;
  sleep: {
    goal: number;
    avg: number | null;
    prevAvg: number | null;
    nights: number;
    nightsAtGoal: number;
    /** Population standard deviation of logged hours; null under 2 nights. */
    sd: number | null;
    consistency: "Steady" | "Fairly steady" | "Variable" | null;
    byDay: (number | null)[];
  };
  training: {
    done: number;
    planned: number;
    plannedSoFar: number;
    sets: number;
    volumeLb: number;
    prevSets: number;
    prevVolumeLb: number;
    /** Volume change vs the previous week as a ratio − 1; null without a comparison. */
    volumeChange: number | null;
    /** What volumeChange compares against: the whole of last week, or the same days of it. */
    compareTo: "last week" | "same days last week";
  };
  volleyball: { sessions: number; minutes: number; prevSessions: number };
  restDays: number;
  soreness: RatingSummary;
  fatigue: RatingSummary;
  energy: RatingSummary;
  recommendations: WeeklyRecommendation[];
}

const num = (v: number | string | null | undefined) =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);

export function stdDev(xs: number[]) {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

export function consistencyLabel(
  sd: number | null,
): WeeklyReview["sleep"]["consistency"] {
  if (sd == null) return null;
  if (sd <= 0.5) return "Steady";
  if (sd <= 1) return "Fairly steady";
  return "Variable";
}

export function trendOf(
  avg: number | null,
  prev: number | null,
  threshold = 0.3,
): Trend {
  if (avg == null || prev == null) return null;
  const d = Math.round((avg - prev) * 100) / 100; // avoid 2.0 − 2.3 = −0.2999…
  if (Math.abs(d) < threshold) return "flat";
  return d > 0 ? "up" : "down";
}

function rating(
  cur: CheckinLite[],
  prev: CheckinLite[],
  key: "soreness" | "fatigue" | "energy",
): RatingSummary {
  const a = cur.map((c) => num(c[key])).filter((v): v is number => v != null);
  const b = prev.map((c) => num(c[key])).filter((v): v is number => v != null);
  const avg = a.length ? r1(mean(a)) : null;
  const prevAvg = b.length >= 2 ? r1(mean(b)) : null;
  return {
    avg,
    prevAvg,
    trend: a.length >= 2 ? trendOf(avg, prevAvg) : null,
    n: a.length,
  };
}

export function weeklyReview(input: WeeklyInput): WeeklyReview {
  const { weekStart, today, sleepGoalH: goal } = input;
  const weekEnd = addDays(weekStart, 6);
  const prevStart = addDays(weekStart, -7);
  const prevEnd = addDays(weekStart, -1);
  const dates = dateRange(weekStart, weekEnd);
  const counted = (d: ISODate) =>
    d <= today && (!input.startDate || d >= input.startDate);
  const elapsed = dates.filter(counted);
  const inWeek = (d: ISODate) => d >= weekStart && d <= weekEnd;
  const inPrev = (d: ISODate) => d >= prevStart && d <= prevEnd;

  const cur = input.checkins.filter((c) => inWeek(c.local_date));
  const prev = input.checkins.filter((c) => inPrev(c.local_date));
  const byDate = new Map(cur.map((c) => [c.local_date, c]));

  /* sleep */
  const byDay = dates.map((d) => num(byDate.get(d)?.sleep_hours ?? null));
  const hours = byDay.filter((v): v is number => v != null);
  const prevHours = prev
    .map((c) => num(c.sleep_hours))
    .filter((v): v is number => v != null);
  const sd = r2(stdDev(hours));
  const sleep = {
    goal,
    avg: r2(mean(hours)),
    prevAvg: prevHours.length >= 2 ? r2(mean(prevHours)) : null,
    nights: hours.length,
    nightsAtGoal: hours.filter((h) => h >= goal).length,
    sd,
    consistency: consistencyLabel(sd),
    byDay,
  };

  /* training */
  const done = input.sessions.filter((s) => s.status === "done");
  const wk = done.filter((s) => inWeek(s.local_date));
  const pw = done.filter((s) => inPrev(s.local_date));
  const sumSets = (xs: SessionLite[]) =>
    xs.reduce((a, s) => a + (num(s.sets_completed) ?? 0), 0);
  const sumVol = (xs: SessionLite[]) =>
    xs.reduce((a, s) => a + (num(s.total_volume_lb) ?? 0), 0);
  const volumeLb = Math.round(sumVol(wk));
  const prevVolumeLb = Math.round(sumVol(pw));
  // An unfinished week is compared with the same weekdays of the week before, not all of it.
  const inProgress = weekEnd > today;
  const sameDaysEnd = addDays(
    prevStart,
    Math.max(0, daysBetween(weekStart, today)),
  );
  const prevComparable = inProgress
    ? Math.round(sumVol(pw.filter((x) => x.local_date <= sameDaysEnd)))
    : prevVolumeLb;
  const planned = input.plannedDates.filter(inWeek);
  const training = {
    done: new Set(wk.map((s) => s.local_date)).size,
    planned: planned.length,
    plannedSoFar: planned.filter((d) => d <= today).length,
    sets: sumSets(wk),
    volumeLb,
    prevSets: sumSets(pw),
    prevVolumeLb,
    volumeChange:
      prevComparable > 0 && volumeLb > 0
        ? Math.round((volumeLb / prevComparable - 1) * 100) / 100
        : null,
    compareTo: inProgress
      ? ("same days last week" as const)
      : ("last week" as const),
  };

  /* volleyball: logged sessions, plus check-ins that flagged it without details */
  const vbDates = new Set(
    input.volleyball
      .filter((v) => inWeek(v.local_date))
      .map((v) => v.local_date),
  );
  for (const c of cur) if (c.volleyball) vbDates.add(c.local_date);
  const prevVb = new Set(
    input.volleyball
      .filter((v) => inPrev(v.local_date))
      .map((v) => v.local_date),
  );
  for (const c of prev) if (c.volleyball) prevVb.add(c.local_date);
  const volleyball = {
    sessions: vbDates.size,
    minutes: input.volleyball
      .filter((v) => inWeek(v.local_date))
      .reduce((a, v) => a + (v.duration_min ?? 0), 0),
    prevSessions: prevVb.size,
  };

  /* rest days: elapsed days with neither a finished session nor volleyball */
  const trainedDates = new Set(wk.map((s) => s.local_date));
  const restDays = elapsed.filter(
    (d) => !trainedDates.has(d) && !vbDates.has(d),
  ).length;

  const soreness = rating(cur, prev, "soreness");
  const fatigue = rating(cur, prev, "fatigue");
  const energy = rating(cur, prev, "energy");

  const empty = !cur.length && !wk.length && !vbDates.size;

  const review: WeeklyReview = {
    weekStart,
    weekEnd,
    dates,
    daysElapsed: elapsed.length,
    inProgress,
    empty,
    sleep,
    training,
    volleyball,
    restDays,
    soreness,
    fatigue,
    energy,
    recommendations: [],
  };
  review.recommendations = recommend(review);
  return review;
}

/** 1–3 suggestions for the next week, most important first. Never punitive. */
export function recommend(r: WeeklyReview): WeeklyRecommendation[] {
  if (r.empty || r.daysElapsed === 0) return [];
  const out: WeeklyRecommendation[] = [];
  const { sleep, training, soreness, fatigue } = r;

  if (
    sleep.nights < Math.min(3, r.daysElapsed) ||
    (r.daysElapsed >= 5 && sleep.nights < 4)
  ) {
    out.push({
      key: "log",
      title: "Check in each morning",
      reason: `${sleep.nights} of ${r.daysElapsed} ${r.daysElapsed === 1 ? "night" : "nights"} logged, so this review is partial.`,
    });
  }

  const high = (s: RatingSummary) => s.avg != null && s.n >= 2 && s.avg >= 3.5;
  const rising = (s: RatingSummary) => s.trend === "up" && (s.avg ?? 0) >= 3;
  const prevHigh = (s: RatingSummary) => s.prevAvg != null && s.prevAvg >= 3.5;
  const strained = [soreness, fatigue].find((s) => high(s) || rising(s));
  if (strained) {
    const which = strained === soreness ? "Soreness" : "Fatigue";
    const tail =
      strained.prevAvg != null && strained.trend === "up"
        ? ` (up from ${strained.prevAvg})`
        : "";
    if (high(strained) && prevHigh(strained)) {
      out.push({
        key: "deload",
        title: "Consider a deload week",
        reason: `${which} averaged ${strained.avg}/5 two weeks running. Lighter loads let it come back down.`,
      });
    } else {
      out.push({
        key: "lighter",
        title: "Plan a lighter week",
        reason: `${which} averaged ${strained.avg}/5${tail}. Drop one set per exercise and keep RIR 2–3.`,
      });
    }
  }

  if (sleep.avg != null && sleep.nights >= 2 && sleep.avg < sleep.goal - 0.5) {
    out.push({
      key: "sleep",
      title: `Protect sleep: aim for ${formatHours(sleep.goal)} h`,
      reason: `Averaged ${formatHours(Math.round(sleep.avg * 4) / 4)} h; ${sleep.nightsAtGoal} of ${sleep.nights} ${sleep.nights === 1 ? "night" : "nights"} at goal.`,
    });
  }

  if (sleep.sd != null && sleep.nights >= 3 && sleep.sd > 1) {
    out.push({
      key: "consistency",
      title: "Keep sleep times steady",
      reason: `Nightly sleep varied by ±${sleep.sd.toFixed(1)} h. Fixed bed and wake times help.`,
    });
  }

  if (r.volleyball.sessions >= 3) {
    out.push({
      key: "volleyball",
      title: "Keep jumps optional after volleyball",
      reason: `${r.volleyball.sessions} volleyball sessions this week on top of training.`,
    });
  }

  const missed =
    (r.inProgress ? training.plannedSoFar : training.planned) - training.done;
  if (missed >= 2) {
    out.push({
      key: "schedule",
      title: "Fit sessions to the week",
      reason: `${training.done} of ${r.inProgress ? training.plannedSoFar : training.planned} planned sessions done. Move a session instead of doubling up.`,
    });
  }

  if (!r.inProgress && r.restDays === 0) {
    out.push({
      key: "rest",
      title: "Keep one full rest day",
      reason: "Every day had training or volleyball this week.",
    });
  }

  if (
    training.volumeChange != null &&
    training.volumeChange >= 0.25 &&
    (fatigue.trend === "up" || soreness.trend === "up")
  ) {
    out.push({
      key: "volume",
      title: "Hold volume steady",
      reason: `Volume rose ${Math.round(training.volumeChange * 100)}% while ${fatigue.trend === "up" ? "fatigue" : "soreness"} climbed.`,
    });
  }

  if (!out.length) {
    out.push({
      key: "keep",
      title: r.inProgress ? "Stay the course" : "Keep the same plan",
      reason: "Sleep, soreness and training are all on track.",
    });
  }
  return out.slice(0, 3);
}
