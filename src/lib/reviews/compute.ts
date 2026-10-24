// Monthly Transformation Review (SPEC §19). Pure functions over the user's real rows:
// nothing here invents a value. Every metric is null when the data behind it is missing,
// and every priority cites the numbers that triggered it.

import { addDays, addMonths, dateRange, daysBetween, monthEnd, monthLabel, monthStart, shortDate, weekday, weekStart, type ISODate } from "@/lib/dates";
import { defaultMilestone, parseRoadmap } from "@/lib/progress/months";
import { EARLY_WATER_DAYS, rateAt } from "@/lib/progress/pace";
import { formatDelta, formatBodyweight, formatInt, round, type WeightUnit } from "@/lib/units";
import { planContext, plannedKey, scheduleFrom } from "./plan";

/* ------------------------------------------------------------------ input */

type Num = number | string | null | undefined;

export interface ReviewProfile {
  start_date: ISODate;
  start_weight_lb: Num;
  goal_weight_lb: Num;
  target_date: ISODate;
  calorie_goal: number;
  protein_goal: number;
  sleep_goal_h: Num;
  water_goal_ml: number;
  weekly_schedule: unknown;
  /** profiles.prefs: decides the active program for the plan (PROGRAM-ARNOLD §2.4). */
  prefs?: unknown;
  roadmap?: unknown;
}

export interface MeasurementLite {
  local_date: ISODate;
  biceps_flexed_in?: Num;
  forearm_in?: Num;
  chest_in?: Num;
  shoulders_in?: Num;
  waist_in?: Num;
  hips_in?: Num;
  thigh_in?: Num;
  calf_in?: Num;
  body_fat_pct?: Num;
}

export interface ReviewRows {
  /** all weigh-ins (any range; filtered here) */
  weights: { local_date: ISODate; weight_lb: Num }[];
  /** all measurements (latest-through-month needs history) */
  measurements: MeasurementLite[];
  /** all progress photos */
  photos: { id: string; local_date: ISODate; pose: string; storage_path: string }[];
  sessions: { id: string; local_date: ISODate; status: string; name?: string | null; duration_sec?: number | null }[];
  /** completed working sets (set_history view) */
  sets: { local_date: ISODate | null; exercise_slug: string | null; exercise_name: string | null; weight_lb: Num; reps: number | null; e1rm_lb: Num; session_id?: string | null }[];
  /** pr_events view */
  prs: { local_date: ISODate | null; exercise_slug: string | null; exercise_name: string | null; weight_lb: Num; reps: number | null; e1rm_lb: Num; prior_best_e1rm: Num }[];
  /** daily_nutrition view */
  nutrition: { local_date: ISODate | null; calories: Num; protein_g: Num; carbs_g: Num; fat_g: Num; entries: number | null }[];
  /** daily_water view */
  water: { local_date: ISODate | null; total_ml: number | null }[];
  recovery: {
    local_date: ISODate;
    sleep_hours: Num;
    sleep_quality: number | null;
    energy: number | null;
    soreness: number | null;
    fatigue: number | null;
    stress: number | null;
    pain_notes?: string | null;
  }[];
  plans: { plan_date: ISODate; template_key: string; note?: string | null }[];
}

/* ----------------------------------------------------------------- output */

export interface MeasurementChange {
  key: MeasurementKey;
  label: string;
  value: number;
  previous: number | null;
  change: number | null;
  /** larger is the goal (arms, chest…); waist/hips/body fat never count as "good" growth */
  growthIsGood: boolean;
}

export interface LiftChange {
  slug: string;
  name: string;
  sessions: number;
  startE1rm: number;
  endE1rm: number;
  change: number;
  changePct: number;
  main: boolean;
  stalled: boolean;
}

export interface WeekTraining {
  weekStart: ISODate;
  planned: number;
  /** planned training days that have a completed session */
  done: number;
  /** sessions on rest days, or a second session on one day */
  extra: number;
}

export interface WeekNutrition {
  weekStart: ISODate;
  days: number;
  avgCalories: number | null;
  avgProtein: number | null;
}

export interface ReviewStats {
  /** bumped whenever the maths changes, so older snapshots aren't mistaken for edited logs */
  version: 2;
  month: ISODate;
  label: string;
  window: {
    from: ISODate;
    to: ISODate;
    days: number;
    complete: boolean;
    /** 1-based month of the programme, and how many months it spans */
    monthIndex: number;
    monthsTotal: number;
    /** month is before the programme started or entirely in the future */
    outOfRange: "before" | "future" | null;
  };
  milestone: { title: string; detail: string } | null;
  physical: {
    startWeight: number | null;
    goalWeight: number | null;
    monthStartAvg: number | null;
    monthStartDate: ISODate | null;
    monthEndAvg: number | null;
    monthEndDate: ISODate | null;
    change: number | null;
    /** first to last weigh-in in the window */
    spanDays: number;
    /** days between the mean dates of the start and end 7-day windows (what `change` spans) */
    gapDays: number;
    /**
     * THE rate at the review's last day (pace.rateAt: the 28-day least-squares slope every
     * screen shows), lb a week; null until it has 4 weigh-ins over 10 days. Not derived from
     * `change`: the month figure is a change, never a rate (DESIGN-V2 §4.1.1).
     */
    ratePerWeek: number | null;
    /** Weigh-ins and first→last span behind ratePerWeek (absent on snapshots saved before v2). */
    rateWeighIns?: number;
    rateSpanDays?: number;
    /** The month overlaps the programme's first 14 days (water and glycogen). */
    earlyWater?: boolean;
    plannedRatePerWeek: number | null;
    plannedChange: number | null;
    fromStart: number | null;
    toGoal: number | null;
    weighIns: number;
    low: number | null;
    high: number | null;
    measurements: {
      date: ISODate | null;
      previousDate: ISODate | null;
      updatedThisMonth: boolean;
      fields: MeasurementChange[];
    };
    photos: { count: number; dates: ISODate[]; poses: string[]; items: { id: string; local_date: ISODate; pose: string; storage_path: string }[] };
  };
  training: {
    sessions: number;
    planned: number;
    /** planned training days with a completed session (adherence counts only these) */
    plannedDone: number;
    /** sessions that weren't on a planned training day */
    extraSessions: number;
    adherencePct: number | null;
    /** planned-but-missed training days by JS weekday (0 = Sunday) */
    missedByWeekday: number[];
    workingSets: number;
    volumeLb: number;
    avgSessionMin: number | null;
    prs: { count: number; items: { slug: string; name: string; date: ISODate; weight: number | null; reps: number | null; e1rm: number; gain: number | null }[] };
    lifts: LiftChange[];
    stalled: LiftChange[];
    weeks: WeekTraining[];
  };
  nutrition: {
    daysLogged: number;
    daysInWindow: number;
    avgCalories: number | null;
    avgProtein: number | null;
    avgCarbs: number | null;
    avgFat: number | null;
    calorieTarget: number;
    proteinTarget: number;
    calorieHitDays: number;
    proteinHitDays: number;
    weeks: WeekNutrition[];
    trend: "up" | "down" | "flat" | null;
    trendDelta: number | null;
    /** the two weeks the trend compares (first and last with 3+ logged days) */
    trendFrom: ISODate | null;
    trendTo: ISODate | null;
    waterAvgMl: number | null;
    waterDays: number;
    waterGoalDays: number;
    waterGoalMl: number;
  };
  recovery: {
    checkIns: number;
    sleepNights: number;
    avgSleep: number | null;
    sleepGoal: number;
    nightsAtGoal: number;
    avgQuality: number | null;
    avgEnergy: number | null;
    avgSoreness: number | null;
    avgFatigue: number | null;
    avgStress: number | null;
    painDays: number;
    /** @deprecated never computed (no volleyball); saved reviews that still hold it are not rendered. */
    volleyballDays?: number;
    consistency: { weeksOnPlan: number; weeks: number; avgSessionsPerWeek: number | null };
  };
}

export type PriorityArea = "physical" | "training" | "nutrition" | "recovery" | "logging";

export interface Priority {
  id: string;
  area: PriorityArea;
  title: string;
  detail: string;
  /** the recorded numbers behind the suggestion, shown as chips */
  evidence: string[];
  action?: { label: string; href: string };
  score: number;
}

/* ---------------------------------------------------------------- helpers */

const num = (v: Num): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n: number | null) => (n == null ? null : round(n, 1));
const r2 = (n: number | null) => (n == null ? null : round(n, 2));
const inWin = (d: ISODate | null | undefined, from: ISODate, to: ISODate): d is ISODate => !!d && d >= from && d <= to;

export const MEASUREMENT_FIELDS = [
  { key: "biceps_flexed_in", label: "Biceps (flexed)", growthIsGood: true },
  { key: "forearm_in", label: "Forearms", growthIsGood: true },
  { key: "chest_in", label: "Chest", growthIsGood: true },
  { key: "shoulders_in", label: "Shoulders", growthIsGood: true },
  { key: "waist_in", label: "Waist", growthIsGood: false },
  { key: "hips_in", label: "Hips", growthIsGood: false },
  { key: "thigh_in", label: "Thighs", growthIsGood: true },
  { key: "calf_in", label: "Calves", growthIsGood: true },
  { key: "body_fat_pct", label: "Body fat (est.)", growthIsGood: false },
] as const;
export type MeasurementKey = (typeof MEASUREMENT_FIELDS)[number]["key"];

/** The big lifts SPEC §15 names first; they lead the strength list and the stall check. */
export const MAIN_LIFTS = [
  "barbell-bench-press",
  "incline-db-press",
  "back-squat",
  "romanian-deadlift",
  "weighted-pull-up",
  "pull-up",
  "overhead-press",
  "seated-db-shoulder-press",
  "barbell-row",
  "chest-supported-row",
  "preacher-curl",
  "leg-press",
  "hack-squat",
  "incline-smith-press",
];

const WEEKDAY_PLURAL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** "2026-09" or "2026-09-14" → "2026-09-01"; null when malformed. */
export function parseMonthParam(p: string | null | undefined): ISODate | null {
  if (!p) return null;
  const m = /^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/.exec(p.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}

/** Months from the programme start month to the month containing `today`, oldest first. */
export function reviewMonths(startDate: ISODate, today: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const last = monthStart(today);
  for (let m = monthStart(startDate); m <= last && out.length < 240; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Whole months from a's month to b's month (b − a). */
function monthDiff(a: ISODate, b: ISODate) {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
}

/**
 * Roadmap milestone for a month, resolved exactly as the Roadmap tab does it
 * (src/lib/progress/months.ts): the user's edit for that month's offset first, else the
 * built-in milestone for that position in a programme of this length.
 */
export function milestoneFor(month: ISODate, profile: Pick<ReviewProfile, "start_date" | "target_date" | "roadmap">): { title: string; detail: string } | null {
  const n = Math.max(1, monthDiff(profile.start_date, profile.target_date) + 1);
  const offset = monthDiff(profile.start_date, month);
  if (offset < 0 || offset >= n) return null;
  const o = parseRoadmap(profile.roadmap).find((x) => x.offset === offset);
  const d = defaultMilestone(offset, n);
  const title = o?.title || d?.title || "";
  if (!title) return null;
  return { title, detail: o?.detail ?? d?.detail ?? "" };
}

type WeighIn = { local_date: ISODate; weight_lb: number };

/* ------------------------------------------------------------- the review */

export interface ComputeOptions {
  month: ISODate; // any date in the month
  today: ISODate;
  profile: ReviewProfile;
  rows: ReviewRows;
}

export function computeReview({ month: anyDay, today, profile, rows }: ComputeOptions): ReviewStats {
  const month = monthStart(anyDay);
  const mEnd = monthEnd(month);
  const start = profile.start_date;
  const complete = mEnd < today;
  const from = start > month ? start : month;
  const to = complete ? mEnd : today < mEnd ? today : mEnd;
  const outOfRange: ReviewStats["window"]["outOfRange"] = mEnd < start ? "before" : month > today ? "future" : null;
  const days = outOfRange ? 0 : Math.max(0, daysBetween(from, to) + 1);
  const monthsTotal = Math.max(1, monthDiff(start, profile.target_date) + 1);
  const monthIndex = monthDiff(start, month) + 1;

  const startWeight = num(profile.start_weight_lb);
  const goalWeight = num(profile.goal_weight_lb);
  const calorieTarget = profile.calorie_goal;
  const proteinTarget = profile.protein_goal;
  const sleepGoal = num(profile.sleep_goal_h) ?? 8;

  /* -------- physical: weight */
  const allW = rows.weights
    .map((w) => ({ local_date: w.local_date, weight_lb: num(w.weight_lb) }))
    .filter((w): w is { local_date: ISODate; weight_lb: number } => w.weight_lb != null)
    .sort((a, b) => a.local_date.localeCompare(b.local_date));
  const wIn = outOfRange ? [] : allW.filter((w) => inWin(w.local_date, from, to));
  const firstW = wIn[0] ?? null;
  const lastW = wIn.at(-1) ?? null;
  // 7-day averages at each end of the month. An average stands for the mean date of the
  // weigh-ins in it, so the change between them spans the distance between those dates,
  // not first-to-last weigh-in (which would understate the weekly rate).
  const startWin: WeighIn[] = firstW ? wIn.filter((w) => w.local_date <= addDays(firstW.local_date, 6)) : [];
  const endWin: WeighIn[] = lastW ? wIn.filter((w) => w.local_date >= addDays(lastW.local_date, -6)) : [];
  const monthStartAvg = mean(startWin.map((w) => w.weight_lb));
  const monthEndAvg = mean(endWin.map((w) => w.weight_lb));
  const centre = (ws: WeighIn[]) => mean(ws.map((w) => daysBetween(from, w.local_date))) ?? 0;
  const gapDays = startWin.length && endWin.length ? centre(endWin) - centre(startWin) : 0;
  const spanDays = firstW && lastW ? daysBetween(firstW.local_date, lastW.local_date) : 0;
  // the two averages must sit at least a week apart before a change means anything
  const change = monthStartAvg != null && monthEndAvg != null && gapDays >= 7 ? monthEndAvg - monthStartAvg : null;
  const rate = outOfRange ? null : rateAt(allW, to, start);
  const ratePerWeek = rate?.status === "ok" ? rate.lbPerWeek : null;
  const earlyWater = !outOfRange && from <= addDays(start, EARLY_WATER_DAYS - 1) && to >= start;
  const programmeDays = daysBetween(start, profile.target_date);
  const plannedRatePerWeek = startWeight != null && goalWeight != null && programmeDays > 0 ? ((goalWeight - startWeight) / programmeDays) * 7 : null;
  const plannedChange = plannedRatePerWeek != null && change != null ? (plannedRatePerWeek * gapDays) / 7 : null;
  const trendNow = monthEndAvg;

  /* -------- physical: measurements (latest through the month vs the one before it) */
  const meas = [...rows.measurements].sort((a, b) => a.local_date.localeCompare(b.local_date));
  const through = outOfRange === "future" ? [] : meas.filter((m) => m.local_date <= to);
  const latest = through.at(-1) ?? null;
  const updatedThisMonth = !!latest && latest.local_date >= from;
  const before = latest ? through.filter((m) => m.local_date < (updatedThisMonth ? from : latest.local_date)) : [];
  // compare against the last entry before this month; if the month holds the first ever
  // entries, compare the month's first entry to its latest
  let prev: MeasurementLite | null = before.at(-1) ?? null;
  if (!prev && updatedThisMonth) {
    const inMonth = through.filter((m) => m.local_date >= from);
    prev = inMonth.length > 1 ? inMonth[0] : null;
  }
  const fields: MeasurementChange[] = [];
  if (latest) {
    for (const f of MEASUREMENT_FIELDS) {
      const v = num(latest[f.key]);
      if (v == null) continue;
      const p = prev ? num(prev[f.key]) : null;
      fields.push({ key: f.key, label: f.label, value: v, previous: p, change: p == null ? null : round(v - p, 2), growthIsGood: f.growthIsGood });
    }
  }

  /* -------- physical: photos */
  const photosIn = outOfRange ? [] : rows.photos.filter((p) => inWin(p.local_date, from, to)).sort((a, b) => a.local_date.localeCompare(b.local_date));

  /* -------- training: plan vs done */
  const schedule = scheduleFrom(profile.weekly_schedule, profile.prefs);
  const planCtx = planContext(profile.weekly_schedule, profile.prefs);
  const overrides = new Map(rows.plans.map((p) => [p.plan_date, { template_key: p.template_key, note: p.note ?? null }]));
  const done = outOfRange ? [] : rows.sessions.filter((s) => s.status === "done" && inWin(s.local_date, from, to));
  const doneDates = new Set(done.map((s) => s.local_date));
  let planned = 0;
  let plannedDone = 0;
  const missedByWeekday = [0, 0, 0, 0, 0, 0, 0];
  const weekMap = new Map<ISODate, WeekTraining>();
  for (const d of outOfRange ? [] : dateRange(from, to)) {
    const ws = weekStart(d);
    const wk = weekMap.get(ws) ?? { weekStart: ws, planned: 0, done: 0, extra: 0 };
    weekMap.set(ws, wk);
    const isTraining = plannedKey(d, schedule, overrides, planCtx) !== "rest";
    // today only counts once it's done — the day isn't over yet
    if (isTraining && !(d === today && !doneDates.has(d))) {
      planned++;
      wk.planned++;
      if (doneDates.has(d)) {
        plannedDone++;
        wk.done++;
      } else missedByWeekday[weekday(d)]++;
    }
  }
  // anything beyond one session per planned day is extra: it doesn't make up a missed day
  const perWeek = new Map<ISODate, number>();
  for (const s of done) perWeek.set(weekStart(s.local_date), (perWeek.get(weekStart(s.local_date)) ?? 0) + 1);
  for (const wk of weekMap.values()) wk.extra = Math.max(0, (perWeek.get(wk.weekStart) ?? 0) - wk.done);
  const weeks = [...weekMap.values()];
  const extraSessions = done.length - plannedDone;
  const adherencePct = planned > 0 ? Math.round((plannedDone / planned) * 100) : null;
  const durations = done.map((s) => s.duration_sec ?? 0).filter((x) => x > 0);
  const avgSessionMin = durations.length ? Math.round((mean(durations) ?? 0) / 60) : null;

  /* -------- training: sets, volume, lifts */
  const setsIn = outOfRange ? [] : rows.sets.filter((s) => inWin(s.local_date, from, to));
  const volumeLb = Math.round(setsIn.reduce((a, s) => a + (num(s.weight_lb) ?? 0) * (s.reps ?? 0), 0));
  const bySlug = new Map<string, { name: string; perDate: Map<ISODate, number> }>();
  for (const s of setsIn) {
    const e = num(s.e1rm_lb);
    if (e == null || !s.exercise_slug || !s.local_date) continue;
    const ex = bySlug.get(s.exercise_slug) ?? { name: s.exercise_name ?? s.exercise_slug, perDate: new Map() };
    ex.perDate.set(s.local_date, Math.max(ex.perDate.get(s.local_date) ?? 0, e));
    bySlug.set(s.exercise_slug, ex);
  }
  const lifts: LiftChange[] = [];
  for (const [slug, ex] of bySlug) {
    const dates = [...ex.perDate.keys()].sort();
    if (dates.length < 2) continue;
    const s0 = ex.perDate.get(dates[0])!;
    const s1 = ex.perDate.get(dates.at(-1)!)!;
    const best = Math.max(...ex.perDate.values());
    const main = MAIN_LIFTS.includes(slug);
    lifts.push({
      slug,
      name: ex.name,
      sessions: dates.length,
      startE1rm: round(s0, 1),
      endE1rm: round(s1, 1),
      change: round(s1 - s0, 1),
      changePct: s0 > 0 ? round(((s1 - s0) / s0) * 100, 1) : 0,
      main,
      // stalled: 3+ exposures and the month's best never beat the first session
      stalled: dates.length >= 3 && best <= s0,
    });
  }
  lifts.sort((a, b) => Number(b.main) - Number(a.main) || (a.main ? MAIN_LIFTS.indexOf(a.slug) - MAIN_LIFTS.indexOf(b.slug) : b.sessions - a.sessions));
  const stalled = lifts.filter((l) => l.stalled && l.main);

  /* -------- training: PRs (best per exercise) */
  const prIn = outOfRange ? [] : rows.prs.filter((p) => inWin(p.local_date, from, to));
  const prBest = new Map<string, ReviewStats["training"]["prs"]["items"][number]>();
  for (const p of prIn) {
    const e = num(p.e1rm_lb);
    if (e == null || !p.exercise_slug) continue;
    const cur = prBest.get(p.exercise_slug);
    if (!cur || e > cur.e1rm) {
      prBest.set(p.exercise_slug, { slug: p.exercise_slug, name: p.exercise_name ?? p.exercise_slug, date: p.local_date!, weight: num(p.weight_lb), reps: p.reps, e1rm: round(e, 1), gain: null });
    }
  }
  // gain = month's best PR vs the best before the month's first PR on that lift
  for (const [slug, item] of prBest) {
    const firstPrior = prIn.filter((p) => p.exercise_slug === slug).sort((a, b) => (a.local_date ?? "").localeCompare(b.local_date ?? ""))[0];
    const base = num(firstPrior?.prior_best_e1rm);
    item.gain = base == null ? null : round(item.e1rm - base, 1);
  }
  const prItems = [...prBest.values()].sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0));

  /* -------- nutrition (averages over LOGGED days only) */
  const nIn = outOfRange ? [] : rows.nutrition.filter((r) => inWin(r.local_date, from, to) && ((r.entries ?? 0) > 0 || (num(r.calories) ?? 0) > 0));
  const cals = nIn.map((r) => num(r.calories) ?? 0);
  const prot = nIn.map((r) => num(r.protein_g) ?? 0);
  const nWeeks = new Map<ISODate, { c: number[]; p: number[] }>();
  for (const r of nIn) {
    const k = weekStart(r.local_date!);
    const w = nWeeks.get(k) ?? { c: [], p: [] };
    w.c.push(num(r.calories) ?? 0);
    w.p.push(num(r.protein_g) ?? 0);
    nWeeks.set(k, w);
  }
  const nutritionWeeks: WeekNutrition[] = weeks.map((wk) => {
    const w = nWeeks.get(wk.weekStart);
    return { weekStart: wk.weekStart, days: w?.c.length ?? 0, avgCalories: w ? Math.round(mean(w.c)!) : null, avgProtein: w ? Math.round(mean(w.p)!) : null };
  });
  const solid = nutritionWeeks.filter((w) => w.days >= 3 && w.avgCalories != null);
  let trend: ReviewStats["nutrition"]["trend"] = null;
  let trendDelta: number | null = null;
  let trendFrom: ISODate | null = null;
  let trendTo: ISODate | null = null;
  if (solid.length >= 2) {
    trendFrom = solid[0].weekStart;
    trendTo = solid.at(-1)!.weekStart;
    trendDelta = solid.at(-1)!.avgCalories! - solid[0].avgCalories!;
    trend = trendDelta > 100 ? "up" : trendDelta < -100 ? "down" : "flat";
  }
  const wtrIn = outOfRange ? [] : rows.water.filter((r) => inWin(r.local_date, from, to) && (r.total_ml ?? 0) > 0);

  /* -------- recovery */
  const recIn = outOfRange ? [] : rows.recovery.filter((r) => inWin(r.local_date, from, to));
  const sleeps = recIn.map((r) => num(r.sleep_hours)).filter((x): x is number => x != null);
  const avgOf = (k: "sleep_quality" | "energy" | "soreness" | "fatigue" | "stress") => r1(mean(recIn.map((r) => r[k]).filter((x): x is number => x != null)));
  const plannedWeeks = weeks.filter((w) => w.planned > 0);
  const weeksOnPlan = plannedWeeks.filter((w) => w.done / w.planned >= 0.8).length;

  return {
    version: 2,
    month,
    label: monthLabel(month),
    window: { from, to, days, complete, monthIndex, monthsTotal, outOfRange },
    milestone: milestoneFor(month, profile),
    physical: {
      startWeight,
      goalWeight,
      monthStartAvg: r1(monthStartAvg),
      monthStartDate: firstW?.local_date ?? null,
      monthEndAvg: r1(monthEndAvg),
      monthEndDate: lastW?.local_date ?? null,
      change: r1(change),
      spanDays,
      gapDays: r1(gapDays) ?? 0,
      ratePerWeek: r2(ratePerWeek),
      rateWeighIns: rate?.n ?? 0,
      rateSpanDays: rate?.spanDays ?? 0,
      earlyWater,
      plannedRatePerWeek: r2(plannedRatePerWeek),
      plannedChange: r1(plannedChange),
      fromStart: trendNow != null && startWeight != null ? r1(trendNow - startWeight) : null,
      toGoal: trendNow != null && goalWeight != null ? r1(goalWeight - trendNow) : null,
      weighIns: wIn.length,
      low: wIn.length ? Math.min(...wIn.map((w) => w.weight_lb)) : null,
      high: wIn.length ? Math.max(...wIn.map((w) => w.weight_lb)) : null,
      measurements: { date: latest?.local_date ?? null, previousDate: prev?.local_date ?? null, updatedThisMonth, fields },
      photos: { count: photosIn.length, dates: [...new Set(photosIn.map((p) => p.local_date))], poses: [...new Set(photosIn.map((p) => p.pose))], items: photosIn.slice(-6) },
    },
    training: {
      sessions: done.length,
      planned,
      plannedDone,
      extraSessions,
      adherencePct,
      missedByWeekday,
      workingSets: setsIn.length,
      volumeLb,
      avgSessionMin,
      prs: { count: prIn.length, items: prItems },
      lifts: lifts.slice(0, 6),
      stalled,
      weeks,
    },
    nutrition: {
      daysLogged: nIn.length,
      daysInWindow: days,
      avgCalories: cals.length ? Math.round(mean(cals)!) : null,
      avgProtein: prot.length ? Math.round(mean(prot)!) : null,
      avgCarbs: nIn.length ? Math.round(mean(nIn.map((r) => num(r.carbs_g) ?? 0))!) : null,
      avgFat: nIn.length ? Math.round(mean(nIn.map((r) => num(r.fat_g) ?? 0))!) : null,
      calorieTarget,
      proteinTarget,
      calorieHitDays: cals.filter((c) => c >= calorieTarget * 0.9 && c <= calorieTarget * 1.1).length,
      proteinHitDays: prot.filter((p) => p >= proteinTarget).length,
      weeks: nutritionWeeks,
      trend,
      trendDelta,
      trendFrom,
      trendTo,
      waterAvgMl: wtrIn.length ? Math.round(mean(wtrIn.map((r) => r.total_ml ?? 0))!) : null,
      waterDays: wtrIn.length,
      waterGoalDays: wtrIn.filter((r) => (r.total_ml ?? 0) >= profile.water_goal_ml).length,
      waterGoalMl: profile.water_goal_ml,
    },
    recovery: {
      checkIns: recIn.length,
      sleepNights: sleeps.length,
      avgSleep: r1(mean(sleeps)),
      sleepGoal,
      nightsAtGoal: sleeps.filter((h) => h >= sleepGoal).length,
      avgQuality: avgOf("sleep_quality"),
      avgEnergy: avgOf("energy"),
      avgSoreness: avgOf("soreness"),
      avgFatigue: avgOf("fatigue"),
      avgStress: avgOf("stress"),
      painDays: recIn.filter((r) => r.pain_notes && r.pain_notes.trim()).length,
      consistency: {
        weeksOnPlan,
        weeks: plannedWeeks.length,
        avgSessionsPerWeek: days >= 7 ? round((done.length / days) * 7, 1) : null,
      },
    },
  };
}

/* ------------------------------------------------------------ priorities */

const kcal = (n: number) => `${formatInt(n)} kcal`;
const rate = (lbPerWeek: number, unit: WeightUnit) => `${formatDelta(lbPerWeek, unit, 2)}/wk`;

/**
 * 2–3 next-month adjustments from the recorded numbers. Rule-based and explainable:
 * each one quotes its evidence. Calorie ideas are suggestions only — nothing is applied.
 */
export function computePriorities(s: ReviewStats, unit: WeightUnit = "lb"): Priority[] {
  const out = candidatePriorities(s, unit);
  // top 3, at most 2 from one area
  const picked: Priority[] = [];
  const perArea: Record<string, number> = {};
  for (const x of out) {
    if (picked.length >= 3) break;
    if ((perArea[x.area] ?? 0) >= 2) continue;
    perArea[x.area] = (perArea[x.area] ?? 0) + 1;
    picked.push(x);
  }
  return picked;
}

/** Every rule that fires, strongest first (computePriorities keeps the top 3). */
export function candidatePriorities(s: ReviewStats, unit: WeightUnit = "lb"): Priority[] {
  if (s.window.outOfRange || s.window.days === 0) return [];
  const out: Priority[] = [];
  const p = s.physical;
  const n = s.nutrition;
  const t = s.training;
  const r = s.recovery;
  const nextMonth = monthLabel(addMonths(s.month, 1)).split(" ")[0];

  // ---- bodyweight trend vs plan (needs ~2 weeks of weigh-ins)
  // the one rate (28 days to the review's end), with the calorie rule's evidence bar
  const rateN = p.rateWeighIns ?? p.weighIns;
  if (p.ratePerWeek != null && p.plannedRatePerWeek != null && (p.rateSpanDays ?? p.spanDays) >= 13 && rateN >= 6 && p.plannedRatePerWeek > 0) {
    const plan = p.plannedRatePerWeek;
    const ev = [`Pace ${rate(p.ratePerWeek, unit)}`, `Plan ${rate(plan, unit)}`, `${rateN} weigh-ins in 4 weeks`];
    const underEating = n.avgCalories != null && n.daysLogged >= 10 && n.avgCalories < n.calorieTarget * 0.92;
    if (p.ratePerWeek < plan * 0.5) {
      if (underEating) {
        out.push({
          id: "eat-to-target",
          area: "nutrition",
          title: "Eat to your current target first",
          detail: `Logged days averaged ${kcal(n.avgCalories!)} against your ${kcal(n.calorieTarget)} target, and your pace over the last 4 weeks was ${rate(p.ratePerWeek, unit)} against ${rate(plan, unit)} planned. Closing that ${formatInt(n.calorieTarget - n.avgCalories!)} kcal gap comes before any target change.`,
          evidence: [...ev, `${kcal(n.avgCalories!)} avg`],
          action: { label: "Open nutrition", href: "/nutrition" },
          score: 9,
        });
      } else {
        const delta = p.ratePerWeek < plan * 0.25 ? 150 : 100;
        out.push({
          id: "calories-up",
          area: "nutrition",
          title: `Consider +${delta} kcal a day`,
          detail: `Your pace over the last 4 weeks was ${rate(p.ratePerWeek, unit)} against ${rate(plan, unit)} planned. A modest ${delta} kcal increase, about one extra snack, is the usual next step. Your target only changes if you confirm it.`,
          evidence: n.avgCalories != null ? [...ev, `${kcal(n.avgCalories)} avg`] : ev,
          action: { label: "Review targets", href: "/progress?tab=weight" },
          score: 9,
        });
      }
    } else if (p.ratePerWeek > Math.max(plan * 2, plan + 0.5)) {
      out.push({
        id: "calories-down",
        area: "nutrition",
        title: "Ease the surplus slightly",
        detail: `You gained ${rate(p.ratePerWeek, unit)} against ${rate(plan, unit)} planned. Faster than this mostly adds fat. Consider about 100–150 kcal less per day and re-check in two weeks.${p.earlyWater ? " Your first two weeks include water and glycogen, so part of this is not tissue." : ""}`,
        evidence: ev,
        action: { label: "Review targets", href: "/progress?tab=weight" },
        score: 8,
      });
    } else {
      const ahead = p.ratePerWeek > plan * 1.6;
      out.push({
        id: "hold-course",
        area: "physical",
        title: "Hold the course",
        detail: ahead
          ? `Your pace over the last 4 weeks (${rate(p.ratePerWeek, unit)}) is a little ahead of the plan (${rate(plan, unit)}). Keep intake where it is. If it stays above ${rate(plan * 2, unit)} for two more weeks, trim about 100 kcal a day.`
          : `Your pace over the last 4 weeks (${rate(p.ratePerWeek, unit)}) is in line with the plan (${rate(plan, unit)}). Keep intake where it is and re-check after two more weeks of weigh-ins.`,
        evidence: ev,
        score: 1,
      });
    }
  } else if (s.window.days >= 14 && p.weighIns < 8) {
    out.push({
      id: "weigh-in",
      area: "logging",
      title: "Weigh in 4 mornings a week",
      detail: `${p.weighIns} weigh-in${p.weighIns === 1 ? "" : "s"} in ${s.window.days} days, so the trend can't be read yet. Same scale, after the bathroom, before food.`,
      evidence: [`${p.weighIns} weigh-ins`, `${s.window.days} days`],
      action: { label: "Log weight", href: "/progress?tab=weight&log=1" },
      score: 6,
    });
  }

  // ---- protein
  if (n.avgProtein != null && n.daysLogged >= 5 && n.avgProtein < n.proteinTarget * 0.9) {
    const gap = n.proteinTarget - n.avgProtein;
    out.push({
      id: "protein",
      area: "nutrition",
      title: `Close the ${gap} g protein gap`,
      detail: `Logged days averaged ${n.avgProtein} g against ${n.proteinTarget} g. Add one ${gap > 45 ? "40–50" : "30–40"} g serving a day: Greek yogurt at breakfast, a shake after training, or an extra palm of chicken or fish at dinner.`,
      evidence: [`${n.avgProtein} g avg`, `${n.proteinTarget} g target`, `Hit on ${n.proteinHitDays} of ${n.daysLogged} days`],
      action: { label: "Open nutrition", href: "/nutrition" },
      score: 6 + Math.min(2, gap / Math.max(1, n.proteinTarget) / 0.1),
    });
  }

  // ---- adherence
  if (t.planned >= 4 && t.sessions === 0) {
    // nothing logged at all: a schedule tweak would be guesswork, so start with one session
    out.push({
      id: "first-session",
      area: "training",
      title: "Log one session this week",
      detail: `No sessions were logged against ${t.planned} planned training days. Start the next planned session from Today, even cut to its first three exercises. Logged sessions are what this review, your records and your progress are built from.`,
      evidence: [`0/${t.planned} planned days`],
      action: { label: "Open training", href: "/training" },
      score: 9,
    });
  } else if (t.adherencePct != null && t.planned >= 4 && t.adherencePct < 80) {
    const max = Math.max(...t.missedByWeekday);
    const day = max >= 2 && t.missedByWeekday.filter((x) => x === max).length === 1 ? t.missedByWeekday.indexOf(max) : -1;
    const done = `You trained on ${t.plannedDone} of ${t.planned} planned days (${t.adherencePct}%)`;
    const extra = t.extraSessions > 0 ? `, plus ${t.extraSessions} session${t.extraSessions === 1 ? "" : "s"} on rest days` : "";
    out.push({
      id: "adherence",
      area: "training",
      title: "Make the schedule fit your week",
      detail:
        day >= 0
          ? `${done}${extra}. Most misses fell on ${WEEKDAY_PLURAL[day]} (${max}). Move that session to a day you reliably train, or make it a rest day.`
          : t.extraSessions > 0
            ? `${done}${extra}. When a day doesn't work, move the session in the plan so the week still adds up.`
            : `${done}. Shorten the session you skip most to its first three exercises rather than missing it.`,
      evidence: [`${t.plannedDone}/${t.planned} planned days`, `${t.adherencePct}% adherence`, ...(day >= 0 ? [`${max} ${WEEKDAY_PLURAL[day]} missed`] : []), ...(t.extraSessions > 0 ? [`${t.extraSessions} extra`] : [])],
      action: { label: "Adjust schedule", href: "/training" },
      score: 7 + (80 - t.adherencePct) / 20,
    });
  }

  // ---- sleep
  if (r.avgSleep != null && r.sleepNights >= 5 && r.avgSleep < r.sleepGoal - 0.25) {
    out.push({
      id: "sleep",
      area: "recovery",
      title: "Protect 30 more minutes of sleep",
      detail: `Sleep averaged ${r.avgSleep} h against your ${r.sleepGoal} h goal, reaching it on ${r.nightsAtGoal} of ${r.sleepNights} nights. Set a fixed lights-out time and turn on the sleep reminder.`,
      evidence: [`${r.avgSleep} h avg`, `${r.sleepGoal} h goal`, `${r.nightsAtGoal}/${r.sleepNights} nights`],
      action: { label: "Reminders", href: "/settings#reminders" },
      score: 5 + Math.min(2, (r.sleepGoal - r.avgSleep) / 0.5),
    });
  }

  // ---- fatigue / soreness (subjective, never a diagnosis)
  if (r.checkIns >= 5 && ((r.avgFatigue ?? 0) >= 3.5 || (r.avgSoreness ?? 0) >= 3.8)) {
    const fatigued = (r.avgFatigue ?? 0) >= 3.5;
    const label = fatigued ? "Fatigue" : "Soreness";
    const value = fatigued ? r.avgFatigue : r.avgSoreness;
    out.push({
      id: "deload",
      area: "recovery",
      title: "Plan a lighter week",
      detail: `${label} averaged ${value} / 5 over ${r.checkIns} check-ins. A deload week (same lifts, about half the sets) usually restores performance. If pain is sharp or lasting, get it checked.`,
      evidence: [`${label} ${value} / 5`, `${r.checkIns} check-ins`],
      action: { label: "Recovery", href: "/recovery" },
      score: 6,
    });
  }

  // ---- stalled main lifts
  if (t.stalled.length) {
    const l = t.stalled[0];
    const more = t.stalled.length > 1 ? ` ${t.stalled.length - 1} other main lift${t.stalled.length > 2 ? "s" : ""} also held flat.` : "";
    out.push({
      id: "stalled",
      area: "training",
      title: `Restart ${l.name} progress`,
      detail: `Estimated 1RM went ${formatBodyweight(l.startE1rm, unit)} → ${formatBodyweight(l.endE1rm, unit)} over ${l.sessions} sessions.${more} Film a set to check technique, add one set a week, or hold the load and chase reps before adding weight.`,
      evidence: [`${l.name} e1RM ${formatDelta(l.change, unit)}`, `${l.sessions} sessions`],
      action: { label: "Exercise history", href: `/training/exercise/${l.slug}` },
      score: 5,
    });
  }

  // ---- logging coverage
  if (s.window.days >= 7 && n.daysLogged < s.window.days * 0.5) {
    out.push({
      id: "log-food",
      area: "logging",
      title: "Log food on more days",
      detail: `${n.daysLogged} of ${s.window.days} days have food logged. Averages from more days make these reviews, and every calorie suggestion, more accurate.`,
      evidence: [`${n.daysLogged}/${s.window.days} days logged`],
      action: { label: "Log food", href: "/nutrition?add=1" },
      score: n.daysLogged < s.window.days * 0.25 ? 8 : 4,
    });
  }

  // ---- monthly photos / measurements (complete months only)
  if (s.window.complete && (p.photos.count === 0 || !p.measurements.updatedThisMonth)) {
    const missing = [p.photos.count === 0 && "photos", !p.measurements.updatedThisMonth && "measurements"].filter(Boolean).join(" and ");
    out.push({
      id: "check-in-photos",
      area: "physical",
      title: `Take ${nextMonth} ${missing}`,
      detail: `No ${missing} were logged this month. Front, side and back in the same light every 2–4 weeks make changes visible that the scale can't show.`,
      evidence: [`${p.photos.count} photos`, p.measurements.updatedThisMonth ? "Measured this month" : "Not measured this month"],
      action: { label: "Open progress", href: p.photos.count === 0 ? "/progress?tab=photos" : "/progress?tab=body" },
      score: 2,
    });
  }

  return out.sort((a, b) => b.score - a.score).map((x) => ({ ...x, score: round(x.score, 2) }));
}

/* ------------------------------------------------------------ weight chart */

export interface MonthWeightSeries {
  from: ISODate;
  to: ISODate;
  /** weigh-ins inside the window */
  points: { date: ISODate; weight: number }[];
  /** rolling 7-day average on each weigh-in date in the window (earlier weigh-ins count) */
  avg: { date: ISODate; weight: number }[];
  /** the programme's straight-line plan across the window, when start and goal are set */
  plan: { from: number; to: number } | null;
}

/** Everything the review's bodyweight chart draws, from logged weigh-ins only. */
export function monthWeightSeries(
  weights: ReviewRows["weights"],
  window: Pick<ReviewStats["window"], "from" | "to" | "outOfRange">,
  profile: Pick<ReviewProfile, "start_date" | "target_date" | "start_weight_lb" | "goal_weight_lb">,
): MonthWeightSeries {
  const { from, to } = window;
  const all = weights
    .map((w) => ({ local_date: w.local_date, weight_lb: num(w.weight_lb) }))
    .filter((w): w is WeighIn => w.weight_lb != null && w.local_date <= to)
    .sort((a, b) => a.local_date.localeCompare(b.local_date));
  if (window.outOfRange) return { from, to, points: [], avg: [], plan: null };
  const inWindow = all.filter((w) => w.local_date >= from);
  const avg = inWindow.map((w) => {
    const lo = addDays(w.local_date, -6);
    return { date: w.local_date, weight: round(mean(all.filter((x) => x.local_date >= lo && x.local_date <= w.local_date).map((x) => x.weight_lb))!, 2) };
  });
  const s = num(profile.start_weight_lb);
  const g = num(profile.goal_weight_lb);
  const total = daysBetween(profile.start_date, profile.target_date);
  const at = (d: ISODate) => s! + (g! - s!) * Math.min(1, Math.max(0, daysBetween(profile.start_date, d) / total));
  return {
    from,
    to,
    points: inWindow.map((w) => ({ date: w.local_date, weight: w.weight_lb })),
    avg,
    plan: s != null && g != null && total > 0 ? { from: round(at(from), 2), to: round(at(to), 2) } : null,
  };
}

/* ------------------------------------------------------------ headline */

/** One line of the month's numbers, for the placard and the reviews list. */
export function headline(s: ReviewStats, unit: WeightUnit = "lb"): string[] {
  const parts: string[] = [];
  const t = s.training;
  if (t.planned > 0) parts.push(`${t.plannedDone}/${t.planned} sessions${t.extraSessions ? ` +${t.extraSessions}` : ""}`);
  else if (t.sessions > 0) parts.push(`${t.sessions} session${t.sessions === 1 ? "" : "s"}`);
  if (s.physical.change != null) parts.push(formatDelta(s.physical.change, unit));
  if (s.nutrition.avgProtein != null) parts.push(`${s.nutrition.avgProtein} g protein`);
  if (s.recovery.avgSleep != null) parts.push(`${s.recovery.avgSleep} h sleep`);
  return parts;
}

/* -------------------------------------------------------- AI digest */

/**
 * The only data the AI summary sees: computed numbers and short labels. No raw logs,
 * no notes, no photos.
 */
export function aiDigest(s: ReviewStats, priorities: Priority[], unit: WeightUnit = "lb") {
  const w = (lb: number | null) => (lb == null ? null : unit === "kg" ? round(lb / 2.2046226218, 1) : round(lb, 1));
  return {
    month: s.label,
    status: s.window.complete ? "complete" : `in progress through ${shortDate(s.window.to, s.window.to)}`,
    daysCovered: s.window.days,
    monthOfProgramme: `${s.window.monthIndex} of ${s.window.monthsTotal}`,
    milestone: s.milestone?.title ?? null,
    unit,
    bodyweight: {
      startOfMonthAvg: w(s.physical.monthStartAvg),
      endOfMonthAvg: w(s.physical.monthEndAvg),
      change: w(s.physical.change),
      ratePerWeek: w(s.physical.ratePerWeek),
      plannedRatePerWeek: w(s.physical.plannedRatePerWeek),
      sinceProgrammeStart: w(s.physical.fromStart),
      toGoal: w(s.physical.toGoal),
      weighIns: s.physical.weighIns,
    },
    measurementsChanged: s.physical.measurements.fields.filter((f) => f.change != null && f.change !== 0).map((f) => `${f.label} ${f.change! > 0 ? "+" : ""}${f.change} ${f.key === "body_fat_pct" ? "%" : "in"}`),
    progressPhotos: s.physical.photos.count,
    training: {
      sessions: s.training.sessions,
      planned: s.training.planned,
      sessionsOnPlannedDays: s.training.plannedDone,
      extraSessions: s.training.extraSessions,
      adherencePct: s.training.adherencePct,
      workingSets: s.training.workingSets,
      volume: w(s.training.volumeLb),
      personalRecords: s.training.prs.count,
      topRecords: s.training.prs.items.slice(0, 3).map((x) => `${x.name}${x.gain != null ? ` e1RM +${w(x.gain)}` : ""}`),
      lifts: s.training.lifts.slice(0, 4).map((l) => `${l.name} e1RM ${w(l.startE1rm)} → ${w(l.endE1rm)}`),
    },
    nutrition: {
      daysLogged: s.nutrition.daysLogged,
      avgCalories: s.nutrition.avgCalories,
      calorieTarget: s.nutrition.calorieTarget,
      avgProteinG: s.nutrition.avgProtein,
      proteinTargetG: s.nutrition.proteinTarget,
      calorieTrend: s.nutrition.trend,
    },
    recovery: {
      checkIns: s.recovery.checkIns,
      avgSleepH: s.recovery.avgSleep,
      sleepGoalH: s.recovery.sleepGoal,
      avgFatigue1to5: s.recovery.avgFatigue,
      avgSoreness1to5: s.recovery.avgSoreness,
    },
    priorities: priorities.map((x) => x.title),
  };
}
export type AIDigest = ReturnType<typeof aiDigest>;
