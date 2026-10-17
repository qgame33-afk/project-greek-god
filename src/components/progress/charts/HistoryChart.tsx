"use client";

import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { cn } from "@/lib/cn";
import { monthName, parseISODate, type ISODate } from "@/lib/dates";

export interface HistoryPoint {
  date: ISODate;
  value: number | null;
  /** A record set on this day: a leaf diamond. */
  pr?: boolean;
  /** Optional quiet bar under the line (session volume). */
  bar?: number;
}

/**
 * One logged series over time (a lift's e1RM, a jump, a measurement), drawn as plain SVG on
 * the instrument: straight segments between real entries (nothing implied between them), ash
 * dots, leaf diamonds on records, optional volume bars in the bottom third, a right-hand value
 * axis and dated ticks. Touch or hover scrubs to the nearest entry. Colours are CSS variables;
 * the caller renders the SrTable.
 */
export function HistoryChart({
  points,
  format,
  invert = false,
  height = 184,
  decimals = 0,
  readout = "always",
  className,
}: {
  points: HistoryPoint[];
  format: (v: number) => string;
  /** Lower values plot higher (sprint times). */
  invert?: boolean;
  height?: number;
  decimals?: number;
  /** "always": the latest entry is read out above the plot until scrubbed; "scrub": only while scrubbing. */
  readout?: "always" | "scrub";
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setW(Math.round(el.getBoundingClientRect().width));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => geometry(points, w, height, invert, decimals), [points, w, height, invert, decimals]);
  const active = hover != null ? g?.pts[hover] : readout === "always" ? g?.pts.at(-1) : undefined;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!g) return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < g.pts.length; i++) if (Math.abs(g.pts[i].x - x) < Math.abs(g.pts[best].x - x)) best = i;
    setHover(best);
  };

  return (
    <div ref={box} className={cn("relative w-full select-none", className)} style={{ height }}>
      {g && (
        <svg
          width={w}
          height={height}
          viewBox={`0 0 ${w} ${height}`}
          className="absolute inset-0 touch-pan-y overflow-visible"
          aria-hidden
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {g.yTicks.map((t) => (
            <g key={t.v}>
              <line x1={g.plot.x} x2={g.plot.x + g.plot.w} y1={t.y} y2={t.y} style={{ stroke: "var(--vein)" }} />
              <text x={g.plot.x + g.plot.w + 6} y={t.y} dy="0.35em" className="t-meta tnum" style={{ fill: "var(--stone)" }}>
                {t.label}
              </text>
            </g>
          ))}
          <line x1={g.plot.x} x2={g.plot.x + g.plot.w} y1={g.base} y2={g.base} style={{ stroke: "var(--ui-line)" }} />
          {g.xTicks.map((t, i) => (
            <text
              key={t.date}
              x={t.x}
              y={g.base + 17}
              textAnchor={i === 0 && g.xTicks.length > 1 ? "start" : i === g.xTicks.length - 1 && g.xTicks.length > 1 ? "end" : "middle"}
              className="t-meta"
              style={{ fill: "var(--stone)" }}
            >
              {t.label}
            </text>
          ))}
          {g.bars.map((b) => (
            <rect key={b.date} x={b.x - b.w / 2} y={g.base - b.h} width={b.w} height={b.h} rx={1.5} style={{ fill: "var(--vein-3)" }} />
          ))}
          {g.path && <path d={g.path} fill="none" style={{ stroke: "var(--leaf-300)" }} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />}
          {active && <line x1={active.x} x2={active.x} y1={g.plot.y} y2={g.base} style={{ stroke: "var(--ui-line)" }} strokeDasharray="1 3" />}
          {g.pts.map((p, i) =>
            p.pr ? (
              <rect
                key={p.date + i}
                x={p.x - 5}
                y={p.y - 5}
                width={10}
                height={10}
                transform={`rotate(45 ${p.x} ${p.y})`}
                style={{ fill: "var(--leaf-300)", stroke: "var(--night)" }}
                strokeWidth={1.5}
              />
            ) : (
              <circle
                key={p.date + i}
                cx={p.x}
                cy={p.y}
                r={p === active ? 4 : 2.75}
                style={{
                  fill: p === active ? "var(--ivory)" : "var(--ash)",
                  stroke: "var(--night)",
                }}
                strokeWidth={1.5}
              />
            ),
          )}
        </svg>
      )}
      {/* the scrubbed (or latest) entry, read out above the plot so it never covers a mark */}
      {g && active && (
        <span className="pointer-events-none absolute left-0 top-0 flex items-baseline gap-1.5 whitespace-nowrap" aria-hidden>
          <span className="t-callout tnum font-semibold text-ivory">{format(active.value)}</span>
          <span className="t-meta text-stone">
            {shortDay(active.date)}
            {active.pr ? " · record" : ""}
          </span>
        </span>
      )}
    </div>
  );
}

const shortDay = (d: ISODate) => `${parseISODate(d).getDate()} ${monthName(d, true)}`;

function geometry(points: HistoryPoint[], w: number, h: number, invert: boolean, decimals: number) {
  const vals = points.filter((p): p is HistoryPoint & { value: number } => p.value != null);
  if (w < 80 || !vals.length) return null;
  const plot = {
    x: 6,
    y: 36,
    w: Math.max(40, w - 6 - 40),
    h: Math.max(40, h - 36 - 24),
  };
  const base = plot.y + plot.h;
  const t = (d: ISODate) => parseISODate(d).getTime();
  const t0 = t(points[0].date);
  const t1 = t(points.at(-1)!.date);
  const span = Math.max(1, t1 - t0);
  const pad = points.length === 1 ? plot.w / 2 : 8;
  const x = (d: ISODate) => (points.length === 1 ? plot.x + plot.w / 2 : plot.x + pad + ((t(d) - t0) / span) * (plot.w - pad * 2));

  const lo0 = Math.min(...vals.map((p) => p.value));
  const hi0 = Math.max(...vals.map((p) => p.value));
  const minSpan = decimals >= 2 ? 0.2 : decimals === 1 ? 1 : 4;
  const range = Math.max(hi0 - lo0, minSpan);
  const mid = (hi0 + lo0) / 2;
  const step = niceStep(range / 3);
  const lo = Math.floor((mid - range / 2 - range * 0.15) / step) * step;
  const hi = Math.ceil((mid + range / 2 + range * 0.15) / step) * step;
  // the line lives in the top two thirds when bars are drawn under it
  const hasBars = points.some((p) => (p.bar ?? 0) > 0);
  const lineH = hasBars ? plot.h * 0.72 : plot.h;
  const y = (v: number) => {
    const f = (v - lo) / (hi - lo || 1);
    return plot.y + (invert ? f : 1 - f) * lineH;
  };
  const yTicks: { v: number; y: number; label: string }[] = [];
  for (let v = lo; v <= hi + step * 1e-6 && yTicks.length < 6; v = Math.round((v + step) * 1000) / 1000)
    yTicks.push({
      v,
      y: y(v),
      label: v.toFixed(step < 1 ? (step < 0.1 ? 2 : 1) : 0),
    });

  const pts = vals.map((p) => ({
    date: p.date,
    value: p.value,
    pr: !!p.pr,
    x: x(p.date),
    y: y(p.value),
  }));
  const path = pts.length > 1 ? pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("") : null;

  const bMax = Math.max(1, ...points.map((p) => p.bar ?? 0));
  const bw = Math.max(2, Math.min(10, (plot.w / Math.max(1, points.length)) * 0.5));
  const bars = hasBars
    ? points
        .filter((p) => (p.bar ?? 0) > 0)
        .map((p) => ({
          date: p.date,
          x: x(p.date),
          w: bw,
          h: ((p.bar ?? 0) / bMax) * plot.h * 0.24,
        }))
    : [];

  // up to 4 dated ticks, evenly through the entries
  const n = Math.min(4, points.length);
  const idx = n <= 1 ? [0] : Array.from({ length: n }, (_, i) => Math.round((i / (n - 1)) * (points.length - 1)));
  const xTicks = [...new Set(idx)].map((i) => ({
    date: points[i].date,
    x: x(points[i].date),
    label: shortDay(points[i].date),
  }));

  return { plot, base, pts, path, yTicks, xTicks, bars };
}

function niceStep(raw: number) {
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
}
