"use client";

// Lazy-loaded (Recharts). Weigh-ins as marble dots, the 7-day average as a gold line over a
// fading area, and the optional PLAN line in dashed gold-700 that never looks like data.
// Scrubbing drives the hero number through a callback (no React state per frame).

import { useEffect, useRef, useState } from "react";
import { Area, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, usePlotArea, useXAxisInverseScale, useXAxisScale, useYAxisScale } from "recharts";
import { tickLabel, type WeightRow } from "@/lib/progress/weightSeries";
import { XTick, YTick, yTicks } from "../charts/ticks";

export interface WeightChartProps {
  rows: WeightRow[];
  domainX: [number, number];
  domainY: [number, number];
  ticksX: number[];
  showPlan: boolean;
  unit: string;
  /** Called with the scrubbed row (null on release). */
  onScrub: (row: WeightRow | null) => void;
  /** Hover-capable pointer (desktop): mouse scrubbing through the tooltip, plus a small tooltip. */
  tooltip: boolean;
}

const GOLD = "#D5AC67";

export default function WeightChart({ rows, domainX, domainY, ticksX, showPlan, unit, onScrub, tooltip }: WeightChartProps) {
  // Animate on first render only, and never above 120 points (DESIGN §4).
  const [animate, setAnimate] = useState(rows.length <= 120);
  useEffect(() => {
    const t = window.setTimeout(() => setAnimate(false), 1100);
    return () => window.clearTimeout(t);
  }, []);
  const [active, setActive] = useState(false);
  // Recharts keeps its own hover index after touch taps (and from a resting cursor on load);
  // its active dots follow that index, so they're only drawn while the desktop tooltip is live.
  // Touch scrubbing draws its own markers (TouchScrubber).
  const hover = tooltip && active;
  // Recharts draws a dot for a one-point series even with dot={false}; on the plan's first day
  // that lone plan point would read as a weigh-in, so the plan needs two points to show.
  const planLine = showPlan && rows.filter((r) => r.plan != null).length >= 2;
  const picker = useRef<Picker | null>(null);
  // Last row the tooltip reported; cleared on leave so re-hovering the same point scrubs again.
  const sinkLast = useRef<string | null>(null);
  // If the chart re-renders with new data or unmounts mid-scrub (no mouseleave fires), the hero
  // must not stay on a past weigh-in.
  useEffect(() => () => onScrub(null), [onScrub]);
  const leave = () => {
    sinkLast.current = null;
    setActive(false);
    onScrub(null);
  };
  const svgLeft = (el: HTMLElement) => el.querySelector("svg.recharts-surface")?.getBoundingClientRect().left ?? el.getBoundingClientRect().left;
  const touch = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    picker.current?.(e.clientX, svgLeft(e.currentTarget));
  };
  const release = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    picker.current?.(null);
  };

  return (
    <div
      className="h-full w-full [&_.recharts-surface]:outline-none [&_*:focus]:outline-none"
      onTouchEnd={leave}
      onMouseLeave={leave}
      onTouchStart={() => setActive(true)}
      onMouseEnter={() => setActive(true)}
      onPointerDown={touch}
      onPointerMove={touch}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 10, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id="pgg-avg-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity={0.22} />
              <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgb(255 255 255 / .05)" strokeDasharray="3 5" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={domainX}
            ticks={ticksX}
            tickFormatter={tickLabel}
            axisLine={false}
            tickLine={false}
            tick={<XTick count={ticksX.length} />}
            height={22}
            interval={0}
            padding={{ left: 4, right: 4 }}
          />
          <YAxis orientation="right" domain={[yTicks(domainY)[0], yTicks(domainY).at(-1)!]} ticks={yTicks(domainY)} axisLine={false} tickLine={false} tick={<YTick />} width={36} interval={0} />
          <Tooltip
            cursor={tooltip ? { stroke: GOLD, strokeWidth: 1 } : false}
            isAnimationActive={false}
            // Touch screens fire emulated mouse events after a tap, which would leave Recharts'
            // hover state (and the hero) stuck on a past weigh-in. There, only the pointer-driven
            // TouchScrubber below scrubs, and it always restores the latest value on release.
            active={tooltip && active ? undefined : false}
            content={<ScrubSink onScrub={onScrub} tooltip={tooltip} unit={unit} lastRef={sinkLast} />}
          />
          <Area dataKey="avg" type="monotone" stroke="none" fill="url(#pgg-avg-fill)" connectNulls isAnimationActive={animate} animationDuration={700} activeDot={false} />
          {planLine && (
            <Line dataKey="plan" type="linear" stroke="var(--gold-700)" strokeWidth={1.5} strokeDasharray="4 6" dot={false} activeDot={false} connectNulls isAnimationActive={false} />
          )}
          <Line
            dataKey="avg"
            type="monotone"
            stroke={GOLD}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={animate}
            animationDuration={700}
            activeDot={hover ? { r: 4, fill: "#F3DDA8", stroke: "#08090C", strokeWidth: 2 } : false}
          />
          <Line
            dataKey="weight"
            stroke="none"
            isAnimationActive={false}
            dot={{ r: 2.75, fill: "rgb(230 225 214 / .55)", stroke: "none" }}
            activeDot={hover ? { r: 4.5, fill: "#E6E1D6", stroke: "#08090C", strokeWidth: 2 } : false}
          />
          <TouchScrubber rows={rows} onScrub={onScrub} registerRef={picker} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

type Picker = (clientX: number | null, svgLeft?: number) => void;

/**
 * Finger scrubbing via Pointer Events (reliable on iOS and Android; vertical drags still
 * scroll the page because the frame is touch-action: pan-y). The wrapper div forwards
 * touch/pen positions here; mouse hover stays with the Recharts tooltip.
 */
function TouchScrubber({ rows, onScrub, registerRef }: { rows: WeightRow[]; onScrub: (row: WeightRow | null) => void; registerRef: React.RefObject<Picker | null> }) {
  const area = usePlotArea();
  const xs = useXAxisScale();
  const ys = useYAxisScale();
  const inv = useXAxisInverseScale();
  const [hit, setHit] = useState<WeightRow | null>(null);
  const hitRef = useRef<WeightRow | null>(null);

  useEffect(() => {
    registerRef.current = (clientX, svgLeft = 0) => {
      let next: WeightRow | null = null;
      if (clientX != null && inv) {
        const t = Number(inv(clientX - svgLeft));
        for (const r of rows) if (r.weight != null && (!next || Math.abs(r.t - t) < Math.abs(next.t - t))) next = r;
      }
      if (next === hitRef.current) return;
      hitRef.current = next;
      setHit(next);
      onScrub(next);
    };
    return () => {
      registerRef.current = null;
    };
  }, [registerRef, inv, rows, onScrub]);

  if (!area || !xs || !ys || !hit) return null;
  const x = Number(xs(hit.t));
  if (!Number.isFinite(x)) return null;
  return (
    <g pointerEvents="none">
      <line x1={x} x2={x} y1={area.y} y2={area.y + area.height} stroke={GOLD} strokeWidth={1} />
      {hit.avg != null && <circle cx={x} cy={Number(ys(hit.avg))} r={4} fill="#F3DDA8" stroke="#08090C" strokeWidth={2} />}
      <circle cx={x} cy={Number(ys(hit.weight!))} r={4.5} fill="#E6E1D6" stroke="#08090C" strokeWidth={2} />
    </g>
  );
}

interface SinkProps {
  active?: boolean;
  payload?: { payload?: WeightRow }[];
  onScrub: (row: WeightRow | null) => void;
  tooltip: boolean;
  unit: string;
  lastRef: React.RefObject<string | null>;
}

/** Tooltip content that reports the scrubbed row upward; renders a tooltip only on desktop. */
function ScrubSink({ active, payload, onScrub, tooltip, unit, lastRef }: SinkProps) {
  const row = active ? (payload?.[0]?.payload ?? null) : null;
  useEffect(() => {
    const k = row ? row.date : null;
    if (k === lastRef.current) return;
    lastRef.current = k;
    onScrub(row);
  }, [row, onScrub, lastRef]);
  if (!tooltip || !row || (row.weight == null && row.avg == null && row.plan == null)) return null;
  return (
    <div className="rounded-[12px] border border-line-strong bg-s3 px-3 py-2 shadow-[var(--e2)]">
      <p className="eyebrow mb-1">{tickLabel(row.t)}</p>
      {row.weight != null && (
        <p className="num text-[15px] font-semibold text-fg">
          {row.weight.toFixed(1)} <span className="font-sans text-[11px] font-medium text-fg-2">{unit}</span>
        </p>
      )}
      {row.avg != null && <p className="text-[12px] font-medium text-fg-2">7-day avg {row.avg.toFixed(1)}</p>}
      {row.plan != null && <p className="text-[12px] font-medium text-fg-3">Plan {row.plan.toFixed(1)}</p>}
      {row.note && <p className="mt-1 max-w-48 text-[12px] font-medium text-fg-3">{row.note}</p>}
    </div>
  );
}
