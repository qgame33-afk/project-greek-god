"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { parseISODate } from "@/lib/dates";
import type { StrengthSeries } from "@/lib/training/volume";

export interface ChartDatum {
  date: string;
  value: number | null;
  pr: boolean;
}

/**
 * One lift's strength line (docs/DESIGN-V3-SIMPLE.md §4.3.11): one white line with dots, two
 * gridlines, labels on the right in --text-2. No bars, no colour, no gold. Values arrive in the
 * display unit. The card around it carries the VoiceOver sentence and the hidden data table.
 */
export default function ExerciseChart({ data: rows, metric }: { data: ChartDatum[]; metric: StrengthSeries["metric"] }) {
  const data = useMemo(() => rows.map((d) => ({ ...d, t: parseISODate(d.date).getTime() })), [rows]);
  const values = data.map((d) => d.value).filter((v): v is number => v != null);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const round = metric === "reps" ? 1 : 5;
  const a = Math.floor(lo / round) * round;
  const b = Math.max(a + round, Math.ceil(hi / round) * round);
  const span = data.length > 1 ? data[data.length - 1].t - data[0].t : 86_400_000;
  const pad = span * 0.04 || 86_400_000;
  return (
    <div className="h-40 select-none [&_.recharts-cartesian-grid-horizontal_line]:stroke-(--line) [&_.recharts-surface]:outline-none" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 0, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={[data[0]?.t - pad, data[data.length - 1]?.t + pad]} hide />
          <YAxis
            orientation="right"
            axisLine={false}
            tickLine={false}
            width={40}
            ticks={[a, b]}
            domain={[a - (b - a) * 0.15, b + (b - a) * 0.15]}
            interval={0}
            tick={{ style: { fill: "var(--text-2)", fontFamily: "var(--font-sans-stack)", fontSize: 13, fontVariantNumeric: "tabular-nums" } }}
          />
          <Line
            dataKey="value"
            type="linear"
            connectNulls
            isAnimationActive={false}
            style={{ stroke: "var(--text)" }}
            strokeWidth={2.5}
            dot={(p: { cx?: number; cy?: number; index?: number }) => (p.cx == null || p.cy == null ? <g key={`d-${p.index}`} /> : <circle key={`d-${p.index}`} cx={p.cx} cy={p.cy} r={3.5} style={{ fill: "var(--text)", stroke: "var(--card)" }} strokeWidth={1.5} />)}
            activeDot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
