"use client";

import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMediaQuery } from "@/components/ui/sheet";
import { parseISODate, shortDate, toISODate } from "@/lib/dates";
import { formatInt } from "@/lib/units";
import { niceTicks, type StrengthSeries } from "@/lib/training/volume";

export interface ChartDatum {
  date: string;
  value: number | null;
  bar: number;
  pr: boolean;
}

/**
 * e1RM (or top weight / best reps) line over volume bars, gold PR diamonds (DESIGN §5.11).
 * Values arrive already converted to the display unit. Scrubbing calls `onScrub(index)` so the
 * card's hero number can be written through refs; `onScrub(null)` on release.
 */
export default function ExerciseChart({
  data: rows,
  metric,
  bars,
  unit,
  onScrub,
}: {
  data: ChartDatum[];
  metric: StrengthSeries["metric"];
  bars: StrengthSeries["bars"];
  /** Display unit for loads ("lb" | "kg"); used by the desktop tooltip. */
  unit: string;
  onScrub: (index: number | null) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const height = desktop ? 300 : 220;
  // A real time axis: a 4-day gap is drawn shorter than a 7-day one.
  const data = useMemo(() => rows.map((d) => ({ ...d, t: parseISODate(d.date).getTime() })), [rows]);
  const xTicks = useMemo(() => {
    if (data.length <= 5) return data.map((d) => d.t);
    const n = desktop ? 6 : 4;
    const idx = Array.from({ length: n }, (_, i) => Math.round((i * (data.length - 1)) / (n - 1)));
    return [...new Set(idx)].map((i) => data[i].t);
  }, [data, desktop]);
  const span = data.length > 1 ? data[data.length - 1].t - data[0].t : 1;
  const xPad = span * 0.04 || 86_400_000;
  const animate = data.length <= 120;
  const values = data.map((d) => d.value).filter((v): v is number => v != null);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const pad = Math.max(1, (hi - lo) * 0.12);
  const raw = niceTicks(Math.max(0, lo - pad), hi + pad, 4);
  const ticks = metric === "reps" ? [...new Set(raw.map((t) => Math.round(t)))] : raw;
  const maxBar = Math.max(1, ...data.map((d) => d.bar));

  const scrub = (s: { activeTooltipIndex?: number | string | null }) => {
    const i = s.activeTooltipIndex == null ? NaN : Number(s.activeTooltipIndex);
    onScrub(Number.isFinite(i) ? i : null);
  };

  return (
    <div style={{ height }} className="-mx-1 select-none [&_.recharts-surface]:outline-none" onMouseLeave={() => onScrub(null)} onTouchEnd={() => onScrub(null)} onTouchCancel={() => onScrub(null)}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 0, bottom: 0, left: 0 }} onMouseMove={scrub} onTouchMove={scrub} onClick={scrub}>
          <defs>
            <linearGradient id="ex-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#A97E40" />
              <stop offset="0.6" stopColor="#D5AC67" />
              <stop offset="1" stopColor="#F3DDA8" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgb(255 255 255 / .05)" strokeDasharray="3 5" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[data[0].t - xPad, data[data.length - 1].t + xPad]}
            ticks={xTicks}
            axisLine={false}
            tickLine={false}
            minTickGap={20}
            tickMargin={8}
            tick={{ fill: "var(--text-3)", fontSize: 11, fontFamily: "var(--font-num)", letterSpacing: "0.04em" }}
            tickFormatter={(t: number) => shortDate(toISODate(new Date(t))).toUpperCase()}
          />
          <YAxis yAxisId="bar" hide domain={[0, maxBar * 2.6]} />
          <YAxis
            yAxisId="line"
            orientation="right"
            axisLine={false}
            tickLine={false}
            width={40}
            ticks={ticks}
            domain={[ticks[0] ?? 0, ticks[ticks.length - 1] ?? 1]}
            interval={0}
            tick={{ fill: "var(--text-3)", fontSize: 11, fontFamily: "var(--font-num)" }}
          />
          <Tooltip
            content={desktop ? (p: { active?: boolean; payload?: readonly { payload?: ChartDatum }[] }) => <DesktopTip active={p.active} datum={p.payload?.[0]?.payload} metric={metric} bars={bars} unit={unit} /> : () => null}
            cursor={{ stroke: "var(--gold-400)", strokeWidth: 1 }}
            isAnimationActive={false}
            offset={16}
          />
          <Bar yAxisId="bar" dataKey="bar" fill="var(--s-verdigris)" fillOpacity={0.28} radius={[3, 3, 0, 0]} barSize={desktop ? 12 : 8} isAnimationActive={animate} animationDuration={600} />
          <Line
            yAxisId="line"
            dataKey="value"
            type="monotone"
            stroke="url(#ex-line)"
            strokeWidth={2}
            connectNulls
            isAnimationActive={animate}
            animationDuration={900}
            dot={(p: { cx?: number; cy?: number; index?: number; payload?: ChartDatum }) => {
              const { cx, cy, payload, index } = p;
              if (cx == null || cy == null || !payload || payload.value == null) return <g key={`d-${index}`} />;
              if (payload.pr)
                return (
                  <g key={`d-${index}`} transform={`translate(${cx} ${cy}) rotate(45)`}>
                    <rect x={-4.5} y={-4.5} width={9} height={9} fill="#E2C185" stroke="#08090C" strokeWidth={1.5} />
                  </g>
                );
              return data.length <= 40 ? <circle key={`d-${index}`} cx={cx} cy={cy} r={2.5} fill="#D5AC67" stroke="#08090C" strokeWidth={1} /> : <g key={`d-${index}`} />;
            }}
            activeDot={{ r: 5, fill: "#F3DDA8", stroke: "#08090C", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <span className="sr-only">
        {metric === "e1rm" ? "Estimated one-rep max" : metric === "weight" ? "Top weight" : "Best reps"} line over {bars === "volume" ? "volume" : "sets"} bars.
      </span>
    </div>
  );
}

/** Small desktop tooltip (DESIGN §5.11: desktop also shows a tooltip while scrubbing). */
function DesktopTip({ active, datum, metric, bars, unit }: { active?: boolean; datum?: ChartDatum; metric: StrengthSeries["metric"]; bars: StrengthSeries["bars"]; unit: string }) {
  if (!active || !datum) return null;
  const label = metric === "e1rm" ? "e1RM" : metric === "weight" ? "Top" : "Best";
  const v = datum.value == null ? "—" : Number.isInteger(datum.value) ? String(datum.value) : datum.value.toFixed(1);
  return (
    <div className="rounded-[12px] border border-line-strong bg-s3 px-3 py-2 shadow-[var(--e2)]">
      <p className="eyebrow">{shortDate(datum.date)}</p>
      <p className="num mt-1 text-[17px] font-semibold leading-none">
        {v}
        <span className="unit">{metric === "reps" ? "reps" : unit}</span>
        <span className="ml-1.5 text-[11px] font-bold uppercase tracking-[.1em] text-fg-3">{label}</span>
      </p>
      <p className="mt-1 text-[12px] text-fg-2">
        {bars === "volume" ? `${formatInt(datum.bar)} ${unit} volume` : `${datum.bar} sets`}
        {datum.pr ? " · Record" : ""}
      </p>
    </div>
  );
}
