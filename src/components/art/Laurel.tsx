/**
 * The laurel wreath, retired (docs/DESIGN-V3-SIMPLE.md §0 law 6, §1.7.4): a new best is the
 * WinCard and the word "New best" now. Keeps its exports and props so old screens compile, and
 * renders nothing. Deleted at integration (§6.7).
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

export function Laurel(_props: LaurelProps) {
  return null;
}
