"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMediaQuery } from "@/components/ui/sheet";
import { shortDate } from "@/lib/dates";
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
  data,
  metric,
  bars,
  onScrub,
}: {
  data: ChartDatum[];
  metric: StrengthSeries["metric"];
  bars: StrengthSeries["bars"];
  onScrub: (index: number | null) => void;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const height = desktop ? 300 : 220;
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
            dataKey="date"
            axisLine={false}
            tickLine={false}
            minTickGap={28}
            tickMargin={8}
            tick={{ fill: "var(--text-3)", fontSize: 11, fontFamily: "var(--font-num)", letterSpacing: "0.04em" }}
            tickFormatter={(d: string) => shortDate(d).toUpperCase()}
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
          <Tooltip content={() => null} cursor={{ stroke: "var(--gold-400)", strokeWidth: 1 }} isAnimationActive={false} />
          <Bar yAxisId="bar" dataKey="bar" fill="var(--s-verdigris)" fillOpacity={0.28} radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={animate} animationDuration={600} />
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
