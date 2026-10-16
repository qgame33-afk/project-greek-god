"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Laurel } from "@/components/art/Motifs";
import { scaleGeometry } from "@/lib/progress/scale";
import { signed } from "../kit";

const H = 64;
const TRACK_Y = 30; // centre of the 4px track
const TICK_Y = 36;

/**
 * The Ascent Scale (DESIGN §7.8): a 64px ruler from the start weight to the goal. Ticks every
 * unit, labels every 5, a laurel at the target, a gold track filled to the 7-day average with
 * a text-1 needle, and a dashed PLAN needle at today's planned weight. Values in display unit.
 */
export function AscentScale({
  start,
  goal,
  avg,
  plan,
  unit,
}: {
  start: number;
  goal: number;
  avg: number | null;
  plan: number | null;
  unit: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const clip = `scale-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const grad = `${clip}-g`;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Glide in from the start on first paint; later changes animate old → new.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!width) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSettled(true)));
    return () => cancelAnimationFrame(id);
  }, [width]);

  // A new weigh-in moves the needle and shows the change for a moment.
  const prevAvg = useRef<number | null>(avg);
  const [chip, setChip] = useState<{ text: string; key: number } | null>(null);
  useEffect(() => {
    const prev = prevAvg.current;
    prevAvg.current = avg;
    if (prev == null || avg == null || Math.abs(avg - prev) < 0.05) return;
    const t0 = window.setTimeout(() => setChip({ text: signed(avg - prev, 1), key: Date.now() }), 0);
    const t1 = window.setTimeout(() => setChip(null), 2600);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [avg]);

  const g = width ? scaleGeometry({ width, start, goal, avg, plan }) : null;
  const left = g ? Math.min(g.startX, g.goalX) : 0;
  const right = g ? Math.max(g.startX, g.goalX) : 0;
  const needleX = g?.avgX != null ? (settled ? g.avgX : g.startX) : null;
  // The start always sits on the left, so the fill runs left → needle in both directions.
  const fillShift = g && g.avgX != null ? (settled ? g.avgX : g.startX) - right : 0;

  const minor = g?.ticks.filter((t) => !t.major).map((t) => `M${t.x} ${TICK_Y}v6`).join("") ?? "";
  const major = g?.ticks.filter((t) => t.major).map((t) => `M${t.x} ${TICK_Y}v12`).join("") ?? "";
  const ease = "900ms var(--ease-gold)";

  const label =
    avg == null
      ? `Ascent scale from ${start.toFixed(1)} to ${goal.toFixed(1)} ${unit}. No 7-day average yet.`
      : `Ascent scale: 7-day average ${avg.toFixed(1)} ${unit}, between start ${start.toFixed(1)} and goal ${goal.toFixed(1)} ${unit}${plan != null ? `. Plan for today ${plan.toFixed(1)}` : ""}.`;

  return (
    <div ref={wrap} className="relative w-full" style={{ height: H }} role="img" aria-label={label}>
      {g && (
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="absolute inset-0 overflow-visible" aria-hidden>
          <defs>
            <clipPath id={clip}>
              <rect x={left} y={TRACK_Y - 2} width={Math.max(0, right - left)} height={4} rx={2} />
            </clipPath>
            {/* The fill rect is translated (never resized), so the gradient lives in its shifted space:
                start it where the visible span begins so every fill runs deep gold → gold-50 at the needle. */}
            <linearGradient id={grad} x1={g.avgX != null ? Math.min(right - 1, left + right - g.avgX) : left} y1="0" x2={right} y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#A97E40" />
              <stop offset=".55" stopColor="#D5AC67" />
              <stop offset="1" stopColor="#F3DDA8" />
            </linearGradient>
          </defs>

          {/* track + gold fill to the 7-day average (translateX, never width) */}
          <rect x={left} y={TRACK_Y - 2} width={Math.max(0, right - left)} height={4} rx={2} fill="var(--track)" />
          {g.avgX != null && (
            <g clipPath={`url(#${clip})`}>
              <rect
                x={left}
                y={TRACK_Y - 2}
                width={Math.max(0, right - left)}
                height={4}
                fill={`url(#${grad})`}
                style={{ transform: `translateX(${fillShift}px)`, transition: `transform ${ease}` }}
              />
            </g>
          )}

          {/* ruler */}
          <path d={minor} stroke="rgb(255 255 255 / .16)" strokeWidth={1} />
          <path d={major} stroke="rgb(255 255 255 / .34)" strokeWidth={1} />
          {g.ticks
            .filter((t) => t.label)
            .map((t) => (
              <text key={t.v} x={t.x} y={H - 2} textAnchor="middle" className="num" fontSize={11} fill="var(--text-3)">
                {t.label}
              </text>
            ))}

          {/* laurel at the target */}
          <g transform={`translate(${g.goalX - 10} ${TRACK_Y - 26})`}>
            <Laurel size={20} strokeWidth={1} />
          </g>

          {/* PLAN needle: dashed gold-700 so it never reads as data */}
          {g.planX != null && (
            <g style={{ transform: `translateX(${g.planX}px)`, transition: `transform ${ease}` }}>
              {/* an outlined pointer above the needle head keeps PLAN visible even when the average sits on it */}
              <path d="M-4.5 1.5h9L0 8z" fill="var(--surface-1)" stroke="var(--gold-600)" strokeWidth={1.25} strokeLinejoin="round" />
              <line x1={0} x2={0} y1={10} y2={TRACK_Y + 16} stroke="var(--gold-700)" strokeWidth={1.5} strokeDasharray="3 3" />
            </g>
          )}

          {/* 7-day average needle */}
          {needleX != null && (
            <g style={{ transform: `translateX(${needleX}px)`, transition: `transform ${ease}` }}>
              <line x1={0} x2={0} y1={TRACK_Y - 15} y2={TRACK_Y + 15} stroke="var(--text-1)" strokeWidth={2} strokeLinecap="round" />
              <circle cx={0} cy={TRACK_Y - 15} r={3.5} fill="var(--text-1)" />
            </g>
          )}
        </svg>
      )}
      {g && chip && needleX != null && (
        <span
          key={chip.key}
          className="num pointer-events-none absolute -top-3 rounded-full border border-line-gold bg-s3 px-2 py-0.5 text-[12px] font-semibold text-gold-300 animate-[rise_240ms_var(--ease-out)_both]"
          style={{ left: Math.min(Math.max(needleX, 24), width - 24), transform: "translateX(-50%)" }}
          aria-live="polite"
        >
          {chip.text}
        </span>
      )}
    </div>
  );
}
