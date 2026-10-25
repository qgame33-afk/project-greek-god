"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Ring } from "./ring";

/**
 * The small stat card of a trio or duo (docs/DESIGN-V3-SIMPLE.md §1.4.3): the number in `t-num-s`
 * with its unit, a `t-cap` label on one line, an optional 64 px ring (stroke 7) centred below,
 * and a 12 px chevron top-right when it opens a "How we got this" sheet (`onDetails`).
 *
 *   <StatRow cols={3}>
 *     <StatCard value="87" unit="g" label="Protein to go" ring={{ pct: 0.53, icon: Drumstick }} onDetails={open} />
 *     …
 *   </StatRow>
 *
 * AX layout (`ax:`): one column, rings hidden. Short layout (`short:`): rings hidden, columns kept
 * (§4.1.9 and the 375×667 mockups: Up next must stay above the tab bar).
 */
export interface StatCardProps {
  value: ReactNode;
  unit?: ReactNode;
  label: ReactNode;
  ring?: { pct: number; icon?: LucideIcon; goal?: boolean };
  onDetails?: () => void;
  /** VoiceOver name ("87 grams of protein to go"); defaults to the value and label. */
  ariaLabel?: string;
  hint?: string;
  className?: string;
}

export function StatCard({ value, unit, label, ring, onDetails, ariaLabel, hint = "Shows how it is worked out.", className }: StatCardProps) {
  const hintId = useId();
  const body = (
    <>
      <span className="block min-w-0">
        <span className={cn("t-num-s block truncate", onDetails && "pr-3")} data-derived={onDetails ? "" : undefined}>
          {value}
          {unit != null && (
            <span className="unit" style={{ fontSize: "0.68em" }}>
              {unit}
            </span>
          )}
        </span>
        <span className="t-cap mt-0.5 block truncate">{label}</span>
      </span>
      {ring && (
        <span className="mt-3 self-center ax:hidden short:hidden">
          <Ring value={ring.pct} size="md" icon={ring.icon} goal={ring.goal} />
        </span>
      )}
      {onDetails && <ChevronRight aria-hidden className="absolute right-2.5 top-3.5 size-3 text-fg-3" strokeWidth={2.4} />}
    </>
  );
  const cls = cn("relative flex min-w-0 flex-col rounded-tile-lg bg-surface px-3 pb-3.5 pt-4 text-left", className);
  if (onDetails)
    return (
      <button type="button" onClick={onDetails} aria-label={ariaLabel} aria-describedby={hintId} className={cn("press-soft", cls)}>
        {body}
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      </button>
    );
  return (
    <div className={cls} role={ariaLabel ? "group" : undefined} aria-label={ariaLabel}>
      {body}
    </div>
  );
}

/** Lays out a trio (3) or duo (2) of StatCards; one column in the AX layout. */
export function StatRow({ cols = 3, children, className }: { cols?: 2 | 3; children: ReactNode; className?: string }) {
  return (
    <div className={cn("@container", className)}>
      <div data-stat-row="" className={cn("grid gap-2.5 ax:grid-cols-1", cols === 3 ? "grid-cols-3" : "grid-cols-2")}>{children}</div>
    </div>
  );
}
