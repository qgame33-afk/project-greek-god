// The block strip on Train → Week, and lighter-week advice (PROGRAM-ARNOLD §4.3). Pure.
//
// The app has no fixed mesocycle, so the strip never draws a plan. It shows what happened: one
// segment per week since the last deload week (or the programme start), each hard week filled,
// the current week outlined, and the RULE that deloadAdvice() applies: a deload is due after
// DELOAD_WINDOW hard weeks in a row. The hard-week count here is the same number deloadAdvice()
// reports (tested against it).

import { addDays, weekStart, type ISODate } from "@/lib/dates";
import { e1rm, groupSessions, type Mode, type PastSet } from "./progression";
import { deloadAdvice } from "./schedule";

/** Completed non-deload sessions that make a week "hard" (deloadAdvice's default). */
export const HARD_WEEK_SESSIONS = 4;
/** Hard weeks in a row after which deloadAdvice() suggests a lighter week. */
export const DELOAD_WINDOW = 5;
/** Most segments drawn; older weeks of a very long block are left off (and said so). */
export const BLOCK_MAX_WEEKS = 12;

export type BlockWeekState = "hard" | "light" | "deload" | "open";

export interface BlockWeek {
  start: ISODate;
  /** Completed sessions that week. */
  sessions: number;
  /**
   * hard: ≥ HARD_WEEK_SESSIONS completed, none in deload mode · light: a past week with fewer ·
   * deload: a deload session that week, or deload mode is on for the current week ·
   * open: the current week, not hard yet.
   */
  state: BlockWeekState;
  current: boolean;
}

export interface Block {
  weeks: BlockWeek[];
  /** Where the block starts: the week after the last deload, the programme start, or the edge of the loaded history. */
  since: { kind: "deload" | "start" | "history"; week: ISODate };
  /** Weeks before the shown ones that belong to the block but were left off (BLOCK_MAX_WEEKS). */
  hidden: number;
  /** Consecutive hard weeks up to now (the current week counts once it is hard). Equals deloadAdvice().hardWeeks. */
  hardWeeks: number;
  /** Index in `weeks` of hard week DELOAD_WINDOW of the current streak, or null when it is still ahead (or off the strip). */
  windowIndex: number | null;
  /** Hard weeks still to go before the deload window (0 once reached). */
  weeksToWindow: number;
  /** Deload mode is on, or this week already has a deload session. */
  deloading: boolean;
}

export function blockStrip({
  sessions,
  today,
  programStart,
  historyFrom,
  mode,
}: {
  sessions: { local_date: ISODate; status: string; mode?: string | null }[];
  today: ISODate;
  programStart?: ISODate | null;
  /** First date `sessions` covers; a block reaching it is cut there. */
  historyFrom?: ISODate | null;
  mode: string;
}): Block {
  const current = weekStart(today);
  const byWeek = new Map<ISODate, { n: number; deload: boolean }>();
  for (const s of sessions) {
    if (s.status !== "done" || s.local_date > today) continue;
    const w = weekStart(s.local_date);
    const e = byWeek.get(w) ?? { n: 0, deload: false };
    e.n += 1;
    if (s.mode === "deload") e.deload = true;
    byWeek.set(w, e);
  }

  // The block starts after the most recent past deload week, else at the programme start,
  // else at the edge of the loaded history.
  const startWeek = programStart && programStart <= today ? weekStart(programStart) : null;
  const edge = historyFrom ? weekStart(historyFrom) : null;
  let since: Block["since"] | null = null;
  for (let w = addDays(current, -7); ; w = addDays(w, -7)) {
    if ((startWeek && w < startWeek) || (edge && w < edge) || w < addDays(current, -7 * 104)) break;
    if (byWeek.get(w)?.deload) {
      since = { kind: "deload", week: addDays(w, 7) };
      break;
    }
  }
  if (!since) {
    if (startWeek && (!edge || startWeek >= edge)) since = { kind: "start", week: startWeek };
    else if (edge) since = { kind: "history", week: edge };
    else since = { kind: "start", week: current };
  }
  if (since.week > current) since = { ...since, week: current };

  const curRow = byWeek.get(current);
  const deloading = mode === "deload" || !!curRow?.deload;

  const all: BlockWeek[] = [];
  for (let w = since.week; w <= current; w = addDays(w, 7)) {
    const e = byWeek.get(w);
    const isCur = w === current;
    const hard = !!e && !e.deload && e.n >= HARD_WEEK_SESSIONS;
    const state: BlockWeekState = isCur && deloading ? "deload" : e?.deload ? "deload" : hard ? "hard" : isCur ? "open" : "light";
    all.push({ start: w, sessions: e?.n ?? 0, state, current: isCur });
  }

  // The streak deloadAdvice() counts: the current week once hard, then back to the first non-hard week.
  let hardWeeks = 0;
  const last = all.length - 1;
  const curHard = all[last].state === "hard";
  if (all[last].state === "deload") hardWeeks = 0;
  else {
    let i = curHard ? last : last - 1;
    while (i >= 0 && all[i].state === "hard") {
      hardWeeks++;
      i--;
    }
    // A streak that runs into the history edge continues in weeks we did not load, like deloadAdvice's "at least".
  }

  // Where hard week DELOAD_WINDOW of this streak falls (the current week is the next one when not hard yet).
  const streakStart = all[last].state === "deload" ? null : (curHard ? last + 1 : last) - hardWeeks;
  const windowAt = streakStart == null ? null : streakStart + DELOAD_WINDOW - 1;
  const weeksToWindow = windowAt == null ? 0 : Math.max(0, DELOAD_WINDOW - hardWeeks);

  const hidden = Math.max(0, all.length - BLOCK_MAX_WEEKS);
  const weeks = all.slice(hidden);
  const shifted = windowAt == null ? null : windowAt - hidden;
  const windowIndex = shifted != null && shifted >= 0 && shifted <= weeks.length - 1 && weeksToWindow === 0 ? shifted : null;

  return { weeks, since, hidden, hardWeeks, windowIndex, weeksToWindow, deloading };
}

/** Programme week number of `today` (week 1 is the week the programme started), or null without a start. */
export function programWeek(programStart: ISODate | null | undefined, today: ISODate): number | null {
  if (!programStart || programStart > today) return null;
  const a = new Date(`${weekStart(programStart)}T12:00:00Z`).getTime();
  const b = new Date(`${weekStart(today)}T12:00:00Z`).getTime();
  return Math.round((b - a) / (7 * 86_400_000)) + 1;
}

/* ============================================================ lighter weeks */
/* docs/PROGRAM-ARNOLD.md §4.3: suggest a lighter or deload week from what was logged. Never automatic. */

export interface LighterWeekAdvice {
  /** What to suggest; null = nothing. */
  kind: "deload" | "lighter" | "standard" | null;
  /** 1–3 short factual lines, numbers first. */
  reasons: string[];
  signals: {
    streak: number | null;
    fatigue: number | null;
    soreness: number | null;
    sleep: number | null;
    performance: { dips: number; compared: number } | null;
    adherence: number | null;
  };
}

export interface LighterWeekInput {
  today: ISODate;
  mode: Mode;
  /** prefs.modeSetAt */
  modeSetAt: ISODate | null;
  /** prefs.lighterSnoozedUntil */
  snoozedUntil: ISODate | null;
  /** 8 weeks of sessions. */
  sessions: { local_date: ISODate; status: string; mode?: string | null; template_key?: string | null }[];
  /** 14 days of check-ins. */
  checkins: { local_date: ISODate; sleep_hours: number | string | null; soreness: number | null; fatigue: number | null }[];
  sleepGoalH: number;
  /** Per slug, newest first, with completed_at (performance dips). */
  history: Record<string, PastSet[]>;
  /** The last 2 complete weeks. */
  plannedByWeek: { weekStart: ISODate; planned: number; done: number }[];
  /** profiles.start_date (the first date the history can cover). */
  historyFrom: ISODate | null;
}

export const LIGHTER = { high: 4, highCount: 3, checkins: 7, sleepNights: 4, sleepShortH: 1.5, dipLifts: 3, dipShare: 0.4, missed: 2, strain: 3.5, returnDays: 7, cooldownDays: 14, minWeeks: 3, snoozeDays: 7 } as const;

const fmtH = (h: number) => `${Math.round(h * 100) / 100} h`;

/** Average gap between consecutive logged sets of one session (seconds), ignoring breaks over 15 min. */
function avgRest(sets: PastSet[]): number | null {
  const ts = sets
    .map((s) => (s.completed_at ? Date.parse(s.completed_at) : Number.NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) {
    const g = (ts[i] - ts[i - 1]) / 1000;
    if (g <= 15 * 60) gaps.push(g);
  }
  return gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
}

/**
 * Lifts whose latest real session (within 10 days) fell below the one before it: same top
 * load (±0.1 lb) with 2+ fewer total reps over the matched sets, or a lower top load with a
 * best e1RM 3%+ lower. A comparison is skipped when the latest session rested 45 s+ less
 * between sets on average (the drop is the rest, not fatigue).
 */
export function performanceDips(history: Record<string, PastSet[]>, today: ISODate): { dips: number; compared: number; lifts: string[] } {
  let dips = 0;
  let compared = 0;
  const lifts: string[] = [];
  for (const [slug, sets] of Object.entries(history)) {
    const real = groupSessions(sets.filter((s) => s.local_date <= today)).filter((s) => s[0]?.mode !== "deload");
    const [latest, prev] = real;
    if (!latest || !prev || latest[0].local_date < addDays(today, -10)) continue;
    const idx = latest.map((s) => s.set_index).filter((i) => prev.some((p) => p.set_index === i));
    if (!idx.length) continue;
    const pick = (ss: PastSet[]) => idx.map((i) => ss.find((s) => s.set_index === i)!);
    const a = pick(latest);
    const b = pick(prev);
    const ra = avgRest(latest);
    const rb = avgRest(prev);
    if (ra != null && rb != null && rb - ra >= 45) continue;
    compared++;
    const top = (ss: PastSet[]) => Math.max(0, ...ss.map((s) => Number(s.weight_lb ?? 0)));
    const reps = (ss: PastSet[]) => ss.reduce((n, s) => n + Number(s.reps ?? 0), 0);
    const best = (ss: PastSet[]) => Math.max(0, ...ss.map((s) => e1rm(Number(s.weight_lb ?? 0), Number(s.reps ?? 0)) ?? 0));
    const ta = top(a);
    const tb = top(b);
    const dip = Math.abs(ta - tb) <= 0.1 ? reps(b) - reps(a) >= 2 : ta < tb && best(b) > 0 && best(a) <= best(b) * 0.97;
    if (dip) {
      dips++;
      lifts.push(slug);
    }
  }
  return { dips, compared, lifts };
}

export function lighterWeekAdvice(input: LighterWeekInput): LighterWeekAdvice {
  const { today, mode } = input;
  const nums = (k: "soreness" | "fatigue") => recent.map((c) => c[k]).filter((v): v is number => v != null);
  const recent = [...input.checkins].filter((c) => c.local_date <= today && c.local_date > addDays(today, -14)).sort((a, b) => b.local_date.localeCompare(a.local_date)).slice(0, LIGHTER.checkins);

  const streak = deloadAdvice({ sessions: input.sessions.map((s) => ({ ...s, template_key: s.template_key ?? null })), recovery: [], today, mode, historyFrom: input.historyFrom }).hardWeeks;
  const highOf = (k: "soreness" | "fatigue") => nums(k).filter((v) => v >= LIGHTER.high).length;
  const fatigueN = nums("fatigue").length ? highOf("fatigue") : null;
  const sorenessN = nums("soreness").length ? highOf("soreness") : null;
  const nights = recent.filter((c) => c.local_date > addDays(today, -7)).map((c) => (c.sleep_hours == null || c.sleep_hours === "" ? null : Number(c.sleep_hours))).filter((v): v is number => v != null && Number.isFinite(v));
  const sleepAvg = nights.length >= LIGHTER.sleepNights ? nights.reduce((a, b) => a + b, 0) / nights.length : null;
  const perf = performanceDips(input.history, today);
  const weeks = input.plannedByWeek.slice(-2);
  const shortfall = weeks.length ? Math.min(...weeks.map((w) => w.planned - w.done)) : null;

  const signals: LighterWeekAdvice["signals"] = {
    streak,
    fatigue: fatigueN,
    soreness: sorenessN,
    sleep: sleepAvg == null ? null : Math.round(sleepAvg * 100) / 100,
    performance: perf.compared ? { dips: perf.dips, compared: perf.compared } : null,
    adherence: shortfall,
  };
  const none = (): LighterWeekAdvice => ({ kind: null, reasons: [], signals });

  if (input.snoozedUntil && today <= input.snoozedUntil) return none();

  const fires = {
    streak: streak >= DELOAD_WINDOW,
    fatigue: (fatigueN ?? 0) >= LIGHTER.highCount,
    soreness: (sorenessN ?? 0) >= LIGHTER.highCount,
    sleep: sleepAvg != null && sleepAvg < input.sleepGoalH - LIGHTER.sleepShortH,
    performance: perf.dips >= LIGHTER.dipLifts && perf.compared > 0 && perf.dips / perf.compared >= LIGHTER.dipShare,
    adherence: weeks.length === 2 && weeks.every((w) => w.planned - w.done >= LIGHTER.missed),
  };
  const reasons: string[] = [];
  if (fires.streak) reasons.push(`${streak} hard weeks in a row.`);
  if (fires.fatigue) reasons.push(`Tiredness 4 of 5 or higher on ${fatigueN} of your last ${nums("fatigue").length} check-ins.`);
  if (fires.soreness) reasons.push(`Soreness 4 of 5 or higher on ${sorenessN} of your last ${nums("soreness").length} check-ins.`);
  if (fires.sleep) reasons.push(`Sleep averaged ${fmtH(sleepAvg!)} against ${fmtH(input.sleepGoalH).replace(/ h$/, "")}.`);
  if (fires.performance) reasons.push(`Reps dropped on ${perf.dips} of ${perf.compared} lifts at the same weight.`);
  const strained = (() => {
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return avg(nums("soreness")) >= LIGHTER.strain || avg(nums("fatigue")) >= LIGHTER.strain;
  })();
  if (fires.adherence && strained) reasons.push(`${Math.min(...weeks.map((w) => w.planned - w.done))}+ planned workouts missed in each of the last 2 weeks.`);

  const strain4 = [fires.fatigue, fires.soreness, fires.sleep, fires.performance].filter(Boolean).length;
  const setAt = input.modeSetAt ?? input.historyFrom;
  const back = (mode === "intro" || mode === "deload") && !!setAt && addDays(setAt, LIGHTER.returnDays) <= today;

  if (mode === "deload") return back ? { kind: "standard", reasons: [], signals } : none();

  // gates for a deload or lighter suggestion
  const cooled = (() => {
    const deloadWeeks = input.sessions.filter((s) => s.status === "done" && s.mode === "deload" && s.local_date <= today).map((s) => weekStart(s.local_date));
    if (!deloadWeeks.length) return true;
    const last = deloadWeeks.sort().at(-1)!;
    return addDays(last, 6 + LIGHTER.cooldownDays) < today;
  })();
  const enoughHistory = !input.historyFrom || addDays(input.historyFrom, 7 * LIGHTER.minWeeks) <= today;
  const gated = !cooled || !enoughHistory;

  if (!gated && (fires.streak || strain4 >= 2)) return { kind: "deload", reasons: reasons.slice(0, 3), signals };
  if (mode === "intro") return back && strain4 === 0 ? { kind: "standard", reasons: [], signals } : none();
  if (!gated && (strain4 === 1 || (fires.adherence && strained))) return { kind: "lighter", reasons: reasons.slice(0, 3), signals };
  return none();
}
