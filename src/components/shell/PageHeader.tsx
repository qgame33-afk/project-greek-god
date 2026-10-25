import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A tab page's header (docs/DESIGN-V3-SIMPLE.md §3.2): the `t-title` on the left (the page's
 * <h1>) and AT MOST ONE accessory on the right: Today → <Avatar />, Train → a "Program" Pill,
 * Food → a "Grocery list" Pill, Progress → nothing. No eyebrow, no ✦. The sticky top bar shows
 * the title once it scrolls under.
 *
 *   <PageHeader title="Today" accessory={<Avatar />} />
 */
export function PageHeader({ title, accessory, className }: { title: ReactNode; accessory?: ReactNode; className?: string }) {
  return (
    <header data-page-header="" className={cn("mb-1 mt-1 flex min-h-14 items-center justify-between gap-3", className)}>
      <h1 className="t-title min-w-0">{title}</h1>
      {accessory}
    </header>
  );
}
