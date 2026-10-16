"use client";

// Lazy-loaded (Recharts). Session volume as quiet bars, the strength line (e1RM, top load or
// best reps) in gold, and gold-leaf diamonds on the sessions that set a real record.

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addDays, parseISODate } from "@/lib/dates";
import { tickLabel, xTicks } from "@/lib/progress/weightSeries";
import { XTick, YTick } from "../charts/ticks";

export interface StrengthPoint {
  date: string;
  t: number;
  metric: number | null;
  volume: number;
  pr: boolean;
}

export default function StrengthChart({ points, metricLabel, volumeLabel, format }: { points: StrengthPoint[]; metricLabel: string; volumeLabel: string; format: (v: number) => string }) {
  const first = points[0]?.date;
  const last = points.at(-1)?.date;
  if (!first || !last) return null;
  const from = first === last ? addDays(first, -3) : first;
  const to = first === last ? addDays(last, 3) : last;
  const ticks = xTicks(from, to, 4);
  const vals = points.map((p) => p.metric).filter((v): v is number => v != null);
  const lo = vals.length ? Math.min(...vals) : 0;
  const hi = vals.length ? Math.max(...vals) : 1;
  const pad = Math.max((hi - lo) * 0.2, 2);
  const step = niceStep((hi - lo + pad * 2) / 4);
  const y0 = Math.floor((lo - pad) / step) * step;
  const y1 = Math.ceil((hi + pad) / step) * step;
  const yTicks: number[] = [];
  for (let v = y0; v <= y1 + 1e-9; v += step) yTicks.push(Math.round(v * 10) / 10);
  const vMax = Math.max(1, ...points.map((p) => p.volume));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={points} margin={{ top: 12, right: 2, bottom: 0, left: 2 }}>
        <defs>
          <linearGradient id="pgg-pr-leaf" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F3DDA8" />
            <stop offset=".5" stopColor="#D5AC67" />
            <stop offset="1" stopColor="#A97E40" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgb(255 255 255 / .05)" strokeDasharray="3 5" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={[parseISODate(from).getTime(), parseISODate(to).getTime()]}
          ticks={ticks}
          axisLine={false}
          tickLine={false}
          tick={<XTick count={ticks.length} />}
          height={22}
          interval={0}
          padding={{ left: 12, right: 12 }}
        />
        <YAxis yAxisId="m" orientation="right" domain={[y0, y1]} ticks={yTicks} axisLine={false} tickLine={false} tick={<YTick />} width={40} interval={0} />
        <YAxis yAxisId="v" hide domain={[0, vMax * 2.6]} />
        <Tooltip cursor={{ stroke: "#D5AC67", strokeWidth: 1 }} isAnimationActive={false} content={<Tip format={format} metricLabel={metricLabel} volumeLabel={volumeLabel} />} />
        <Bar yAxisId="v" dataKey="volume" fill="rgb(93 181 164 / .28)" radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={points.length <= 120} />
        <Line
          yAxisId="m"
          dataKey="metric"
          type="linear"
          stroke="#D5AC67"
          strokeWidth={2}
          connectNulls
          isAnimationActive={points.length <= 120}
          animationDuration={600}
          dot={<Diamond />}
          activeDot={{ r: 5, fill: "#F3DDA8", stroke: "#08090C", strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function niceStep(raw: number) {
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 0.1)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
}

function Diamond(props: { cx?: number; cy?: number; payload?: StrengthPoint }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload || payload.metric == null) return null;
  if (!payload.pr) return <circle cx={cx} cy={cy} r={2.75} fill="#D5AC67" stroke="#08090C" strokeWidth={1.5} />;
  return <rect x={cx - 5.5} y={cy - 5.5} width={11} height={11} transform={`rotate(45 ${cx} ${cy})`} fill="url(#pgg-pr-leaf)" stroke="#08090C" strokeWidth={1.5} />;
}

function Tip({ active, payload, format, metricLabel, volumeLabel }: { active?: boolean; payload?: { payload?: StrengthPoint }[]; format: (v: number) => string; metricLabel: string; volumeLabel: string }) {
  const p = active ? payload?.[0]?.payload : null;
  if (!p) return null;
  return (
    <div className="rounded-[12px] border border-line-strong bg-s3 px-3 py-2 shadow-[var(--e2)]">
      <p className="eyebrow mb-1">{tickLabel(p.t)}</p>
      {p.metric != null && (
        <p className="text-[13px] font-medium text-fg-2">
          {metricLabel} <span className="num text-[15px] font-semibold text-fg">{format(p.metric)}</span>
        </p>
      )}
      <p className="text-[12px] font-medium text-fg-3">
        {volumeLabel} {Math.round(p.volume).toLocaleString("en-US")}
      </p>
      {p.pr && <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-gold-300">Record</p>}
    </div>
  );
}
