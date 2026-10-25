import { Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The win card (docs/DESIGN-V3-SIMPLE.md §1.4.20, §4.2.5): --gold-soft fill, a 1.5 px --gold-line
 * border, radius 24. A `Trophy` and "New best" in gold 700; the set he lifted as the hero
 * ("25 lb × 17", `t-hero`, gold); one plain sentence in --text; the lift name in `t-cap`.
 * `role="status"`, `aria-live="polite"`. It is a win mark, never a gold fill.
 *
 *   <WinCard weight="25" unit="lb" reps={17} sentence="Most reps you've done at 25 lb each hand."
 *     lift="Dumbbell Lateral Raises" />
 */
export interface WinCardProps {
  /** The heading next to the trophy ("New best", "Latest best · Thu 22 Oct"). */
  title?: ReactNode;
  /** The set: a weight and reps ("25" "lb" × 17), or `hero` for any other text. */
  weight?: ReactNode;
  unit?: ReactNode;
  reps?: ReactNode;
  hero?: ReactNode;
  sentence?: ReactNode;
  lift?: ReactNode;
  /** A caption under the lift name ("3 new bests"). */
  caption?: ReactNode;
  align?: "center" | "start";
  /** The VoiceOver sentence ("New best. 25 pounds times 17. …"). */
  ariaLabel?: string;
  className?: string;
}

export function WinCard({ title = "New best", weight, unit, reps, hero, sentence, lift, caption, align = "center", ariaLabel, className }: WinCardProps) {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={cn("rounded-card border-[1.5px] border-gold-line bg-gold-soft p-5", align === "center" ? "text-center" : "text-left", className)}
    >
      <p className={cn("t-row flex items-center gap-2 font-bold text-gold", align === "center" && "justify-center")}>
        <Trophy className="size-5 shrink-0" strokeWidth={1.9} aria-hidden />
        {title}
      </p>
      <p className="t-hero mt-3 text-gold" data-budget-name="">
        {hero ?? (
          <>
            {weight}
            {unit != null && <span className="unit text-gold">{unit}</span>}
            {reps != null && <> × {reps}</>}
          </>
        )}
      </p>
      {sentence != null && <p className="t-body mt-2.5 text-fg">{sentence}</p>}
      {lift != null && (
        <p className="t-cap mt-1.5" data-budget-name="">
          {lift}
        </p>
      )}
      {caption != null && <p className="t-cap mt-1">{caption}</p>}
    </section>
  );
}
