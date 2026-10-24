/**
 * The Statue, retired (docs/DESIGN-V3-SIMPLE.md §0 law 6, §1.7.4): no statue anywhere. Keeps its
 * exports and props so old screens compile, and renders nothing. The component, its images in
 * public/art/ and this file go at integration (§6.7).
 */
export type StatueMode = "now" | "dawn" | "unveil" | "chronicle" | "oath";

export interface StatueProps {
  /** Gild fraction 0–1 from gildFraction(). */
  p: number;
  fromP?: number;
  mode?: StatueMode;
  height?: number;
  label: string;
  skip?: boolean;
  spotlight?: boolean;
  priority?: boolean;
  onSettled?: () => void;
  className?: string;
}

/** The old gild duration by distance (600–1400 ms); kept for its test until integration. */
export function gildDuration(from: number, to: number) {
  return Math.round(600 + Math.min(1, Math.abs(to - from) / 0.5) * 800);
}

export function Statue(_props: StatueProps) {
  return null;
}
