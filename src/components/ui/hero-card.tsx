"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Ring } from "./ring";

/**
 * The hero number card (docs/DESIGN-V3-SIMPLE.md §1.4.2): the one big number of a screen. The
 * number in `t-hero` on the left, its label in `t-label` under it with a 16 px chevron, and an
 * optional 112 px ring (stroke 11) on the right. The whole card is ONE button that opens the
 * screen's "How we got this" sheet (`onDetails`); tapping it never changes what it shows.
 *
 *   <HeroNumberCard value="1,413" label="Calories to go" ring={{ pct: 0.57, icon: Flame }}
 *     onDetails={() => setDetails(true)} />
 *
 * The number carries `data-derived` (§5.4). `extra` renders under the button, outside it (the
 * recipe's servings stepper). Short layout: the ring scales to 90 px.
 */
export interface HeroNumberCardProps {
  value: ReactNode;
  unit?: ReactNode;
  label: ReactNode;
  ring?: { pct: number; icon?: LucideIcon; goal?: boolean };
  onDetails?: () => void;
  /** VoiceOver name ("1,413 calories to go"); defaults to the value and label. */
  ariaLabel?: string;
  /** VoiceOver hint: what the tap opens. */
  hint?: string;
  /** The label is a name from data (§5.1): renders data-budget-name on it. */
  dataName?: boolean;
  extra?: ReactNode;
  className?: string;
}

export function HeroNumberCard({ value, unit, label, ring, onDetails, ariaLabel, hint = "Shows today's numbers and how they are worked out.", dataName, extra, className }: HeroNumberCardProps) {
  const hintId = useId();
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="t-hero block" data-derived="">
          {value}
          {unit != null && <span className="unit">{unit}</span>}
        </span>
        <span className="t-label mt-2 flex items-center gap-1" data-budget-name={dataName ? "" : undefined}>
          <span className="min-w-0">{label}</span>
          {onDetails && <ChevronRight className="size-4 shrink-0 text-fg-3" strokeWidth={2.2} aria-hidden />}
        </span>
      </span>
      {ring && (
        <span className="-my-1 shrink-0 short:-m-[11px] short:scale-[0.8036]">
          <Ring value={ring.pct} size="lg" icon={ring.icon} goal={ring.goal} />
        </span>
      )}
    </>
  );
  const cls = "flex w-full items-center justify-between gap-4 text-left";
  return (
    <section className={cn("rounded-card bg-surface py-6 pl-6 pr-[22px]", className)}>
      {onDetails ? (
        <button type="button" onClick={onDetails} aria-label={ariaLabel} aria-describedby={hintId} className={cn("press-soft", cls)}>
          {body}
          <span id={hintId} className="sr-only">
            {hint}
          </span>
        </button>
      ) : (
        <div className={cls} aria-label={ariaLabel} role={ariaLabel ? "group" : undefined}>
          {body}
        </div>
      )}
      {extra && <div className="mt-4">{extra}</div>}
    </section>
  );
}
