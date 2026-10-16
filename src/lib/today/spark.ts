// Recent-trend sparkline for the transformation card: raw weigh-ins as dots plus the 7-day
// rolling average as a line, scaled into a small SVG box. Only logged rows are plotted.

import { rollingAverage, type WeighIn } from "@/lib/bodyweight";
import { addDays, daysBetween, type ISODate } from "@/lib/dates";

export interface SparkPoint {
  x: number;
  y: number;
  date: ISODate;
  lb: number;
}

export interface Spark {
  dots: SparkPoint[];
  avg: SparkPoint[];
  /** SVG path for the average line ("" when fewer than 2 points). */
  avgPath: string;
  min: number;
  max: number;
  from: ISODate;
  to: ISODate;
}

/**
 * Weigh-ins in the `days`-day window ending `today`, scaled to width × height with `pad`
 * vertical padding. Null when fewer than 2 weigh-ins fall in the window (no line to draw).
 */
export function sparkSeries(weights: WeighIn[], today: ISODate, days = 28, width = 300, height = 56, pad = 6): Spark | null {
  const from = addDays(today, -(days - 1));
  const sorted = [...weights].filter((w) => Number.isFinite(Number(w.weight_lb))).sort((a, b) => a.local_date.localeCompare(b.local_date));
  const inWin = sorted.filter((w) => w.local_date >= from && w.local_date <= today);
  if (inWin.length < 2) return null;
  // Average uses the full history so the first days of the window aren't under-sampled.
  const avgAll = rollingAverage(sorted.filter((w) => w.local_date <= today));
  const avgWin = avgAll.filter((a) => a.local_date >= from);
  const values = [...inWin.map((w) => Number(w.weight_lb)), ...avgWin.map((a) => a.avg)];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1) {
    const mid = (max + min) / 2;
    min = mid - 0.5;
    max = mid + 0.5;
  }
  const span = Math.max(1, days - 1);
  const X = (d: ISODate) => Math.round((daysBetween(from, d) / span) * width * 10) / 10;
  const Y = (v: number) => Math.round((pad + (1 - (v - min) / (max - min)) * (height - pad * 2)) * 10) / 10;
  const dots = inWin.map((w) => ({ x: X(w.local_date), y: Y(Number(w.weight_lb)), date: w.local_date, lb: Number(w.weight_lb) }));
  const avg = avgWin.map((a) => ({ x: X(a.local_date), y: Y(a.avg), date: a.local_date, lb: a.avg }));
  const avgPath = avg.length >= 2 ? avg.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("") : "";
  return { dots, avg, avgPath, min, max, from, to: today };
}
