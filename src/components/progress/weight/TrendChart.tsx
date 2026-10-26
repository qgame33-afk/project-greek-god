"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Chip } from "@/components/ui/controls";
import type { ISODate } from "@/lib/dates";
import { dayMonth } from "@/lib/progress/pace";
import type { WeightUnit } from "@/lib/units";
import { toDisplayWeight } from "@/lib/units";
import { SrTable } from "../kit";
import { RANGES, chartGeometry, chartSentence, type Range } from "./chart";

/**
 * The "Trend" card (docs/DESIGN-V3-SIMPLE.md §4.5.1 item 2): 1M · 3M · All, grey weigh-in dots,
 * the 7-day average as a white 3 px line ending in a white dot, and the dashed --text-2 line
 * forward labelled once, "If you keep this pace" (only when pace() has a rate). Three labels on
 * the right, months (or Mondays) under it. No legend. The chart is one budget group; tapping it
 * opens All weigh-ins. VoiceOver hears one sentence; the hidden table lists the weigh-ins.
 */
export function TrendChart({
  range,
  onRange,
  today,
  start,
  weighIns,
  series,
  lbPerWeek,
  unit,
  onOpen,
}: {
  range: Range;
  onRange: (r: Range) => void;
  today: ISODate;
  start: ISODate | null;
  weighIns: { date: ISODate; lb: number }[];
  series: { date: ISODate; lb: number }[];
  lbPerWeek: number | null;
  unit: WeightUnit;
  onOpen: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, root: 16 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({ w: Math.round(el.getBoundingClientRect().width), root: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // at accessibility sizes the chart grows (§4.5.7: 240 px) and the labels get the room they need
  const ax = size.root >= 22;
  const height = ax ? 240 : 170;
  const labelWidth = Math.ceil(size.root * 0.775 * 0.62 * 5) + 6;
  const g = useMemo(
    () => (size.w ? chartGeometry({ width: size.w, height, range, today, start, weighIns, series, lbPerWeek, unit, labelWidth }) : null),
    [size.w, height, range, today, start, weighIns, series, lbPerWeek, unit, labelWidth],
  );
  const sentence = g ? chartSentence(g, range, lbPerWeek, unit) : "Weight trend";
  const label = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const rows = useMemo(() => {
    const byDate = new Map(series.map((s) => [s.date, s.lb]));
    return [...weighIns]
      .filter((w) => !g || w.date >= g.from)
      .reverse()
      .slice(0, 31)
      .map((w) => [dayMonth(w.date, today), toDisplayWeight(w.lb, unit).toFixed(1), byDate.has(w.date) ? toDisplayWeight(byDate.get(w.date)!, unit).toFixed(1) : "—"]);
  }, [weighIns, series, g, today, unit]);

  return (
    <section className="rounded-card bg-surface pb-3.5 pl-4 pr-3 pt-4" aria-labelledby="trend-h">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 id="trend-h" className="t-row">
          Trend
        </h2>
        <div className="flex gap-1.5" role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <Chip key={r.key} selected={range === r.key} tone="outline" onClick={() => onRange(r.key)} ariaLabel={`Show ${r.spoken}`}>
              {r.label}
            </Chip>
          ))}
        </div>
      </div>
      <button type="button" onClick={onOpen} className="press-soft block w-full text-left" aria-label={`${sentence} Shows all weigh-ins.`}>
        <div ref={box} data-budget-group="" className="relative w-full" style={{ height: height + 22 }} aria-hidden>
          {g && (
            <>
              <svg width={size.w} height={height} viewBox={`0 0 ${size.w} ${height}`} className="absolute left-0 top-0 overflow-visible">
                {g.yTicks.map((t) => (
                  <line key={t.value} x1={0} x2={g.plot.x + g.plot.w} y1={t.y} y2={t.y} style={{ stroke: "var(--track)" }} strokeWidth={1} />
                ))}
                {g.dots.map((d, i) => (
                  <circle key={i} cx={d.x} cy={d.y} r={2.6} style={{ fill: "var(--text-3)" }} />
                ))}
                {g.line && <path d={g.line} fill="none" style={{ stroke: "var(--text)" }} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
                {g.projection && (
                  <path
                    data-projection=""
                    d={`M${g.projection.a.x},${g.projection.a.y} L${g.projection.b.x},${g.projection.b.y}`}
                    fill="none"
                    style={{ stroke: "var(--text-2)" }}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                )}
                {g.now && <circle cx={g.now.x} cy={g.now.y} r={5} style={{ fill: "var(--text)" }} />}
              </svg>
              {g.yTicks.map((t) => (
                <span key={t.value} className="t-cap absolute right-0 -translate-y-1/2 tabular-nums" style={{ top: t.y }}>
                  {label(t.value)}
                </span>
              ))}
              {g.projection && (
                <span
                  className="t-cap absolute whitespace-nowrap"
                  style={{
                    right: Math.max(0, size.w - g.projection.b.x),
                    top: Math.max(0, Math.min(g.projection.b.y, g.projection.a.y) - size.root * 1.9),
                  }}
                >
                  If you keep this pace
                </span>
              )}
              {g.xTicks.map((t) => (
                <span key={t.label + t.x} className="t-cap absolute bottom-0 -translate-x-1/2 whitespace-nowrap" style={{ left: Math.max(14, Math.min(g.plot.x + g.plot.w - 14, t.x)) }}>
                  {t.label}
                </span>
              ))}
            </>
          )}
        </div>
      </button>
      <SrTable caption={`Weigh-ins and 7-day average in ${unit}`} head={["Date", "Weigh-in", "7-day average"]} rows={rows} />
    </section>
  );
}
