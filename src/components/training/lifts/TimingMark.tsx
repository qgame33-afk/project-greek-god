import { Check } from "lucide-react";
import { LaurelSprig } from "@/components/art/icons";
import { cn } from "@/lib/cn";
import { TIMING_WORD } from "@/lib/training/timing-history";
import type { SetTiming } from "@/lib/workout/timing";

/**
 * A set's timing mark (DESIGN-V2 §3.2.4), as Gym Mode shows it: a glyph and a word, never red.
 * record: laurel, leaf · beat last: a tick in a leaf circle · matched: "=" ivory · below last: "–"
 * stone · first benchmark: ivory tag type · nothing to compare: "logged" in stone.
 */
export function TimingMark({ timing, className }: { timing: SetTiming; className?: string }) {
  if (timing === "first") return <span className={cn("t-tag text-ivory", className)}>{TIMING_WORD.first}</span>;
  const word = timing ? TIMING_WORD[timing] : "logged";
  const tone = timing === "record" || timing === "beat" ? "text-leaf-300" : timing === "matched" ? "text-ivory" : "text-stone";
  return (
    <span className={cn("t-meta inline-flex items-center gap-1.5 whitespace-nowrap", tone, className)}>
      {timing === "record" && <LaurelSprig aria-hidden className="size-4" />}
      {timing === "beat" && (
        <span aria-hidden className="grid size-4 place-items-center rounded-full shadow-[inset_0_0_0_1.25px_var(--leaf-300)]">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      )}
      {timing === "matched" && <span aria-hidden className="t-num-s leading-none">=</span>}
      {timing === "below" && <span aria-hidden className="t-num-s leading-none">–</span>}
      {word}
    </span>
  );
}
