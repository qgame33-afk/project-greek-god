"use client";

import { cn } from "@/lib/cn";

/**
 * The scanner's frame (docs/DESIGN-V3-SIMPLE.md §4.4.7): a rounded square guide, or the photo once
 * one is taken (dimmed while it is read or after an error). `fill` shows the photo edge to edge
 * (the review's header) instead of the square guide. No ornaments.
 */
export function PhotoFrame({
  src,
  scanning,
  dim,
  fill,
  className,
  children,
}: {
  src?: string | null;
  scanning?: boolean;
  dim?: boolean;
  fill?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden",
        fill ? "h-full bg-card" : "aspect-square max-w-[18rem] rounded-card border-2 border-fg-2",
        className,
      )}
      aria-busy={scanning || undefined}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
        <img src={src} alt="Your meal photo" className={cn("absolute inset-0 size-full object-cover", (dim || scanning) && "opacity-50")} />
      )}
      {children}
    </div>
  );
}
