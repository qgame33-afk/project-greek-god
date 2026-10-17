"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { monthName, parseISODate, type ISODate } from "@/lib/dates";
import type { Terrace } from "@/lib/progress/pace";
import { round, toDisplayWeight, type WeightUnit } from "@/lib/units";

/**
 * Chapter III's mini mountain: the month's 7-day trend (trendSeries, leaf) over its weigh-ins
 * (ash dots), with the terrace contours that fall in range (leaf once reached by the month's
 * end). Plain SVG on CSS variables; the caller supplies the sentence for VoiceOver.
 */
export function MiniMountain({
  from,
  to,
  series,
  weighIns,
  terraces,
  unit,
  height = 176,
}: {
  from: ISODate;
  to: ISODate;
  series: { date: ISODate; lb: number }[];
  weighIns: { date: ISODate; lb: number }[];
  terraces: Pick<Terrace, "index" | "numeral" | "lb" | "reachedOn">[];
  unit: WeightUnit;
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setW(Math.round(el.getBoundingClientRect().width));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => {
    if (w < 80 || series.length === 0) return null;
    const plot = { x: 4, y: 12, w: w - 4 - 34, h: height - 12 - 26 };
    const t0 = parseISODate(from).getTime();
    const span = Math.max(1, parseISODate(to).getTime() - t0);
    const x = (d: ISODate) => plot.x + ((parseISODate(d).getTime() - t0) / span) * plot.w;
    const vals = [...series.map((s) => s.lb), ...weighIns.map((p) => p.lb)];
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (hi - lo < 3) {
      const mid = (hi + lo) / 2;
      lo = mid - 1.5;
      hi = mid + 1.5;
    }
    lo -= (hi - lo) * 0.12;
    hi += (hi - lo) * 0.12;
    const y = (lb: number) => plot.y + (1 - (lb - lo) / (hi - lo)) * plot.h;
    const line = series.map((s) => ({ x: x(s.date), y: y(s.lb) }));
    const path = line.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");
    const contours = terraces.filter((t) => t.lb >= lo && t.lb <= hi).map((t) => ({ ...t, y: y(t.lb), reached: !!t.reachedOn && t.reachedOn <= to }));
    const first = series[0];
    const last = series.at(-1)!;
    return { plot, line, path, contours, dots: weighIns.map((p) => ({ x: x(p.date), y: y(p.lb), d: p.date })), first, last, base: plot.y + plot.h, x, y };
  }, [w, height, from, to, series, weighIns, terraces]);

  const fmt = (lb: number) => round(toDisplayWeight(lb, unit), 1).toFixed(1);
  const label = (d: ISODate) => `${parseISODate(d).getDate()} ${monthName(d, true)}`;

  return (
    <div ref={box} className="relative w-full" style={{ height }} aria-hidden>
      {g && (
        <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} className="absolute inset-0 overflow-visible">
          {g.contours.map((t) => (
            <g key={t.index}>
              <line
                x1={g.plot.x}
                x2={g.plot.x + g.plot.w}
                y1={t.y}
                y2={t.y}
                style={{ stroke: t.reached ? "var(--leaf-300)" : "var(--ui-line)", strokeOpacity: t.reached ? 0.6 : 0.8 }}
                strokeDasharray={t.reached ? undefined : "1 4"}
              />
              <text x={g.plot.x + g.plot.w + 8} y={t.y} dy="0.35em" className="t-meta font-voice" style={{ fill: t.reached ? "var(--leaf-300)" : "var(--stone)", fontWeight: 600 }}>
                {t.numeral}
              </text>
            </g>
          ))}
          <line x1={g.plot.x} x2={g.plot.x + g.plot.w} y1={g.base} y2={g.base} style={{ stroke: "var(--ui-line)" }} />
          {g.dots.map((d) => (
            <circle key={d.d} cx={d.x} cy={d.y} r={1.8} style={{ fill: "var(--ash)", fillOpacity: 0.8 }} />
          ))}
          {g.line.length > 1 && (
            <path
              d={g.path}
              pathLength={1}
              strokeDasharray="1 1"
              className="mtn-inscribe"
              fill="none"
              style={{ stroke: "var(--leaf-300)" }}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          <rect
            x={g.line.at(-1)!.x - 4.5}
            y={g.line.at(-1)!.y - 4.5}
            width={9}
            height={9}
            transform={`rotate(45 ${g.line.at(-1)!.x} ${g.line.at(-1)!.y})`}
            style={{ fill: "var(--leaf-100)", stroke: "var(--obsidian)" }}
            strokeWidth={2}
          />
          <text x={g.plot.x} y={g.base + 18} className="t-meta" style={{ fill: "var(--stone)" }}>
            {label(from)}
          </text>
          <text x={g.plot.x + g.plot.w} y={g.base + 18} textAnchor="end" className="t-meta" style={{ fill: "var(--stone)" }}>
            {label(to)}
          </text>
          <text x={g.line[0].x + 2} y={g.line[0].y + 18} className="t-meta tnum" style={{ fill: "var(--stone)" }}>
            {fmt(g.first.lb)}
          </text>
          <text x={g.line.at(-1)!.x - 8} y={g.line.at(-1)!.y - 12} textAnchor="end" className="t-meta tnum" style={{ fill: "var(--ivory)", fontWeight: 600 }}>
            {fmt(g.last.lb)}
          </text>
        </svg>
      )}
      <style>{`.mtn-inscribe { stroke-dashoffset: 0; animation: inscribe-draw var(--dur-inscribe) var(--ease-out) 200ms both; }`}</style>
    </div>
  );
}
