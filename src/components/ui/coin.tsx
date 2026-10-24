import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The old meal coin (docs/DESIGN-V3-SIMPLE.md §1.7.4), as a plain 28 px check-circle mark so
 * Food's old mosaic stays readable until Food replaces it: eaten (and changed) = white fill with a
 * black check; planned and next = a 2 px --ui-line ring; missed = a dashed ring. Never gold. With
 * `label` it is an image for VoiceOver. Deleted at integration (§6.7).
 */
export type CoinState = "eaten" | "changed" | "planned" | "missed" | "next";

export function Coin({
  state,
  size = 28,
  label,
  className,
}: {
  state: CoinState;
  glyph?: ReactNode;
  size?: number;
  past?: boolean;
  label?: string;
  className?: string;
}) {
  const s = Math.min(28, size);
  const eaten = state === "eaten" || state === "changed";
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-coin={state}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full",
        eaten ? "bg-fg text-bg" : state === "missed" ? "border-2 border-dashed border-ui-line" : "border-2 border-ui-line",
        className,
      )}
      style={{ width: s, height: s }}
    >
      {eaten && <Check className="size-[60%]" strokeWidth={2.6} aria-hidden />}
    </span>
  );
}
