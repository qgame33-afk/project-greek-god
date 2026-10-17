import { cn } from "@/lib/cn";

/**
 * The decorative ridge (docs/DESIGN-V2.md §3.6.1): a smooth mountain silhouette (the same path as
 * public/art/ridge.svg) drawn BEHIND the Ascent chart at 4% opacity, confined by the caller to the
 * bottom 30% of the plot. It is decoration, never data: aria-hidden, no filters, no jagged edges,
 * and the chart says so in a caption ("The ridge is decoration. The line is your trend.").
 */
export const RIDGE_PATH = "M0 300V242C120 228 196 206 300 207S468 172 560 152S722 134 800 110S940 70 1010 42C1042 29 1062 25 1082 31C1122 44 1160 68 1200 88V300Z";

export function Ridge({ className, opacity = 0.04 }: { className?: string; opacity?: number }) {
  return (
    <svg viewBox="0 0 1200 300" preserveAspectRatio="none" className={cn("pointer-events-none text-ivory", className)} style={{ opacity }} aria-hidden>
      <path d={RIDGE_PATH} fill="currentColor" />
    </svg>
  );
}
