"use client";

import type { ReactNode } from "react";
import { Statue } from "@/components/art/Statue";
import { cn } from "@/lib/cn";
import { LaurelSprig } from "@/components/art/icons";

/**
 * Legacy wrapper: the old Gilded Bust now renders the Olympus <Statue> (alpha-cut marble and gold
 * grades, no CSS mask on the photo). Kept so existing callers compile; the Now stream replaces it
 * with <Statue p={gildFraction(…)} /> directly.
 *
 *  - `p` is the ascent progress (0–1). `null` means no weigh-ins yet (pure marble).
 *  - `instant`: render the settled state with no motion.
 */
export interface GildedBustProps {
  p: number | null;
  /** Rendered height in px (3:4 box). */
  size?: number;
  caption?: ReactNode;
  instant?: boolean;
  className?: string;
}

export function GildedBust({ p, size = 168, caption, instant = false, className }: GildedBustProps) {
  const progress = p == null ? 0 : Math.min(1, Math.max(0, p));
  const pct = Math.round(progress * 100);
  const label = p == null ? "Your statue, in marble. The gilding begins with your weigh-ins." : `Your statue, gilded to ${pct} percent of the climb.`;
  const captionNode = caption ?? (p == null ? "Begins with your first weigh-in." : null);
  const ascended = p != null && progress >= 1;
  return (
    <figure className={cn("relative m-0 flex shrink-0 flex-col items-center", className)} style={{ width: Math.round((size * 3) / 4) }}>
      <Statue p={progress} fromP={instant ? progress : 0} height={size} label={label} />
      {ascended ? (
        <figcaption className="mt-2 flex items-center gap-1.5 text-leaf-300">
          <LaurelSprig className="size-4" />
          <span className="t-tag">Ascended</span>
        </figcaption>
      ) : captionNode ? (
        <figcaption className="t-meta mt-2 max-w-[18ch] text-center text-ash">{captionNode}</figcaption>
      ) : null}
    </figure>
  );
}
