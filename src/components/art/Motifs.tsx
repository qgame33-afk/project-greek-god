import type { CSSProperties } from "react";

/**
 * The Pantheon motif library, retired (docs/DESIGN-V3-SIMPLE.md §0 law 6, §1.7.4): no meanders,
 * laurels, columns, plinths or pediments. Every export keeps its name and props so old screens
 * compile, and renders nothing. The files go at integration (§6.7) once nothing imports them.
 */

type Base = { className?: string; style?: CSSProperties };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Pure geometry of the old Greek-key band (kept for its callers until integration). */
export function meanderGeometry(width: number, height = 14, strokeWidth = 1.25) {
  const pad = strokeWidth / 2;
  const sy = (height - strokeWidth) / 8;
  const n = Math.max(1, Math.round((width - strokeWidth) / (10 * sy)));
  const sx = (width - strokeWidth) / (n * 10);
  const X = (g: number) => r2(pad + g * sx);
  const Y = (g: number) => r2(pad + g * sy);
  let d = `M${X(0)} ${Y(8)}`;
  for (let i = 0; i < n; i++) {
    const o = i * 10;
    d += `V${Y(0)}H${X(o + 8)}V${Y(6)}H${X(o + 4)}V${Y(4)}H${X(o + 6)}` + `V${Y(2)}H${X(o + 2)}V${Y(8)}H${X(o + 10)}`;
  }
  d += `V${Y(0)}`;
  const length = n * (24 * sy + 26 * sx) + 8 * sy;
  return { d, length, units: n };
}

export function Meander(_props: Base & { width: number; height?: number; progress?: number; strokeWidth?: number }) {
  return null;
}

export function Laurel(_props: Base & { size?: number; strokeWidth?: number }) {
  return null;
}

export function LaurelBullet(_props: Base & { size?: number }) {
  return null;
}

export function ColumnFluted(_props: Base & { height?: number; fill?: number }) {
  return null;
}

export function Plinth(_props: Base & { height?: number }) {
  return null;
}

export function Pediment(_props: Base & { width?: number }) {
  return null;
}

export type EmptyKind = "plinth" | "amphora" | "column" | "frame" | "laurel" | "volute" | "kylix";

/** Empty states have no art in V3 (§1.4.24): one line and a next step. */
export function EmptyArt(_props: Base & { kind: EmptyKind; size?: number; strokeWidth?: number }) {
  return null;
}
