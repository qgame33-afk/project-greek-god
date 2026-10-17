// The Mountain chart's geometry (docs/DESIGN-V2.md §3.6.1). Pure: no React, no DOM. The chart
// component only draws what this returns, so the honesty rules are tested here:
// - every number comes from pace() / trendSeries() / terraces() (nothing is recomputed);
// - the decorative ridge stays in the bottom 30% of the plot and never touches a data line;
// - the projection label never overlaps the band label;
// - the Season inset never covers data.
// All maths is in lb; tick labels convert to the display unit.

import { RIDGE_PATH } from "@/components/art/Ridge";
import { addDays, daysBetween, monthName, parseISODate, type ISODate } from "@/lib/dates";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";
import { dayMonth, type Pace, type Terrace } from "./pace";

export type Zoom = "6w" | "3m" | "season";
export const ZOOMS: { key: Zoom; label: string }[] = [
  { key: "6w", label: "6W" },
  { key: "3m", label: "3M" },
  { key: "season", label: "Season" },
];
export const isZoom = (v: unknown): v is Zoom => v === "6w" || v === "3m" || v === "season";

/** 3M while the programme is under 12 weeks old, then Season (§0.3). */
export function defaultZoom(startDate: ISODate | null, today: ISODate): Zoom {
  if (!startDate) return "3m";
  return daysBetween(startDate, today) < 84 ? "3m" : "season";
}

export interface Pt {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MountainInput {
  width: number;
  height: number;
  zoom: Zoom;
  today: ISODate;
  /** Programme start (date and weight). */
  start: { date: ISODate; lb: number };
  target: ISODate | null;
  band: { min: number; max: number } | null;
  /** Raw weigh-ins (LOG). */
  weighIns: { date: ISODate; lb: number }[];
  /** trendSeries() — the one trend, one point per weigh-in date. */
  series: { date: ISODate; lb: number }[];
  pace: Pick<Pace, "trend" | "projection" | "corridor">;
  terraces: Terrace[];
  unit: WeightUnit;
  /** Accessibility text sizes: thinner ticks (every 10 lb). */
  ax?: boolean;
  /** Width of the PROJ label text in px (measured by the caller; estimated otherwise). */
  measure?: (text: string, kind: "label" | "tick") => number;
}

export interface Label extends Box {
  text: string;
}

export interface MountainGeometry {
  width: number;
  height: number;
  plot: Box;
  zoom: Zoom;
  from: ISODate;
  to: ISODate;
  yDomain: [number, number];
  x: (d: ISODate) => number;
  y: (lb: number) => number;
  yTicks: { lb: number; y: number; label: string }[];
  xTicks: { x: number; label: string; date: ISODate }[];
  dots: (Pt & { date: ISODate; lb: number })[];
  trend: Pt[];
  trendPath: string;
  corridor: { origin: Pt; upper: Pt; lower: Pt; path: string } | null;
  projection: { from: Pt; to: Pt; end: Pt; endInside: boolean; path: string; label: Label | null } | null;
  band: { y0: number; y1: number; label: Label | null } | null;
  terraces: { index: number; numeral: string; lb: number; y: number; reached: boolean; final: boolean }[];
  climber: Pt | null;
  climberLabel: Label | null;
  summit: Pt | null;
  ridge: { points: Pt[]; path: string; top: number };
  inset: Box | null;
}

/* ----------------------------------------------------------------- layout */

const GUTTER = { left: 40, right: 30, top: 34, bottom: 26 };
const RIDGE_SHARE = 0.3; // the ridge lives in the bottom 30% of the plot
const RIDGE_GAP = 10; // px it keeps clear of every data mark
export const INSET = { w: 120, h: 56 };
const LABEL_H = 22;

const DAY_MS = 86_400_000;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Rough text width for Inter Tight / SF at the label sizes (the caller may measure instead). */
function estimate(text: string, kind: "label" | "tick") {
  return Math.ceil(text.length * (kind === "label" ? 6.9 : 6.4));
}

/* ------------------------------------------------------------------ ridge */

/**
 * The ridge silhouette (the same path as public/art/ridge.svg, 1200×300) sampled into
 * points with x in 0..1 and h in 0..1 (height above the baseline). Smooth by construction:
 * the path is all cubic curves, sampled finely.
 */
export function ridgeProfile(samples = 96): { x: number; h: number }[] {
  const pts = sampleCubicPath(RIDGE_PATH, 24);
  // keep the outline only (drop the closing verticals at the edges), then resample evenly in x
  const outline = pts.filter((p) => p.y < 300 - 1e-6).sort((a, b) => a.x - b.x);
  const out: { x: number; h: number }[] = [];
  for (let i = 0; i <= samples; i++) {
    const X = (i / samples) * 1200;
    let j = outline.findIndex((p) => p.x >= X);
    if (j <= 0) j = j === 0 ? 1 : outline.length - 1;
    const a = outline[j - 1];
    const b = outline[j];
    const t = b.x === a.x ? 0 : (X - a.x) / (b.x - a.x);
    const y = a.y + (b.y - a.y) * Math.min(1, Math.max(0, t));
    out.push({ x: X / 1200, h: (300 - y) / 300 });
  }
  return out;
}

/** Points along an absolute M/V/H/L/C/S/Z path (enough of SVG for the ridge). */
export function sampleCubicPath(d: string, steps = 16): Pt[] {
  const tokens = d.match(/[MVHLCSZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const out: Pt[] = [];
  let i = 0;
  let cmd = "";
  let cur: Pt = { x: 0, y: 0 };
  let lastCtrl: Pt | null = null;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Z]/i.test(tokens[i])) cmd = tokens[i++].toUpperCase();
    if (cmd === "M" || cmd === "L") {
      cur = { x: num(), y: num() };
      out.push(cur);
      lastCtrl = null;
    } else if (cmd === "V") {
      cur = { x: cur.x, y: num() };
      out.push(cur);
      lastCtrl = null;
    } else if (cmd === "H") {
      cur = { x: num(), y: cur.y };
      out.push(cur);
      lastCtrl = null;
    } else if (cmd === "C" || cmd === "S") {
      const c1: Pt = cmd === "C" ? { x: num(), y: num() } : lastCtrl ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : cur;
      const c2: Pt = { x: num(), y: num() };
      const end: Pt = { x: num(), y: num() };
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        out.push({
          x: u * u * u * cur.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
          y: u * u * u * cur.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
        });
      }
      lastCtrl = c2;
      cur = end;
    } else if (cmd === "Z") {
      lastCtrl = null;
    } else i++; // unknown token: skip
  }
  return out;
}

/* ------------------------------------------------------------ primitives */

export function boxesOverlap(a: Box, b: Box, pad = 0) {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}

function pointInBox(p: Pt, b: Box) {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt) {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True when any segment of the polyline touches the box. */
export function polylineHitsBox(pts: Pt[], b: Box, pad = 0): boolean {
  const bb = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  if (pts.some((p) => pointInBox(p, bb))) return true;
  const corners: Pt[] = [
    { x: bb.x, y: bb.y },
    { x: bb.x + bb.w, y: bb.y },
    { x: bb.x + bb.w, y: bb.y + bb.h },
    { x: bb.x, y: bb.y + bb.h },
  ];
  for (let i = 1; i < pts.length; i++) for (let k = 0; k < 4; k++) if (segmentsCross(pts[i - 1], pts[i], corners[k], corners[(k + 1) % 4])) return true;
  return false;
}

/** y of a polyline at x (linear), or null outside its x-range. */
export function yAt(pts: Pt[], x: number): number | null {
  if (pts.length === 0) return null;
  if (pts.length === 1) return Math.abs(pts[0].x - x) < 0.5 ? pts[0].y : null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    if (x >= lo && x <= hi) return b.x === a.x ? Math.min(a.y, b.y) : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return null;
}

const path = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${r1(p.x)} ${r1(p.y)}`).join("");

/** Cut a segment to the plot's x-range [x0, x1]. */
function clipSegment(a: Pt, b: Pt, x0: number, x1: number): [Pt, Pt] | null {
  if ((a.x < x0 && b.x < x0) || (a.x > x1 && b.x > x1)) return null;
  const at = (x: number): Pt => ({ x, y: a.y + ((x - a.x) / (b.x - a.x || 1)) * (b.y - a.y) });
  return [a.x < x0 ? at(x0) : a, b.x > x1 ? at(x1) : b];
}

/* ------------------------------------------------------------------ ticks */

/** Tick step in the DISPLAY unit: lb every 5 (1 in 6W, 10 at AX); kg every 2 (0.5, 5). */
export function tickStep(zoom: Zoom, unit: WeightUnit, ax = false): number {
  if (unit === "kg") return ax ? 5 : zoom === "6w" ? 0.5 : 2;
  return ax ? 10 : zoom === "6w" ? 1 : 5;
}

function monthTicks(from: ISODate, to: ISODate, x: (d: ISODate) => number, width: number): { x: number; label: string; date: ISODate }[] {
  const firsts: ISODate[] = [];
  const d0 = parseISODate(from);
  let m = new Date(d0.getFullYear(), d0.getMonth() + (d0.getDate() === 1 ? 0 : 1), 1);
  const end = parseISODate(to);
  while (m <= end && firsts.length < 40) {
    const iso = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`;
    firsts.push(iso);
    m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
  }
  const spacing = firsts.length > 1 ? (x(firsts.at(-1)!) - x(firsts[0])) / (firsts.length - 1) : width;
  const short = spacing < 34;
  return firsts.map((d) => ({ x: x(d), date: d, label: short ? monthName(d).slice(0, 1) : monthName(d, true) }));
}

function weekTicks(from: ISODate, to: ISODate, x: (d: ISODate) => number): { x: number; label: string; date: ISODate }[] {
  const out: { x: number; label: string; date: ISODate }[] = [];
  // Mondays
  const wd = parseISODate(from).getDay();
  let d = addDays(from, (8 - wd) % 7);
  while (d <= to && out.length < 12) {
    out.push({ x: x(d), date: d, label: `${parseISODate(d).getDate()} ${monthName(d, true)}` });
    d = addDays(d, 7);
  }
  // keep labels apart
  return out.filter((t, i) => i === 0 || t.x - out[i - 1].x >= 44);
}

/* ---------------------------------------------------------------- domain */

/** The dates a zoom shows. Season runs start → target; 3M and 6W keep most of the window in the past and a little projection ahead. */
export function zoomDomain(zoom: Zoom, today: ISODate, start: ISODate, target: ISODate | null, firstWeighIn: ISODate | null): [ISODate, ISODate] {
  const seasonFrom = firstWeighIn && firstWeighIn < start ? firstWeighIn : start;
  if (zoom === "season") {
    const end = target && target > today ? target : addDays(today, 90);
    return [seasonFrom, end > seasonFrom ? end : addDays(seasonFrom, 90)];
  }
  const span = zoom === "6w" ? 42 : 91;
  const lead = zoom === "6w" ? 7 : 30;
  let from = addDays(today, -(span - lead));
  if (from < seasonFrom) from = seasonFrom;
  return [from, addDays(from, span)];
}

/* -------------------------------------------------------------- geometry */

export function mountainGeometry(input: MountainInput): MountainGeometry {
  const { width, height, zoom, today, start, target, band, unit, pace: pc } = input;
  const measure = input.measure ?? estimate;
  const plot: Box = { x: GUTTER.left, y: GUTTER.top, w: Math.max(40, width - GUTTER.left - GUTTER.right), h: Math.max(60, height - GUTTER.top - GUTTER.bottom) };
  const firstW = input.weighIns.reduce<ISODate | null>((a, w) => (!a || w.date < a ? w.date : a), null);
  const [from, to] = zoomDomain(zoom, today, start.date, target, firstW);
  const t0 = parseISODate(from).getTime();
  const span = Math.max(1, parseISODate(to).getTime() - t0);
  const x = (d: ISODate) => plot.x + ((parseISODate(d).getTime() - t0) / span) * plot.w;
  const inX = (d: ISODate) => d >= from && d <= to;

  const trendLb = pc.trend.lb;
  const trendEnd = pc.trend.end;
  const origin = trendLb != null ? { date: trendEnd, lb: trendLb } : { date: start.date, lb: start.lb };

  /* ---- y domain: what this zoom shows */
  const ys: number[] = [];
  for (const w of input.weighIns) if (inX(w.date)) ys.push(w.lb);
  for (const s of input.series) if (inX(s.date)) ys.push(s.lb);
  if (trendLb != null) ys.push(trendLb);
  const weeksTo = (d: ISODate) => daysBetween(origin.date, d) / 7;
  const corridorOk = !!band && !!target && target > origin.date;
  const minRate = pc.corridor?.minRate ?? (corridorOk ? (band!.min - origin.lb) / weeksTo(target!) : null);
  const maxRate = pc.corridor?.maxRate ?? (corridorOk ? (band!.max - origin.lb) / weeksTo(target!) : null);
  const projRate = pc.projection && target ? (pc.projection.lb - origin.lb) / Math.max(1e-6, weeksTo(target)) : null;
  // where the guides sit at the right edge of the window
  const edge = target && target < to ? target : to;
  if (zoom === "season") {
    ys.push(start.lb);
    if (band) ys.push(band.min, band.max);
    if (pc.projection) ys.push(pc.projection.lb);
  } else {
    if (inX(origin.date)) ys.push(origin.lb);
    if (minRate != null && maxRate != null) ys.push(origin.lb + minRate * weeksTo(edge), origin.lb + maxRate * weeksTo(edge));
    if (projRate != null) ys.push(origin.lb + projRate * weeksTo(edge));
    if (!ys.length) ys.push(start.lb);
  }
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  const minRange = zoom === "6w" ? 3 : zoom === "3m" ? 8 : 12;
  if (hi - lo < minRange) {
    const mid = (hi + lo) / 2;
    lo = mid - minRange / 2;
    hi = mid + minRange / 2;
  }
  const range = hi - lo;
  // room under the lowest mark for the ridge and above the highest for the band label
  lo -= range * (zoom === "season" ? 0.14 : 0.12);
  hi += range * 0.06;
  const y = (lb: number) => plot.y + (1 - (lb - lo) / (hi - lo)) * plot.h;

  /* ---- ticks */
  const step = tickStep(zoom, unit, input.ax);
  const toLb = (v: number) => (unit === "kg" ? v * 2.2046226218 : v);
  const yTicks: MountainGeometry["yTicks"] = [];
  const dLo = toDisplayWeight(lo, unit);
  const dHi = toDisplayWeight(hi, unit);
  for (let v = Math.ceil(dLo / step - 1e-9) * step; v <= dHi + 1e-9 && yTicks.length < 40; v = round(v + step, 2)) {
    const lb = toLb(v);
    yTicks.push({ lb, y: y(lb), label: Number.isInteger(v) ? String(v) : v.toFixed(1) });
  }
  const xTicks = zoom === "6w" ? weekTicks(from, to, x) : monthTicks(from, to, x, plot.w);

  /* ---- history */
  const dots = input.weighIns.filter((w) => inX(w.date)).map((w) => ({ x: x(w.date), y: y(w.lb), date: w.date, lb: w.lb }));
  const trend = input.series.filter((s) => inX(s.date)).map((s) => ({ x: x(s.date), y: y(s.lb) }));

  /* ---- corridor and projection (drawn from today's trend; clipped to the window) */
  const x0 = plot.x;
  const x1 = plot.x + plot.w;
  let corridor: MountainGeometry["corridor"] = null;
  if (corridorOk && minRate != null && maxRate != null) {
    const o: Pt = { x: x(origin.date), y: y(origin.lb) };
    const up: Pt = { x: x(target!), y: y(band!.max) };
    const dn: Pt = { x: x(target!), y: y(band!.min) };
    const cu = clipSegment(o, up, x0, x1);
    const cl = clipSegment(o, dn, x0, x1);
    if (cu && cl) corridor = { origin: cu[0], upper: cu[1], lower: cl[1], path: `M${r1(cu[0].x)} ${r1(cu[0].y)}L${r1(cu[1].x)} ${r1(cu[1].y)}L${r1(cl[1].x)} ${r1(cl[1].y)}Z` };
  }

  let band_: MountainGeometry["band"] = null;
  const bandLabelText = band ? `OLYMPUS · ${fmtBand(band, unit)}` : "";
  if (band) {
    const y0 = y(band.max);
    const y1 = y(band.min);
    if (y1 > plot.y - 1 && y0 < plot.y + plot.h) {
      const lw = measure(bandLabelText, "label") + 4;
      const top = Math.max(plot.y, y0);
      const bottom = Math.min(plot.y + plot.h, y1);
      // left-aligned inside the band; above it when the band is too thin to hold the label
      const ly = bottom - top >= LABEL_H + 4 ? top + 2 : Math.max(0, top - LABEL_H - 2);
      band_ = { y0: top, y1: bottom, label: { x: plot.x + 6, y: ly, w: lw, h: LABEL_H, text: bandLabelText } };
    }
  }

  let projection: MountainGeometry["projection"] = null;
  if (pc.projection && trendLb != null && target) {
    const a: Pt = { x: x(trendEnd), y: y(trendLb) };
    const b: Pt = { x: x(target), y: y(pc.projection.lb) };
    const c = clipSegment(a, b, x0, x1);
    if (c) {
      const endInside = b.x <= x1 + 0.5;
      const text = `~${fmtW(pc.projection.lb, unit)} · ${dayMonth(pc.projection.date, today)}`;
      const lw = measure(text, "label") + 8 + 44; // + the PROJ tag
      const end = c[1];
      const above: Box = { x: Math.min(end.x - lw, x1 - lw), y: end.y - LABEL_H - 8, w: lw, h: LABEL_H };
      const below: Box = { x: above.x, y: end.y + 8, w: lw, h: LABEL_H };
      // §3.6.1: above the line end if the band label is to its left, otherwise below; then
      // check the boxes and flip if they still collide.
      const bandBox = band_?.label ?? null;
      const bandLeft = !bandBox || bandBox.x + bandBox.w <= above.x;
      let pick = bandLeft ? above : below;
      const other = pick === above ? below : above;
      const clash = (bx: Box) => (bandBox ? boxesOverlap(bx, bandBox, 4) : false);
      const outside = (bx: Box) => bx.y < 0 || bx.y + bx.h > plot.y + plot.h;
      if (clash(pick) || outside(pick)) pick = clash(other) || outside(other) ? pick : other;
      pick = { ...pick, x: Math.max(plot.x, pick.x) };
      let label: Label | null = { ...pick, text };
      if (bandBox && boxesOverlap(label, bandBox, 4)) {
        // last resort on very narrow plots: tuck the label under the band, right-aligned
        const tucked = { ...label, y: (band_?.y1 ?? end.y) + 6 };
        label = boxesOverlap(tucked, bandBox, 4) ? null : tucked;
      }
      projection = { from: c[0], to: c[1], end, endInside, path: path([c[0], c[1]]), label };
    }
  }

  /* ---- terraces, climber, summit */
  const terraces = input.terraces
    .map((t) => ({ index: t.index, numeral: t.numeral, lb: t.lb, y: y(t.lb), reached: !!t.reachedOn, final: t.final }))
    .filter((t) => t.y >= plot.y - 0.5 && t.y <= plot.y + plot.h + 0.5);
  const climber = trendLb != null && inX(trendEnd) ? { x: x(trendEnd), y: y(trendLb) } : null;
  let climberLabel: Label | null = null;
  if (climber) {
    const text = `You · ${fmtW(trendLb!, unit)}`;
    const w = measure(text, "label") + 4;
    const lb: Label = { x: Math.min(climber.x + 10, x1 - w), y: climber.y + 10, w, h: LABEL_H, text };
    const clashes = (b: Box) => (projection?.label && boxesOverlap(b, projection.label, 2)) || (band_?.label && boxesOverlap(b, band_.label, 2));
    climberLabel = clashes(lb) ? null : lb;
  }
  const summit = band && target && inX(target) ? { x: x(target), y: Math.max(14, y(band.max) - 4) } : null;

  /* ---- the ridge: bottom 30%, kept RIDGE_GAP px under every data mark */
  const dataLines: Pt[][] = [trend];
  if (projection) dataLines.push([projection.from, projection.to]);
  if (corridor) dataLines.push([corridor.origin, corridor.lower]);
  const profile = ridgeProfile();
  const base = plot.y + plot.h;
  let hr = plot.h * RIDGE_SHARE;
  for (const p of profile) {
    if (p.h <= 0) continue;
    const px = plot.x + p.x * plot.w;
    let lowest = -Infinity; // the lowest data mark on screen (largest y) at this x
    for (const line of dataLines) {
      const v = yAt(line, px);
      if (v != null) lowest = Math.max(lowest, v);
    }
    for (const d of dots) if (Math.abs(d.x - px) <= plot.w / profile.length + 3) lowest = Math.max(lowest, d.y + 3);
    if (lowest === -Infinity) continue;
    const room = base - lowest - RIDGE_GAP;
    hr = Math.min(hr, Math.max(0, room / p.h));
  }
  const ridgePts = profile.map((p) => ({ x: plot.x + p.x * plot.w, y: base - p.h * hr }));
  const ridgePath = `${path(ridgePts)}L${r1(plot.x + plot.w)} ${r1(base)}L${r1(plot.x)} ${r1(base)}Z`;

  /* ---- Season inset: a 120×56 box that covers no data */
  let inset: Box | null = null;
  if (zoom === "season" && input.series.length >= 2) {
    const candidates: Box[] = [
      { x: plot.x + 8, y: base - INSET.h - 8, w: INSET.w, h: INSET.h }, // lower left (§3.6.1)
      { x: x1 - INSET.w - 8, y: base - INSET.h - 8, w: INSET.w, h: INSET.h }, // lower right
      { x: plot.x + 8, y: (band_ ? band_.y1 : plot.y) + 14, w: INSET.w, h: INSET.h }, // under the band, left
    ];
    const labels = [band_?.label, projection?.label, climberLabel].filter((b): b is Label => !!b);
    inset =
      candidates.find(
        (b) =>
          b.y >= plot.y &&
          b.y + b.h <= base &&
          !dataLines.some((l) => l.length && polylineHitsBox(l, b, 4)) &&
          !dots.some((d) => pointInBox(d, { x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 })) &&
          !labels.some((l) => boxesOverlap(l, b, 4)) &&
          !(climber && pointInBox(climber, { x: b.x - 10, y: b.y - 10, w: b.w + 20, h: b.h + 20 })),
      ) ?? null;
  }

  return {
    width,
    height,
    plot,
    zoom,
    from,
    to,
    yDomain: [lo, hi],
    x,
    y,
    yTicks,
    xTicks,
    dots,
    trend,
    trendPath: path(trend),
    corridor,
    projection,
    band: band_,
    terraces,
    climber,
    climberLabel,
    summit,
    ridge: { points: ridgePts, path: ridgePath, top: base - hr },
    inset,
  };
}

/** The Season inset's own small geometry: the trend of the last 6 weeks only. */
export function insetGeometry(series: { date: ISODate; lb: number }[], today: ISODate, box: { w: number; h: number }) {
  const from = addDays(today, -41);
  const pts = series.filter((s) => s.date >= from && s.date <= today);
  if (pts.length < 2) return null;
  const pad = { l: 8, r: 8, t: 22, b: 8 };
  const lo = Math.min(...pts.map((p) => p.lb));
  const hi = Math.max(...pts.map((p) => p.lb));
  const span = Math.max(1, hi - lo);
  const t0 = parseISODate(from).getTime();
  const w = box.w - pad.l - pad.r;
  const h = box.h - pad.t - pad.b;
  const points = pts.map((p) => ({
    x: pad.l + ((parseISODate(p.date).getTime() - t0) / (41 * DAY_MS)) * w,
    y: pad.t + (1 - (p.lb - lo) / span) * h,
  }));
  return { points, path: path(points), change: round(pts.at(-1)!.lb - pts[0].lb, 1) };
}

/* -------------------------------------------------------------- formatting */

function fmtW(lb: number, unit: WeightUnit) {
  return toDisplayWeight(lb, unit).toFixed(1);
}
function fmtBand(b: { min: number; max: number }, unit: WeightUnit) {
  const f = (v: number) => {
    const d = round(toDisplayWeight(v, unit), 1);
    return Number.isInteger(d) ? String(d) : d.toFixed(1);
  };
  return b.min === b.max ? f(b.min) : `${f(b.min)}–${f(b.max)}`;
}

/* ------------------------------------------------------------------ gauge */

export interface GaugeGeometry {
  min: number;
  max: number;
  /** 0–1 positions along the track. */
  window: { from: number; to: number } | null;
  rate: number | null;
  ticks: { v: number; at: number }[];
}

/**
 * The pace gauge (§3.6.1 item 5): a scale from 0 to max(0.8, rate × 1.25) lb a week (down to
 * rate × 1.25 when losing), the corridor window and the current rate. Positions are 0–1.
 */
export function gaugeGeometry(rate: number | null, window: { minRate: number; maxRate: number } | null): GaugeGeometry {
  const hiCand = [0.8, rate != null ? rate * 1.25 : 0, window ? window.maxRate * 1.1 : 0];
  const loCand = [0, rate != null ? rate * 1.25 : 0, window ? window.minRate * 1.1 : 0];
  const max = Math.max(...hiCand);
  const min = Math.min(...loCand);
  const at = (v: number) => (v - min) / (max - min || 1);
  const step = max - min > 1.6 ? 0.4 : 0.2;
  const ticks: { v: number; at: number }[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v = round(v + step, 2)) ticks.push({ v: round(v, 2), at: at(v) });
  return {
    min,
    max,
    window: window ? { from: at(window.minRate), to: at(window.maxRate) } : null,
    rate: rate != null ? at(rate) : null,
    ticks,
  };
}
