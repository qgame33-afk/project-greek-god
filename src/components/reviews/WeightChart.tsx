"use client";

import { useId } from "react";
import { daysBetween, shortDate } from "@/lib/dates";
import type { MonthWeightSeries } from "@/lib/reviews/compute";
import { formatBodyweight, toDisplayWeight, type WeightUnit } from "@/lib/units";

const H = 116; // plot height (px)
const PAD_Y = 12;
const GRID = [0.2, 0.5, 0.8];

/**
 * The month's bodyweight, drawn the way the Mountain is: weigh-ins as ash dots,
 * the 7-day average as the gold line, and the plan as a dashed line that never looks like
 * data. Fluid without measuring: lines live in a stretched SVG with non-scaling strokes,
 * dots are positioned in percentages, so the chart reflows for any width (and for print).
 */
export function WeightChart({ series, unit }: { series: MonthWeightSeries; unit: WeightUnit }) {
  const gid = useId().replace(/:/g, "");
  const { from, to, points, avg, plan } = series;
  if (points.length < 2) return null;

  const days = Math.max(1, daysBetween(from, to));
  const vals = [...points.map((p) => p.weight), ...avg.map((p) => p.weight), ...(plan ? [plan.from, plan.to] : [])];
  const dataLo = Math.min(...vals);
  const dataHi = Math.max(...vals);
  const span = Math.max(dataHi - dataLo, 1.5);
  const mid = (dataHi + dataLo) / 2;
  const lo = mid - span / 2;
  const hi = mid + span / 2;
  const x = (d: string) => (daysBetween(from, d) / days) * 100; // 0–100
  const y = (v: number) => PAD_Y + (1 - (v - lo) / (hi - lo)) * (H - PAD_Y * 2); // px
  const line = avg.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(2)} ${y(p.weight).toFixed(1)}`).join(" ");
  const area = avg.length > 1 ? `${line} L${x(avg.at(-1)!.date).toFixed(2)} ${H} L${x(avg[0].date).toFixed(2)} ${H} Z` : "";
  const last = avg.at(-1)!;
  const gridY = GRID.map((f) => PAD_Y + f * (H - PAD_Y * 2));
  const valueAt = (py: number) => lo + (1 - (py - PAD_Y) / (H - PAD_Y * 2)) * (hi - lo);
  const label = `Bodyweight, ${shortDate(from, to)} to ${shortDate(to, to)}: ${points.length} weigh-ins between ${formatBodyweight(Math.min(...points.map((p) => p.weight)), unit)} and ${formatBodyweight(Math.max(...points.map((p) => p.weight)), unit)}; 7-day average ${formatBodyweight(last.weight, unit)} on ${shortDate(last.date, to)}.`;
  const dot = (left: number, top: number) => ({ left: `${left}%`, top });

  return (
    <figure className="review-sub mt-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
        <div className="relative mx-1" style={{ height: H }} role="img" aria-label={label}>
          <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id={`${gid}-area`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: "var(--leaf-400)", stopOpacity: 0.16 }} />
                <stop offset="100%" style={{ stopColor: "var(--leaf-400)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            {gridY.map((g) => (
              <line key={g} x1={0} x2={100} y1={g} y2={g} style={{ stroke: "var(--vein)" }} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" className="review-chart-grid" />
            ))}
            {area && <path d={area} fill={`url(#${gid}-area)`} />}
            {plan && (
              <line
                x1={0}
                x2={100}
                y1={y(plan.from)}
                y2={y(plan.to)}
                style={{ stroke: "var(--ui-line)" }}
                strokeWidth={1.5}
                strokeDasharray="4 6"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path d={line} fill="none" style={{ stroke: "var(--leaf-300)" }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {points.map((p) => (
            <span key={p.date} className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ash" style={dot(x(p.date), y(p.weight))} aria-hidden />
          ))}
          <span className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-leaf-tint" style={dot(x(last.date), y(last.weight))} aria-hidden />
          <span className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-leaf-100" style={dot(x(last.date), y(last.weight))} aria-hidden />
        </div>
        <div className="tnum relative w-10 text-right t-meta font-medium text-stone" style={{ height: H }} aria-hidden>
          {gridY.map((g) => (
            <span key={g} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: g }}>
              {toDisplayWeight(valueAt(g), unit).toFixed(1)}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 t-meta font-medium text-stone">
        <span className="tnum uppercase tracking-[0.06em]">
          {shortDate(from, to)} – {shortDate(to, to)}
        </span>
        <span className="flex items-center gap-3" aria-hidden>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-ash" />
            Weigh-ins
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-leaf-300" />
            7-day avg
          </span>
          {plan && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 border-t border-dashed border-ui-line" />
              Plan
            </span>
          )}
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>Latest weigh-ins this month</caption>
        <tbody>
          {points.slice(-7).map((p) => (
            <tr key={p.date}>
              <th scope="row">{shortDate(p.date, to)}</th>
              <td>{formatBodyweight(p.weight, unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
