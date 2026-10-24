/**
 * The Ascent frieze, retired (docs/DESIGN-V3-SIMPLE.md §0 law 6, §1.7.4): no meander timeline.
 * Keeps its props so old screens compile, and renders nothing. Deleted at integration (§6.7).
 */
export interface AscentFriezeProps {
  elapsed: number;
  startLabel: string;
  endLabel: string;
  caption?: string;
  draw?: boolean;
  delay?: number;
  className?: string;
}

export function AscentFrieze(_props: AscentFriezeProps) {
  return null;
}
