// Step timers for the recipe screen and cooking mode. Pure (unit-tested): a timer is plain data
// (an end time while running, the seconds left while paused) and every reading is derived from
// the clock, so a timer survives navigation, a reload or the phone sleeping.

export interface CookTimer {
  /** `${recipeKey}#${stepIndex}`: one timer per step. */
  id: string;
  recipeKey: string;
  step: number; // 0-based step index
  label: string; // "Step 2 · Brown the beef"
  totalSec: number;
  /** Epoch ms when it rings (running), null while paused. */
  endAt: number | null;
  /** Seconds left while paused. */
  pausedLeft: number | null;
  /** Epoch ms when the alarm was dismissed (a finished timer stays listed until then). */
  dismissedAt?: number | null;
  /** Epoch ms when the alarm went off (so it rings once). */
  rangAt?: number | null;
}

export const MAX_TIMER_SEC = 4 * 3600;

export const timerId = (recipeKey: string, step: number) => `${recipeKey}#${step}`;

export function startTimer(input: { recipeKey: string; step: number; label: string; totalSec: number }, now: number): CookTimer {
  const total = Math.min(MAX_TIMER_SEC, Math.max(1, Math.round(input.totalSec)));
  return { id: timerId(input.recipeKey, input.step), recipeKey: input.recipeKey, step: input.step, label: input.label, totalSec: total, endAt: now + total * 1000, pausedLeft: null, dismissedAt: null, rangAt: null };
}

/** Whole seconds left (rounded up, so "0:01" shows until it's really done), never below 0. */
export function timeLeft(t: CookTimer, now: number): number {
  if (t.endAt == null) return Math.max(0, Math.round(t.pausedLeft ?? t.totalSec));
  return Math.max(0, Math.ceil((t.endAt - now) / 1000 - 1e-9));
}

export const isRunning = (t: CookTimer) => t.endAt != null;
export const isDone = (t: CookTimer, now: number) => timeLeft(t, now) === 0;
/** Finished and not yet acknowledged: the alarm state. */
export const isRinging = (t: CookTimer, now: number) => isDone(t, now) && !t.dismissedAt;

export function pauseTimer(t: CookTimer, now: number): CookTimer {
  if (t.endAt == null) return t;
  return { ...t, endAt: null, pausedLeft: timeLeft(t, now) };
}

export function resumeTimer(t: CookTimer, now: number): CookTimer {
  if (t.endAt != null) return t;
  const left = t.pausedLeft ?? t.totalSec;
  if (left <= 0) return t;
  return { ...t, endAt: now + left * 1000, pausedLeft: null };
}

/** +1 min / −30 s. Never below 0 s left; a finished timer given more time runs again. */
export function addTime(t: CookTimer, sec: number, now: number): CookTimer {
  const left = Math.min(MAX_TIMER_SEC, Math.max(0, timeLeft(t, now) + sec));
  const totalSec = Math.min(MAX_TIMER_SEC, Math.max(t.totalSec, left));
  if (t.endAt == null) return { ...t, pausedLeft: left, totalSec, dismissedAt: left > 0 ? null : t.dismissedAt, rangAt: left > 0 ? null : t.rangAt };
  return { ...t, endAt: now + left * 1000, totalSec, dismissedAt: left > 0 ? null : t.dismissedAt, rangAt: left > 0 ? null : t.rangAt };
}

/** 0 → 1 share of the timer that has elapsed (for a progress ring). */
export function timerProgress(t: CookTimer, now: number): number {
  if (t.totalSec <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - timeLeft(t, now) / t.totalSec));
}

/** "9:59", "1:02:03", "0:05". */
export function clockText(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** Spoken / chip length: "10 min", "1 h 5 min", "45 sec", "1 min 30 sec". */
export function durationText(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} sec`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return m ? `${h} h ${m} min` : `${h} h`;
  return r ? `${m} min ${r} sec` : `${m} min`;
}

/** Timers worth showing: running, paused, or finished within the last 10 minutes and not dismissed. */
export function visibleTimers(all: readonly CookTimer[], now: number): CookTimer[] {
  return all.filter((t) => {
    if (t.dismissedAt) return false;
    if (!isDone(t, now)) return true;
    const doneAt = t.endAt ?? now;
    return now - doneAt < 10 * 60_000;
  });
}

/** Keep stored timers sane: drop malformed rows and anything finished over an hour ago. */
export function sanitizeTimers(raw: unknown, now: number): CookTimer[] {
  if (!Array.isArray(raw)) return [];
  const out: CookTimer[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const t = x as Partial<CookTimer>;
    if (typeof t.id !== "string" || typeof t.recipeKey !== "string" || typeof t.step !== "number" || typeof t.totalSec !== "number") continue;
    const timer: CookTimer = {
      id: t.id,
      recipeKey: t.recipeKey,
      step: t.step,
      label: typeof t.label === "string" ? t.label.slice(0, 120) : `Step ${t.step + 1}`,
      totalSec: Math.min(MAX_TIMER_SEC, Math.max(1, t.totalSec)),
      endAt: typeof t.endAt === "number" ? t.endAt : null,
      pausedLeft: typeof t.pausedLeft === "number" ? t.pausedLeft : null,
      dismissedAt: typeof t.dismissedAt === "number" ? t.dismissedAt : null,
      rangAt: typeof t.rangAt === "number" ? t.rangAt : null,
    };
    if (timer.endAt == null && timer.pausedLeft == null) continue;
    if (timer.endAt != null && now - timer.endAt > 3600_000) continue;
    if (timer.dismissedAt && now - timer.dismissedAt > 60_000) continue;
    out.push(timer);
  }
  return out;
}
