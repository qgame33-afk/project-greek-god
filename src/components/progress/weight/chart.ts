// Progress › Weight's trend chart (docs/DESIGN-V3-SIMPLE.md §4.5.1 item 2). Pure: the component
// only draws what this returns, so the honesty rules are tested here:
// - the dots are the logged weigh-ins, the line is trendSeries() (the one 7-day average);
// - the dashed line exists only when pace() has a rate (4+ weigh-ins over 10+ days) and starts at
//   the last 7-day average, carrying that rate forward ("If you keep this pace");
// - every y label is a round number in the display unit; nothing is invented between entries.

import { addDays, daysBetween, monthName, parseISODate, type ISODate } from "@/lib/dates";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";

export type Range = "1m" | "3m" | "all";
export const RANGES: { key: Range; label: string; spoken: string }[] = [
  { key: "1m", label: "1M", spoken: "1 month" },
  { key: "3m", label: "3M", spoken: "3 months" },
  { key: "all", label: "All", spoken: "everything" },
];

/** 3M while the programme is under 12 weeks old, then All (§4.5.1). */
export function defaultRange(startDate: ISODate | null | undefined, today: ISODate): Range {
  if (!startDate) return "3m";
  return daysBetween(startDate, today) < 84 ? "3m" : "all";
}

export interface Pt {
  x: number;
  y: number;
}

export interface ChartInput {
  width: number;
  height: number;
  range: Range;
  today: ISODate;
  /** The programme's start date (All begins there, or at the first weigh-in if earlier). */
  start: ISODate | null;
  /** Logged weigh-ins, lb. */
  weighIns: { date: ISODate; lb: number }[];
  /** trendSeries(): one 7-day average per weigh-in date, ascending. */
  series: { date: ISODate; lb: number }[];
  /** pace().rate.lbPerWeek when its status is "ok", else null (no dashed line). */
  lbPerWeek: number | null;
  unit: WeightUnit;
  /** Width the right-hand labels need, px (measured by the caller at the current text size). */
  labelWidth?: number;
}

export interface ChartGeometry {
  from: ISODate;
  to: ISODate;
  plot: { x: number; y: number; w: number; h: number };
  dots: Pt[];
  /** The 7-day average as an SVG path ("" with fewer than two points). */
  line: string;
  /** The last 7-day average in range (the white dot). */
  now: Pt | null;
  /** The dashed "If you keep this pace" segment. */
  projection: { a: Pt; b: Pt; lb: number; date: ISODate } | null;
  /** Three round values on the right, display unit. */
  yTicks: { y: number; value: number }[];
  xTicks: { x: number; label: string }[];
  /** The 7-day averages shown, first and last (for the VoiceOver sentence). */
  first: { date: ISODate; lb: number } | null;
  last: { date: ISODate; lb: number } | null;
}

const STEPS = [0.5, 1, 2, 3, 5, 10, 20, 25, 50];

/** The dates a range shows: most of it in the past, with room ahead for the dashed line. */
export function rangeDomain(range: Range, today: ISODate, start: ISODate | null, firstWeighIn: ISODate | null, projecting: boolean): [ISODate, ISODate] {
  const earliest = [start, firstWeighIn].filter((d): d is ISODate => !!d && d <= today).sort()[0] ?? addDays(today, -30);
  let from: ISODate;
  if (range === "all") from = daysBetween(earliest, today) < 30 ? addDays(today, -30) : earliest;
  else {
    // never open on empty weeks before the first weigh-in: the range starts where the data does
    from = addDays(today, range === "1m" ? -30 : -91);
    if (firstWeighIn && firstWeighIn > from) from = daysBetween(firstWeighIn, today) < 14 ? addDays(today, -14) : firstWeighIn;
  }
  const span = daysBetween(from, today);
  const lead = projecting ? Math.max(7, Math.round(span * 0.3)) : Math.max(1, Math.round(span * 0.03));
  return [from, addDays(today, lead)];
}

/** Three evenly spaced round labels (lo, mid, hi) that hold every value. */
export function yScale(values: number[]): { lo: number; step: number } {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { lo: 0, step: 1 };
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (max - min < 0.5) {
    // one value (or nearly): centre it instead of drawing it on the bottom edge
    min -= 0.5;
    max += 0.5;
  }
  for (const step of STEPS) {
    const lo = Math.floor(min / step) * step;
    if (lo + 2 * step >= max) return { lo: round(lo, 2), step };
  }
  const step = Math.ceil((max - min) / 2 / 100) * 100 || 100;
  return { lo: Math.floor(min / step) * step, step };
}

export function chartGeometry(input: ChartInput): ChartGeometry {
  const { width, height, range, today, unit } = input;
  const rate = input.lbPerWeek;
  const firstW = input.weighIns.reduce<ISODate | null>((a, w) => (!a || w.date < a ? w.date : a), null);
  const lastAvg = input.series.filter((s) => s.date <= today).at(-1) ?? null;
  const projecting = rate != null && Number.isFinite(rate) && lastAvg != null;
  const [from, to] = rangeDomain(range, today, input.start, firstW, projecting);

  const labelW = input.labelWidth ?? 34;
  const plot = { x: 4, y: 10, w: Math.max(40, width - labelW - 12), h: Math.max(40, height - 20) };
  const t0 = parseISODate(from).getTime();
  const spanMs = Math.max(1, parseISODate(to).getTime() - t0);
  const x = (d: ISODate) => plot.x + ((parseISODate(d).getTime() - t0) / spanMs) * plot.w;
  const inRange = (d: ISODate) => d >= from && d <= today;

  const dotsIn = input.weighIns.filter((w) => inRange(w.date) && Number.isFinite(w.lb));
  const seriesIn = input.series.filter((s) => inRange(s.date) && Number.isFinite(s.lb));
  let projection: { lb: number; date: ISODate; fromDate: ISODate; fromLb: number } | null = null;
  if (projecting && lastAvg && lastAvg.date >= from) {
    const lb = lastAvg.lb + (rate! * daysBetween(lastAvg.date, to)) / 7;
    projection = { lb, date: to, fromDate: lastAvg.date, fromLb: lastAvg.lb };
  }

  const disp = (lb: number) => toDisplayWeight(lb, unit);
  const ys = [...dotsIn.map((w) => disp(w.lb)), ...seriesIn.map((s) => disp(s.lb)), ...(projection ? [disp(projection.lb)] : [])];
  const { lo, step } = yScale(ys);
  const hi = lo + 2 * step;
  const y = (lb: number) => plot.y + (1 - (disp(lb) - lo) / (hi - lo || 1)) * plot.h;
  const p = (d: ISODate, lb: number): Pt => ({ x: r1(x(d)), y: r1(y(lb)) });

  const pts = seriesIn.map((s) => p(s.date, s.lb));
  const line = pts.length > 1 ? pts.map((q, i) => `${i ? "L" : "M"}${q.x},${q.y}`).join(" ") : "";
  const nowPt = seriesIn.length ? p(seriesIn.at(-1)!.date, seriesIn.at(-1)!.lb) : null;

  return {
    from,
    to,
    plot,
    dots: dotsIn.map((w) => p(w.date, w.lb)),
    line,
    now: nowPt,
    projection: projection ? { a: p(projection.fromDate, projection.fromLb), b: p(projection.date, projection.lb), lb: projection.lb, date: projection.date } : null,
    yTicks: [0, 1, 2].map((i) => ({ value: round(lo + i * step, 1), y: r1(plot.y + (1 - i / 2) * plot.h) })),
    xTicks: xTicks(from, to, x),
    first: seriesIn[0] ?? null,
    last: seriesIn.at(-1) ?? null,
  };
}

/** Month names at each 1st on longer ranges; Mondays ("12 Oct") on a month. Labels never crowd. */
function xTicks(from: ISODate, to: ISODate, x: (d: ISODate) => number): { x: number; label: string }[] {
  const out: { x: number; label: string }[] = [];
  const days = daysBetween(from, to);
  if (days <= 50) {
    let d = addDays(from, (8 - parseISODate(from).getDay()) % 7);
    while (d <= to && out.length < 8) {
      out.push({ x: r1(x(d)), label: `${parseISODate(d).getDate()} ${monthName(d, true)}` });
      d = addDays(d, 7);
    }
    return keepApart(out, 64);
  }
  const f = parseISODate(from);
  let m = new Date(f.getFullYear(), f.getMonth() + (f.getDate() === 1 ? 0 : 1), 1);
  const end = parseISODate(to);
  while (m <= end && out.length < 40) {
    const iso = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01` as ISODate;
    out.push({ x: r1(x(iso)), label: monthName(iso, true) });
    m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
  }
  return keepApart(out, 40);
}

function keepApart<T extends { x: number }>(ticks: T[], gap: number): T[] {
  const out: T[] = [];
  for (const t of ticks) if (!out.length || t.x - out.at(-1)!.x >= gap) out.push(t);
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** "Weight trend over 3 months: from 163.4 to 165.1 pounds, about 0.4 pounds a week. Dashed line: if you keep this pace." */
export function chartSentence(g: Pick<ChartGeometry, "first" | "last" | "projection">, range: Range, lbPerWeek: number | null, unit: WeightUnit): string {
  const words = unit === "kg" ? "kilograms" : "pounds"; // spoken unit name, from the profile's unit
  const span = RANGES.find((r) => r.key === range)!.spoken;
  if (!g.first || !g.last) return `Weight trend over ${span}: no weigh-ins in this range.`;
  const v = (lb: number) => String(round(toDisplayWeight(lb, unit), 1));
  const from = g.first.date === g.last.date ? `${v(g.last.lb)} ${words}` : `from ${v(g.first.lb)} to ${v(g.last.lb)} ${words}`;
  const rate = lbPerWeek != null ? `, about ${String(round(Math.abs(toDisplayWeight(lbPerWeek, unit)), 1))} ${words} a week ${lbPerWeek < 0 ? "down" : "up"}` : "";
  return `Weight trend over ${span}: ${from}${rate}.${g.projection ? " Dashed line: if you keep this pace." : ""}`;
}
