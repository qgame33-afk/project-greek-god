// The block strip on Train → Week (DESIGN-V2 §3.4.1 item 2). Pure.
//
// The app has no fixed mesocycle, so the strip never draws a plan. It shows what happened: one
// segment per week since the last deload week (or the programme start), each hard week filled,
// the current week outlined, and the RULE that deloadAdvice() applies: a deload is due after
// DELOAD_WINDOW hard weeks in a row. The hard-week count here is the same number deloadAdvice()
// reports (tested against it).

import { addDays, weekStart, type ISODate } from "@/lib/dates";

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
