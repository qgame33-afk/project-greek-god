"use client";

// Lazy-loaded (Recharts). One logged series over time — measurements and athletic tests.
// Straight segments between real entries (no smoothing that implies data between them),
// gold PR diamonds, desktop tooltip, sr-only table rendered by the caller.

import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addDays, parseISODate, type ISODate } from "@/lib/dates";
import { tickLabel, xTicks } from "@/lib/progress/weightSeries";
import { XTick, YTick } from "./ticks";

export interface TrendPoint {
  date: ISODate;
  t: number;
  value: number;
  pr?: boolean;
}

export interface TrendChartProps {
  points: TrendPoint[];
  /** Formats a value for the tooltip ("14.75 in", "4.31 s"). */
  format: (v: number) => string;
  /** Lower values plot higher (sprint times). */
  invert?: boolean;
  tone?: "gold" | "verdigris" | "lapis";
  decimals?: number;
}

const TONES = { gold: "#D5AC67", verdigris: "#5DB5A4", lapis: "#6FA3EC" };

export default function TrendChart({ points, format, invert, tone = "gold", decimals = 1 }: TrendChartProps) {
  const color = TONES[tone];
  const first = points[0]?.date;
  const last = points.at(-1)?.date;
  if (!first || !last) return null;
  const from = first === last ? addDays(first, -3) : first;
  const to = first === last ? addDays(last, 3) : last;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.25, Math.abs(hi) * 0.01, 0.5);
  const f = 10 ** decimals;
  const domain: [number, number] = [Math.floor((lo - pad) * f) / f, Math.ceil((hi + pad) * f) / f];
  const ticks = xTicks(from, to, 4);
  const yTicks = niceTicks(domain[0], domain[1], decimals);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 12, right: 2, bottom: 0, left: 2 }}>
        <CartesianGrid vertical={false} stroke="rgb(255 255 255 / .05)" strokeDasharray="3 5" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={[parseISODate(from).getTime(), parseISODate(to).getTime()]}
          ticks={ticks}
          tickFormatter={tickLabel}
          axisLine={false}
          tickLine={false}
          tick={<XTick count={ticks.length} />}
          height={22}
          interval={0}
          padding={{ left: 10, right: 10 }}
        />
        <YAxis orientation="right" reversed={invert} domain={[yTicks[0], yTicks.at(-1)!]} ticks={yTicks} axisLine={false} tickLine={false} tick={<YTick />} width={40} interval={0} />
        <Tooltip cursor={{ stroke: color, strokeWidth: 1 }} isAnimationActive={false} content={<Tip format={format} />} />
        <Line
          dataKey="value"
          type="linear"
          stroke={color}
          strokeWidth={2}
          isAnimationActive={points.length <= 120}
          animationDuration={600}
          dot={<Dot color={color} />}
          activeDot={{ r: 5, fill: "#F3DDA8", stroke: "#08090C", strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function niceTicks(lo: number, hi: number, decimals: number) {
  const span = hi - lo || 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const s = Math.max(step, 1 / 10 ** decimals);
  const start = Math.floor(lo / s) * s;
  const out: number[] = [];
  for (let v = start; v <= hi + s * 0.999 && out.length < 8; v += s) out.push(Math.round(v * 1000) / 1000);
  return out;
}

function Dot(props: { cx?: number; cy?: number; payload?: TrendPoint; color: string }) {
  const { cx, cy, payload, color } = props;
  if (cx == null || cy == null || !payload) return null;
  if (payload.pr)
    return (
      <g aria-hidden>
        <rect x={cx - 5} y={cy - 5} width={10} height={10} transform={`rotate(45 ${cx} ${cy})`} fill="url(#pgg-leaf)" stroke="#08090C" strokeWidth={1.5} />
        <defs>
          <linearGradient id="pgg-leaf" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F3DDA8" />
            <stop offset=".5" stopColor="#D5AC67" />
            <stop offset="1" stopColor="#A97E40" />
          </linearGradient>
        </defs>
      </g>
    );
  return <circle cx={cx} cy={cy} r={3.25} fill={color} stroke="#08090C" strokeWidth={1.5} aria-hidden />;
}

function Tip({ active, payload, format }: { active?: boolean; payload?: { payload?: TrendPoint }[]; format: (v: number) => string }) {
  const p = active ? payload?.[0]?.payload : null;
  if (!p) return null;
  return (
    <div className="rounded-[12px] border border-line-strong bg-s3 px-3 py-2 shadow-[var(--e2)]">
      <p className="eyebrow mb-1">{tickLabel(p.t)}</p>
      <p className="num text-[15px] font-semibold text-fg">{format(p.value)}</p>
      {p.pr && <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-gold-300">Record</p>}
    </div>
  );
}
