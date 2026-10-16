// Reminder scheduling (SPEC §20). Pure: given the user's settings, their timezone, the
// current instant and today's facts, decide which reminders are due right now. The
// dispatcher runs every 15 minutes; a reminder is due in the run whose window contains
// its local time, is skipped when the task is already done, and never more than 3 a day.

import { addMonths, monthLabel, shortDate, type ISODate } from "@/lib/dates";

export type ReminderKind = "workout" | "food" | "hydration" | "sleep" | "weighin" | "photos" | "review";

export interface DailySetting {
  on: boolean;
  time: string; // "HH:MM" local
}
export interface WeeklySetting extends DailySetting {
  day: number; // 0 = Sunday … 6 = Saturday
}
export interface MonthlySetting extends DailySetting {
  day: number; // 1–28 day of month
}

export interface ReminderSettings {
  workout: DailySetting;
  food: DailySetting;
  hydration: DailySetting;
  sleep: DailySetting;
  weighin: WeeklySetting;
  photos: MonthlySetting;
  /** fires on the 1st, when last month's review is complete */
  review: DailySetting;
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  workout: { on: false, time: "17:00" },
  food: { on: false, time: "20:00" },
  hydration: { on: false, time: "15:00" },
  sleep: { on: false, time: "22:00" },
  weighin: { on: false, day: 0, time: "08:00" },
  photos: { on: false, day: 1, time: "08:00" },
  review: { on: false, time: "19:00" },
};

/** Order of importance when more than 3 fall on one day. */
export const REMINDER_ORDER: ReminderKind[] = ["workout", "food", "weighin", "hydration", "review", "photos", "sleep"];
export const MAX_PER_DAY = 3;
export const WINDOW_MIN = 15;

export const REMINDER_META: Record<ReminderKind, { label: string; caption: string; cadence: "daily" | "weekly" | "monthly" }> = {
  workout: { label: "Scheduled workout", caption: "On training days, unless you've already trained.", cadence: "daily" },
  food: { label: "Food logging", caption: "Skipped once the day's meals are logged.", cadence: "daily" },
  hydration: { label: "Hydration", caption: "Skipped once you reach your water goal.", cadence: "daily" },
  sleep: { label: "Sleep routine", caption: "A wind-down nudge before lights out.", cadence: "daily" },
  weighin: { label: "Weekly weigh-in", caption: "Skipped if you've already weighed in that day.", cadence: "weekly" },
  photos: { label: "Monthly progress photos", caption: "Skipped if you took photos in the last 2 weeks.", cadence: "monthly" },
  review: { label: "Monthly review", caption: "On the 1st, when last month's review is ready.", cadence: "monthly" },
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function readDaily(raw: unknown, d: DailySetting): DailySetting {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { on: o.on === true, time: typeof o.time === "string" && TIME_RE.test(o.time) ? o.time : d.time };
}

/** Coerce whatever is stored in profile.reminders into complete, valid settings (everything off by default). */
export function normalizeSettings(raw: unknown): ReminderSettings {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_REMINDERS;
  const wk = readDaily(o.weighin, d.weighin);
  const ph = readDaily(o.photos, d.photos);
  const wDay = Number((o.weighin as Record<string, unknown> | undefined)?.day);
  const pDay = Number((o.photos as Record<string, unknown> | undefined)?.day);
  return {
    workout: readDaily(o.workout, d.workout),
    food: readDaily(o.food, d.food),
    hydration: readDaily(o.hydration, d.hydration),
    sleep: readDaily(o.sleep, d.sleep),
    weighin: { ...wk, day: Number.isInteger(wDay) && wDay >= 0 && wDay <= 6 ? wDay : d.weighin.day },
    photos: { ...ph, day: Number.isInteger(pDay) && pDay >= 1 && pDay <= 28 ? pDay : d.photos.day },
    review: readDaily(o.review, d.review),
  };
}

export function anyOn(s: ReminderSettings) {
  return (Object.keys(s) as ReminderKind[]).some((k) => s[k].on);
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface LocalParts {
  date: ISODate;
  minutes: number; // minutes since local midnight
  weekday: number; // 0 = Sunday
  day: number; // day of month
}

/** The wall-clock date and time at `now` in `timeZone` (falls back to UTC if invalid). */
export function localParts(now: Date, timeZone: string): LocalParts {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")),
    weekday: WD.indexOf(get("weekday")),
    day: Number(get("day")),
  };
}

const toMinutes = (t: string) => {
  const m = TIME_RE.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};

/** Reminder kinds whose scheduled local time falls in this run's window (time only, no facts). */
export function dueByTime(s: ReminderSettings, p: LocalParts, windowMin = WINDOW_MIN): ReminderKind[] {
  const inWindow = (time: string) => {
    const t = toMinutes(time);
    const diff = p.minutes - t;
    return t >= 0 && diff >= 0 && diff < windowMin;
  };
  return REMINDER_ORDER.filter((k) => {
    const r = s[k];
    if (!r.on || !inWindow(r.time)) return false;
    if (k === "weighin") return p.weekday === s.weighin.day;
    if (k === "photos") return p.day === s.photos.day;
    if (k === "review") return p.day === 1;
    return true;
  });
}

/** What the dispatcher knows about the user's day (loaded only when something is due). */
export interface ReminderFacts {
  /** today's planned session, or null on a rest day */
  plannedWorkout: { name: string; exercises: number; minutes: number | null } | null;
  workoutDone: boolean;
  mealsLogged: number; // distinct meal slots with food today
  caloriesToday: number;
  calorieGoal: number;
  waterMl: number;
  waterGoalMl: number;
  weighedInToday: boolean;
  weighInsThisWeek: number;
  lastPhotoDate: ISODate | null;
  /** a saved snapshot exists for last month */
  lastMonthReviewSaved: boolean;
  sleepGoalH: number;
}

export interface Notice {
  kind: ReminderKind;
  /** stable per-day key: reminder_deliveries(user_id, reminder, due_key) dedupes on it */
  dueKey: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const liters = (ml: number) => `${(ml / 1000).toFixed(1)} L`;

/** Days between two ISO dates (b − a), DST-safe. */
function dayDiff(a: ISODate, b: ISODate) {
  const t = (d: ISODate) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** Builds the notification for one reminder, or null when its task is already done. */
export function buildNotice(kind: ReminderKind, date: ISODate, f: ReminderFacts): Notice | null {
  const base = { kind, dueKey: date, tag: `pgg-${kind}` };
  switch (kind) {
    case "workout": {
      if (!f.plannedWorkout || f.workoutDone) return null;
      const w = f.plannedWorkout;
      const parts = [`${w.exercises} exercise${w.exercises === 1 ? "" : "s"}`, w.minutes ? `about ${w.minutes} min` : null].filter(Boolean);
      return { ...base, title: `${w.name} today`, body: `${parts.join(" · ")}. Open the app when you're at the gym.`, url: "/" };
    }
    case "food": {
      if (f.mealsLogged >= 3 || (f.calorieGoal > 0 && f.caloriesToday >= f.calorieGoal * 0.85)) return null;
      const body =
        f.mealsLogged === 0
          ? `Nothing logged yet today. Your target is ${fmtInt(f.calorieGoal)} kcal.`
          : `${f.mealsLogged} meal${f.mealsLogged === 1 ? "" : "s"} logged · ${fmtInt(f.caloriesToday)} of ${fmtInt(f.calorieGoal)} kcal. Add the rest while you remember.`;
      return { ...base, title: "Log today's food", body, url: "/nutrition?add=1" };
    }
    case "hydration": {
      if (f.waterGoalMl > 0 && f.waterMl >= f.waterGoalMl) return null;
      return { ...base, title: "Water check", body: `${liters(f.waterMl)} of ${liters(f.waterGoalMl)} so far today.`, url: "/recovery" };
    }
    case "sleep": {
      return { ...base, title: "Wind down", body: `Screens down soon. Lights out in the next 30 minutes keeps you on track for ${f.sleepGoalH} h.`, url: "/recovery" };
    }
    case "weighin": {
      if (f.weighedInToday) return null;
      const n = f.weighInsThisWeek;
      return {
        ...base,
        title: "Weekly weigh-in",
        body: `Before breakfast, after the bathroom. ${n} weigh-in${n === 1 ? "" : "s"} logged this week.`,
        url: "/progress?tab=weight&log=1",
      };
    }
    case "photos": {
      if (f.lastPhotoDate && dayDiff(f.lastPhotoDate, date) < 14) return null;
      const last = f.lastPhotoDate ? ` Last set: ${shortDate(f.lastPhotoDate, date)}.` : "";
      return { ...base, title: "Progress photos", body: `Front, side and back in the same light as last time.${last}`, url: "/progress?tab=photos" };
    }
    case "review": {
      if (f.lastMonthReviewSaved) return null;
      const last = addMonths(date, -1);
      const name = monthLabel(last).split(" ")[0];
      return {
        ...base,
        title: `${name} review is ready`,
        body: `Your month in numbers, plus 2–3 priorities for ${monthLabel(date).split(" ")[0]}.`,
        url: `/reviews/${last.slice(0, 7)}`,
      };
    }
  }
}

export interface EvaluateInput {
  settings: unknown;
  timeZone: string;
  now: Date;
  facts: ReminderFacts;
  /** reminder kinds already delivered on this local date */
  sentToday: string[];
  windowMin?: number;
}

/** The full decision: which notifications to send now (≤ 3 per local day, none twice). */
export function evaluateReminders({ settings, timeZone, now, facts, sentToday, windowMin }: EvaluateInput): Notice[] {
  const s = normalizeSettings(settings);
  const p = localParts(now, timeZone);
  const sent = new Set(sentToday);
  let budget = MAX_PER_DAY - sent.size;
  const out: Notice[] = [];
  for (const kind of dueByTime(s, p, windowMin)) {
    if (budget <= 0) break;
    if (sent.has(kind)) continue;
    const n = buildNotice(kind, p.date, facts);
    if (!n) continue;
    out.push(n);
    budget--;
  }
  return out;
}
