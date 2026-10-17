"use client";

import { useId, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { DURATION, prefersReducedMotion } from "@/lib/motion";

/**
 * The laurel wreath (docs/DESIGN-V2.md §1.8.2 Inscribe, §3.3): procedural — two branches on a
 * circle, open at the top, leaves alternating along each stem and shrinking toward the tips.
 * `inscribe` draws it: the stems by stroke-dashoffset (800 ms ease-out), the leaves growing from
 * their bases with a 70 ms stagger. Reduced motion: drawn. Earned only, so it is leaf by default;
 * `tone="ivory"` is the unearned outline.
 *
 *   <Laurel size={220} inscribe delay={100} />
 */
export interface LaurelProps {
  size?: number;
  inscribe?: boolean;
  /** ms before the stems start drawing. */
  delay?: number;
  /** Leaves per branch (6–12). */
  leaves?: number;
  tone?: "leaf" | "ivory";
  className?: string;
}

interface Leaf {
  x: number;
  y: number;
  angle: number;
  scale: number;
  order: number;
}

const R = 38;
const CX = 50;
const CY = 52;
const START = 168; // degrees clockwise from the top: just right of the bottom
const SPAN = 140; // each branch sweeps 140°, leaving the top open

function pointAt(deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
}

/**
 * Pure geometry: stem paths and leaf placements for both branches. Angles are compass degrees
 * clockwise from the top. The left branch climbs clockwise from just left of the bottom, the right
 * one counter-clockwise; leaves point along the growth tangent and splay ±35° outside / inside.
 */
export function laurelGeometry(n = 9) {
  const count = Math.max(6, Math.min(12, Math.round(n)));
  const stems: string[] = [];
  const leaves: Leaf[] = [];
  for (const side of ["left", "right"] as const) {
    const from = side === "left" ? 360 - START : START;
    const to = side === "left" ? from + SPAN : from - SPAN;
    const a = pointAt(from);
    const b = pointAt(to);
    stems.push(`M${a.x.toFixed(2)} ${a.y.toFixed(2)}A${R} ${R} 0 0 ${side === "left" ? 1 : 0} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`);
    for (let i = 0; i < count; i++) {
      const t = 0.06 + (i / (count - 1)) * 0.88;
      const deg = from + (to - from) * t;
      const p = pointAt(deg);
      const outside = i % 2 === 0;
      const tangent = side === "left" ? deg + 90 : deg - 90;
      const splay = side === "left" ? (outside ? -35 : 35) : outside ? 35 : -35;
      leaves.push({ x: p.x, y: p.y, angle: tangent + splay, scale: 1.15 - t * 0.5, order: i });
    }
  }
  return { stems, leaves };
}

const LEAF = "M0 0C2.6-2.4 3-7.6 0-11.5C-3-7.6-2.6-2.4 0 0Z";
const noop = () => () => {};

export function Laurel({ size = 96, inscribe = false, delay = 0, leaves = 11, tone = "leaf", className }: LaurelProps) {
  const gid = `laurel-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const reduced = useSyncExternalStore(noop, prefersReducedMotion, () => true);
  const play = inscribe && !reduced;
  const { stems, leaves: placed } = laurelGeometry(leaves);
  const fill = tone === "leaf" ? `url(#${gid})` : "none";
  const stroke = tone === "leaf" ? "var(--leaf-400)" : "var(--ui-line)";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={cn("overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--leaf-100)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--leaf-300)" }} />
          <stop offset="1" style={{ stopColor: "var(--leaf-500)" }} />
        </linearGradient>
      </defs>
      {stems.map((d, i) => (
        <path
          key={i}
          d={d}
          pathLength={1}
          strokeDasharray="1 1"
          style={{
            stroke,
            strokeDashoffset: play ? undefined : 0,
            animation: play ? `inscribe-draw ${DURATION.inscribe}ms var(--ease-out) ${delay}ms both` : undefined,
          }}
          strokeWidth={1.2}
          strokeLinecap="round"
        />
      ))}
      {placed.map((l, i) => (
        <g key={i} transform={`translate(${l.x.toFixed(2)} ${l.y.toFixed(2)}) rotate(${l.angle.toFixed(1)}) scale(${l.scale.toFixed(3)})`}>
          <path
            d={LEAF}
            fill={fill}
            style={{
              stroke: tone === "leaf" ? "var(--leaf-500)" : "var(--ui-line)",
              strokeOpacity: tone === "leaf" ? 0.5 : 1,
              transformBox: "fill-box",
              transformOrigin: "50% 100%",
              animation: play ? `leaf-grow 320ms var(--ease-gold) ${delay + 180 + l.order * 70}ms both` : undefined,
            }}
            strokeWidth={0.5}
          />
        </g>
      ))}
    </svg>
  );
}
