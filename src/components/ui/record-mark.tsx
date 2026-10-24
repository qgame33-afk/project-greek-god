import { cn } from "@/lib/cn";

/**
 * The old record mark (docs/DESIGN-V3-SIMPLE.md §1.7.4): the words "New best" in gold, `t-cap`
 * 600. A win mark, never a fill. Screens use the WinCard for the moment itself. Deleted at
 * integration (§6.7) once nothing imports it.
 */
export function RecordMark({ className }: { compact?: boolean; label?: string; className?: string }) {
  return <span className={cn("t-cap inline-flex shrink-0 items-center font-semibold text-gold", className)}>New best</span>;
}
