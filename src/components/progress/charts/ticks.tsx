"use client";

// Axis ticks shared by the lazy charts (no Recharts import here, so it stays out of the main bundle).

import { tickLabel } from "@/lib/progress/weightSeries";

/** Whole-number ticks at an even step (at most ~5 labels), aligned so both ends get a label. */
export function yTicks([lo, hi]: [number, number]) {
  const step = Math.max(1, Math.ceil((hi - lo) / 4));
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end; v += step) out.push(v);
  return out;
}

type TickProps = { x?: number | string; y?: number | string; payload?: { value: number }; index?: number; count?: number };

/** Barlow 11px text-3 date ticks ("OCT 12"); the end labels hug the edges so they never clip. */
export function XTick({ x, y, payload, index = 0, count = 0 }: TickProps) {
  if (!payload) return null;
  const anchor = index === 0 && count > 1 ? "start" : count > 1 && index === count - 1 ? "end" : "middle";
  return (
    <text x={Number(x)} y={Number(y)} dy={12} textAnchor={anchor} className="num" fontSize={11} fill="var(--text-3)">
      {tickLabel(payload.value)}
    </text>
  );
}

/** Right-hand value ticks. */
export function YTick({ x, y, payload }: TickProps) {
  if (!payload) return null;
  return (
    <text x={Number(x)} y={Number(y)} dy={4} dx={4} textAnchor="start" className="num" fontSize={11} fill="var(--text-3)">
      {payload.value}
    </text>
  );
}
