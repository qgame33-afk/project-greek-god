/**
 * The terrace glyph, retired (docs/DESIGN-V3-SIMPLE.md §1.7.4: Milestones are plain rows now).
 * Keeps its props so old screens compile, and renders nothing. Deleted at integration (§6.7).
 */
export function Terrace(_props: { numeral: string; state: "reached" | "next" | "ahead"; size?: number; final?: boolean; label?: string; className?: string }) {
  return null;
}
