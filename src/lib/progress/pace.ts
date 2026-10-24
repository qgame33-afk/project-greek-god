// One trend, one rate, one projection (DESIGN-V2 §4.1). Every screen that shows a trend
// weight, an lb-per-week rate, a projection, a pace verdict, terraces or the statue's gild
// reads it from here and never recomputes it. Pure: no React, no Supabase. All maths is in
// lb; only the copy strings convert to the display unit.

import type { WeighIn } from "@/lib/bodyweight";
import { addDays, daysBetween, monthName, parseISODate, type ISODate } from "@/lib/dates";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";

export const TREND_DAYS = 7; // trend = mean of weigh-ins in the 7 days ending at ref
export const RATE_WINDOW_DAYS = 28; // THE rate window, used everywhere
export const MIN_WEIGHINS = 4; // in the rate window; also the lifetime guard for gilding
export const MIN_SPAN_DAYS = 10; // first→last weigh-in inside the window
export const EARLY_WATER_DAYS = 14; // programme days flagged as water + glycogen
export const TOP_OF_WINDOW = 0.15; // top 15% of the corridor counts as "top"

/* ------------------------------------------------------------------ input */

interface Point {
  date: ISODate;
  lb: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Valid weigh-ins (finite, positive, real dates), optionally up to `ref`, sorted ascending. */
function clean(w: readonly WeighIn[], ref?: ISODate): Point[] {
  const out: Point[] = [];
  for (const x of w) {
    const lb = Number(x.weight_lb);
    if (typeof x.local_date !== "string" || !DATE_RE.test(x.local_date) || !Number.isFinite(lb) || lb <= 0) continue;
    if (ref && x.local_date > ref) continue;
    out.push({ date: x.local_date, lb });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** round() without a negative zero. */
const r = (n: number, dp: number) => {
  const v = round(n, dp);
  return v === 0 ? 0 : v;
};
const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* ------------------------------------------------------------------ trend */

export interface TrendReading {
  lb: number | null; // avg of weigh-ins in [end-6, end]; null if none ever
  n: number; // weigh-ins in that window
  end: ISODate; // ref, or the last weigh-in date when no weigh-in falls in the 7 days ending at ref
  latest: { lb: number; date: ISODate } | null; // the scale reading (latest weigh-in ≤ ref)
}

/**
 * The 7-day trend at `ref`. When the last weigh-in is older than the window, the window
 * ends at that weigh-in instead ("trend as of 9 Oct"), so the trend is null only when
 * there has never been a weigh-in. Rows dated after `ref` are ignored.
 */
export function trendAt(w: WeighIn[], ref: ISODate): TrendReading {
  const s = clean(w, ref);
  const last = s.at(-1);
  if (!last) return { lb: null, n: 0, end: ref, latest: null };
  const end = daysBetween(last.date, ref) > TREND_DAYS - 1 ? last.date : ref;
  const start = addDays(end, -(TREND_DAYS - 1));
  const xs = s.filter((x) => x.date >= start && x.date <= end).map((x) => x.lb);
  return { lb: r(mean(xs), 2), n: xs.length, end, latest: { lb: last.lb, date: last.date } };
}

/** One point per weigh-in date: the 7-day trend ending that day. Sorted ascending. */
export function trendSeries(w: WeighIn[], from?: ISODate, to?: ISODate): { date: ISODate; lb: number }[] {
  const s = clean(w);
  const out: { date: ISODate; lb: number }[] = [];
  let lo = 0;
  for (let i = 0; i < s.length; i++) {
    const d = s[i].date;
    if (i + 1 < s.length && s[i + 1].date === d) continue; // one point per date (after the last row of it)
    if ((from && d < from) || (to && d > to)) continue;
    const start = addDays(d, -(TREND_DAYS - 1));
    while (s[lo].date < start) lo++;
    out.push({ date: d, lb: r(mean(s.slice(lo, i + 1).map((x) => x.lb)), 2) });
  }
  return out;
}

/* ------------------------------------------------------------------- rate */

export interface RateReading {
  lbPerWeek: number | null; // OLS slope of raw weigh-ins (lb vs day) in [ref-27, ref] × 7, rounded to 0.01; null unless status is "ok"
  n: number;
  spanDays: number;
  from: ISODate;
  to: ISODate;
  status: "ok" | "needs_weighins" | "needs_span";
  includesEarlyWater: boolean; // window overlaps [programStart, programStart+13]
}

/**
 * THE rate: the least-squares slope of the raw weigh-ins in the 28 days ending at `ref`,
 * in lb a week. Needs 4 weigh-ins spanning at least 10 days; otherwise the status says
 * which and the rate is null (never a guess from too little data).
 */
export function rateAt(w: WeighIn[], ref: ISODate, programStart?: ISODate | null): RateReading {
  const from = addDays(ref, -(RATE_WINDOW_DAYS - 1));
  const xs = clean(w, ref).filter((x) => x.date >= from);
  const n = xs.length;
  const spanDays = n ? daysBetween(xs[0].date, xs[n - 1].date) : 0;
  const includesEarlyWater = !!programStart && DATE_RE.test(programStart) && from <= addDays(programStart, EARLY_WATER_DAYS - 1) && ref >= programStart;
  const base = { n, spanDays, from, to: ref, includesEarlyWater };
  if (n < MIN_WEIGHINS) return { ...base, lbPerWeek: null, status: "needs_weighins" };
  if (spanDays < MIN_SPAN_DAYS) return { ...base, lbPerWeek: null, status: "needs_span" };
  const x = xs.map((p) => daysBetween(from, p.date));
  const y = xs.map((p) => p.lb);
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  return { ...base, lbPerWeek: r((sxy / sxx) * 7, 2), status: "ok" };
}

/* ------------------------------------------------------- projection, corridor */

/** trend + rate × weeks(from→to), rounded to 0.1. */
export function projectAt(trendLb: number, lbPerWeek: number, from: ISODate, to: ISODate): number {
  return r(trendLb + (lbPerWeek * daysBetween(from, to)) / 7, 1);
}

export interface Corridor {
  minRate: number;
  maxRate: number;
  weeksLeft: number;
  bandMin: number;
  bandMax: number;
}

/** Rates that land the trend inside [bandMin, bandMax] at targetDate. Null when weeksLeft ≤ 0. Rounded to 0.01. */
export function paceCorridor(trendLb: number, today: ISODate, targetDate: ISODate, bandMin: number, bandMax: number): Corridor | null {
  const days = daysBetween(today, targetDate);
  if (!(days > 0) || !Number.isFinite(trendLb)) return null;
  const lo = Math.min(bandMin, bandMax);
  const hi = Math.max(bandMin, bandMax);
  const weeks = days / 7;
  return { minRate: r((lo - trendLb) / weeks, 2), maxRate: r((hi - trendLb) / weeks, 2), weeksLeft: r(weeks, 2), bandMin: lo, bandMax: hi };
}

/* ---------------------------------------------------------------- verdict */

export type PaceVerdict = "needs_data" | "below" | "on_pace" | "top" | "above" | "arrived";

/**
 * The pace call (§4.1.1). `band` is only needed when the corridor is null (the target
 * date has passed); without either there is nothing to judge against → needs_data.
 */
export function verdictFor(rate: RateReading, corridor: Corridor | null, trendLb: number | null, band?: { min: number; max: number } | null): PaceVerdict {
  if (rate.status !== "ok" || rate.lbPerWeek == null || trendLb == null) return "needs_data";
  const bandMin = corridor?.bandMin ?? band?.min ?? null;
  if (bandMin == null) return "needs_data";
  if (trendLb >= bandMin) return "arrived";
  if (!corridor) return "below"; // target passed, still under the band
  const v = rate.lbPerWeek;
  if (v < corridor.minRate) return "below";
  if (v > corridor.maxRate) return "above";
  if (v >= corridor.maxRate - TOP_OF_WINDOW * (corridor.maxRate - corridor.minRate)) return "top";
  return "on_pace";
}

/* ------------------------------------------------------------------- pace */

export interface ProfileForPace {
  start_weight_lb: number | string | null;
  goal_weight_lb: number | string | null;
  goal_range_min_lb: number | string | null;
  goal_range_max_lb: number | string | null;
  start_date: ISODate | null;
  target_date: ISODate | null;
}

export interface Pace {
  trend: TrendReading;
  rate: RateReading;
  corridor: Corridor | null;
  projection: { lb: number; date: ISODate } | null; // null unless rate.status === "ok"
  verdict: PaceVerdict;
  sentence: string; // the verdict copy (§4.1.3)
  detail: string; // "+0.40 lb a week · ~184.9 lb by 1 Aug" or the next step
  ariaLabel: string; // one full sentence for VoiceOver
  /** The date everything was computed for. */
  today: ISODate;
  /** The goal band in lb (goal range, falling back to the goal weight), or null when unset. */
  band: { min: number; max: number } | null;
  target: ISODate | null;
}

/** The goal band in lb: the goal range, falling back to the goal weight. */
export function bandOf(p: Pick<ProfileForPace, "goal_weight_lb" | "goal_range_min_lb" | "goal_range_max_lb"> | null | undefined): { min: number; max: number } | null {
  if (!p) return null;
  const goal = num(p.goal_weight_lb);
  const lo = num(p.goal_range_min_lb) ?? goal;
  const hi = num(p.goal_range_max_lb) ?? goal ?? lo;
  if (lo == null || hi == null) return null;
  return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
}

/** "1 Aug" ("1 August" when `long`); the year is added when the date is more than a year from `ref`. */
export function dayMonth(d: ISODate, ref: ISODate, long = false): string {
  const day = parseISODate(d).getDate();
  const m = monthName(d, !long);
  return Math.abs(daysBetween(ref, d)) > 365 ? `${day} ${m} ${d.slice(0, 4)}` : `${day} ${m}`;
}

function fmt(unit: WeightUnit) {
  const w = (lb: number, dp = 1) => r(toDisplayWeight(lb, unit), dp);
  const fixed = (lb: number, dp = 1) => w(lb, dp).toFixed(dp);
  const signed = (lbPerWeek: number) => {
    const v = w(lbPerWeek, 2);
    return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
  };
  const plain = (lb: number) => {
    const v = w(lb, 1);
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };
  const band = (b: { min: number; max: number }) => (b.min === b.max ? `${plain(b.min)} ${unit}` : `${plain(b.min)}–${plain(b.max)} ${unit}`);
  /** For speech: up to 2 decimals, no trailing zeros ("0.4", "184.9"). */
  const spoken = (lb: number, dp = 1) => String(w(lb, dp));
  return { fixed, signed, plain, band, spoken };
}

/**
 * Trend, rate, corridor, projection and the verdict for one day, plus the copy every
 * screen shows (§4.1.3). `unit` only changes the strings; the maths stays in lb.
 */
export function pace(input: { weighIns: WeighIn[]; today: ISODate; profile: ProfileForPace | null | undefined; unit?: WeightUnit }): Pace {
  const { weighIns, today, profile } = input;
  const unit: WeightUnit = input.unit === "kg" ? "kg" : "lb";
  const f = fmt(unit);
  const pounds = unit === "kg" ? "kilograms" : "pounds";

  const trend = trendAt(weighIns, today);
  const programStart = profile?.start_date ?? null;
  const rate = rateAt(weighIns, today, programStart);
  const band = bandOf(profile);
  const target = profile?.target_date && DATE_RE.test(profile.target_date) ? profile.target_date : null;
  const corridor = trend.lb != null && band && target ? paceCorridor(trend.lb, today, target, band.min, band.max) : null;
  const projection =
    rate.status === "ok" && rate.lbPerWeek != null && trend.lb != null && target && daysBetween(today, target) > 0
      ? { lb: projectAt(trend.lb, rate.lbPerWeek, trend.end, target), date: target }
      : null;
  const verdict = verdictFor(rate, corridor, trend.lb, band);

  let sentence: string;
  let detail: string;
  const rateTxt = rate.lbPerWeek != null ? `${f.signed(rate.lbPerWeek)} ${unit} a week` : "";
  const windowTxt = corridor ? `${f.signed(corridor.minRate).replace("+", "")}–${f.signed(corridor.maxRate).replace("+", "")}` : "";
  switch (verdict) {
    case "needs_data":
      if (rate.status === "ok") {
        sentence = "Your pace needs a goal band.";
        detail = "Set your goal weight and target date in Settings";
      } else if (rate.status === "needs_span") {
        sentence = `Your pace appears after ${MIN_SPAN_DAYS} days of weigh-ins.`;
        detail = `Weigh-ins span ${rate.spanDays} of ${MIN_SPAN_DAYS} days in the last 4 weeks`;
      } else {
        sentence = `Your pace appears after ${MIN_WEIGHINS} weigh-ins.`;
        detail = `${rate.n} of ${MIN_WEIGHINS} weigh-ins in the last 4 weeks`;
      }
      break;
    case "below":
      sentence = "A bit slow.";
      detail = corridor ? `${rateTxt} · ${windowTxt} lands you in ${f.band(band!)}` : `${rateTxt} · the target date has passed`;
      break;
    case "on_pace":
    case "top":
      sentence = verdict === "top" ? "On track, a bit fast." : "On track.";
      detail = projection ? `${rateTxt} · ~${f.fixed(projection.lb)} ${unit} by ${dayMonth(projection.date, today)}` : rateTxt;
      break;
    case "above":
      sentence = "A bit fast.";
      detail = `${rateTxt} · ${windowTxt} is the lean-gain window`;
      break;
    case "arrived": {
      const over = band != null && trend.lb! > band.max;
      sentence = over ? `You're above ${f.band(band!)}.` : `You're inside ${f.band(band!)}.`;
      detail = over ? `Trend ${f.fixed(trend.lb!)} ${unit} · ${f.band(band!)} is the goal band` : `Trend ${f.fixed(trend.lb!)} ${unit} · hold here`;
      break;
    }
  }

  // VoiceOver: one sentence.
  let aria: string;
  if (trend.lb == null) aria = `No weigh-ins yet. ${sentence}`;
  else {
    const asOf = trend.end !== today ? `, as of ${dayMonth(trend.end, today, true)}` : "";
    const base = `Trend ${f.spoken(trend.lb)} ${pounds}${asOf}`;
    const moving =
      rate.lbPerWeek == null
        ? ""
        : rate.lbPerWeek > 0
          ? `, gaining ${f.spoken(rate.lbPerWeek, 2)} ${pounds} a week`
          : rate.lbPerWeek < 0
            ? `, losing ${f.spoken(Math.abs(rate.lbPerWeek), 2)} ${pounds} a week`
            : ", holding steady";
    const proj = projection ? `, projected ${f.spoken(projection.lb)} on ${dayMonth(projection.date, today, true)}` : "";
    const corridorTxt = corridor ? ` of ${f.spoken(corridor.minRate, 2)} to ${f.spoken(corridor.maxRate, 2)} ${pounds} a week` : "";
    switch (verdict) {
      case "needs_data":
        aria = `${base}. ${sentence} ${detail}.`;
        break;
      case "on_pace":
        aria = `${base}${moving}${proj}, on track.`;
        break;
      case "top":
        aria = `${base}${moving}${proj}, on track, a bit fast.`;
        break;
      case "below":
        aria = `${base}${moving}${proj}, a bit slow, against a needed pace${corridorTxt}.`;
        break;
      case "above":
        aria = `${base}${moving}${proj}, a bit fast, against a needed pace${corridorTxt}.`;
        break;
      case "arrived":
        aria = `${base}${moving}, ${trend.lb > band!.max ? "above" : "inside"} your goal band of ${f.spoken(band!.min)} to ${f.spoken(band!.max)} ${pounds}.`;
        break;
    }
  }

  return { trend, rate, corridor, projection, verdict, sentence, detail, ariaLabel: aria, today, band, target };
}

/**
 * The pace chip (docs/DESIGN-V3-SIMPLE.md §2.2, §4.1.1, §4.5.1): "On track", "A bit slow" or "A bit
 * fast"; null while there is no pace yet (fewer than 4 weigh-ins, no goal band) or once the goal
 * band is reached. A word, never a colour.
 */
export function paceChipLabel(verdict: PaceVerdict): "On track" | "A bit slow" | "A bit fast" | null {
  switch (verdict) {
    case "on_pace":
    case "top":
      return "On track";
    case "below":
      return "A bit slow";
    case "above":
      return "A bit fast";
    default:
      return null;
  }
}

/* --------------------------------------------------------------- terraces */

export interface Terrace {
  index: number;
  numeral: string; // 1, "I"
  lb: number;
  final: boolean; // final = bandMin ("Olympus")
  reachedOn: ISODate | null; // first trendSeries date with lb ≥ terrace
  eta: ISODate | null; // PROJ: only when rate ok and > 0 and not reached
}

const ROMAN: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];
export function roman(n: number): string {
  let out = "";
  let v = Math.max(0, Math.floor(n));
  for (const [k, s] of ROMAN)
    while (v >= k) {
      out += s;
      v -= k;
    }
  return out;
}

/**
 * Terraces: every multiple of `step` strictly above `startLb` and below `bandMin`, then
 * `bandMin` itself as the final one. Start 163, band 180 → 165 … 177.5, 180 (I–VII).
 * `series` is trendSeries() (ascending).
 */
export function terraces(p: Pace, series: { date: ISODate; lb: number }[], startLb: number, bandMin: number, step = 2.5): Terrace[] {
  const lbs: number[] = [];
  if (step > 0 && Number.isFinite(startLb) && Number.isFinite(bandMin)) {
    for (let k = Math.floor(startLb / step + 1e-9) + 1; k * step < bandMin - 1e-9 && lbs.length < 60; k++) lbs.push(r(k * step, 2));
  }
  if (Number.isFinite(bandMin)) lbs.push(bandMin);
  const rate = p.rate.status === "ok" ? p.rate.lbPerWeek : null;
  const trend = p.trend.lb;
  return lbs.map((lb, i) => {
    const reachedOn = series.find((s) => s.lb >= lb)?.date ?? null;
    let eta: ISODate | null = null;
    if (!reachedOn && rate != null && rate > 0 && trend != null) eta = addDays(p.trend.end, Math.max(0, Math.round(((lb - trend) / rate) * 7)));
    return { index: i + 1, numeral: roman(i + 1), lb, final: i === lbs.length - 1, reachedOn, eta };
  });
}

/* ------------------------------------------------------------------ gild */

/**
 * 0–1 statue gild. 0 when weighInCount < MIN_WEIGHINS or the trend is null;
 * clamp((trend − start)/(goal − start)). It follows the trend down as well as up.
 */
export function gildFraction(trendLb: number | null, startLb: number, goalLb: number, weighInCount: number): number {
  if (trendLb == null || !(weighInCount >= MIN_WEIGHINS)) return 0;
  if (![trendLb, startLb, goalLb].every(Number.isFinite)) return 0;
  if (goalLb === startLb) return trendLb >= goalLb ? 1 : 0;
  const v = (trendLb - startLb) / (goalLb - startLb);
  return Math.min(1, Math.max(0, v));
}

/** Highest trend so far (for the labelled "best trend" text only). Earliest date on a tie. */
export function highWater(series: { date: ISODate; lb: number }[]): { lb: number; date: ISODate } | null {
  let best: { lb: number; date: ISODate } | null = null;
  for (const s of series) if (Number.isFinite(s.lb) && (!best || s.lb > best.lb)) best = { lb: s.lb, date: s.date };
  return best;
}
