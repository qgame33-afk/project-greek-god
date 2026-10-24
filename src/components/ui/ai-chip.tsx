import { Sparkle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The AI label (docs/DESIGN-V3-SIMPLE.md §1.4.19, law 5): the only label the app shows. A chip,
 * `Sparkle` 14 px + "AI estimate" (or "AI") in --ai on --ai-soft, followed by "Not saved yet" in
 * --text-2 while the estimate is unsaved.
 *
 *   <AiChip unsaved />                  ✦ AI estimate  Not saved yet
 *   <AiChip label="AI" />               ✦ AI
 *
 * <AiMark /> is the small mark a saved diary row keeps next to its time: sparkle + "AI" in --ai,
 * `t-cap`, no chip.
 */
export function AiChip({
  label = "AI estimate",
  unsaved,
  status,
  className,
}: {
  label?: string;
  /** Adds "Not saved yet" after the chip. */
  unsaved?: boolean;
  /** A different status word after the chip ("Saving…", "Saved"); overrides `unsaved`. */
  status?: string;
  className?: string;
}) {
  const after = status ?? (unsaved ? "Not saved yet" : null);
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 align-middle", className)} data-ai-chip="">
      <span className="t-label inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill bg-ai-soft px-3 font-semibold text-ai">
        <Sparkle className="size-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
        {label}
      </span>
      {after && <span className="t-label whitespace-nowrap">{after}</span>}
    </span>
  );
}

export function AiMark({ className }: { className?: string }) {
  return (
    <span className={cn("t-cap inline-flex shrink-0 items-center gap-1 font-semibold text-ai", className)} data-ai-chip="">
      <Sparkle className="size-3 shrink-0" strokeWidth={2.4} aria-hidden />
      AI
    </span>
  );
}
