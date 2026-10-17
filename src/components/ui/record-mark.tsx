import { LaurelSprig } from "@/components/art/icons";
import { cn } from "@/lib/cn";

/**
 * The record mark (replaces the PR badge): a laurel sprig and the word "record" in leaf-300.
 * An earned mark, so it is a glyph and a word, never a gold-filled control. `compact` is the
 * 20 px inline version for rows; the default sits beside a value.
 */
export function RecordMark({ compact, label = "Record", className }: { compact?: boolean; label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-leaf-300",
        compact ? "t-tag h-5" : "t-eyebrow text-leaf-300",
        className,
      )}
    >
      <LaurelSprig className={compact ? "size-3.5" : "size-4"} strokeWidth={compact ? 1.5 : 1.6} />
      {label}
    </span>
  );
}
