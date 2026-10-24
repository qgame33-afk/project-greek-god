import type { ReactNode } from "react";

/**
 * The gilded bust, retired (docs/DESIGN-V3-SIMPLE.md §0 law 6, §1.7.4): no statue anywhere. Keeps
 * its props so old screens compile, and renders nothing. Deleted at integration (§6.7).
 */
export interface GildedBustProps {
  p: number | null;
  size?: number;
  caption?: ReactNode;
  instant?: boolean;
  className?: string;
}

export function GildedBust(_props: GildedBustProps) {
  return null;
}
