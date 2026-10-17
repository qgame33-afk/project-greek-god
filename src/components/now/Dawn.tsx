"use client";

import { cn } from "@/lib/cn";
import type { Guidance } from "@/lib/recovery/guidance";
import { readinessLine } from "@/lib/recovery/guidance";
import { CheckIn, CheckInDetail, ReadinessCall } from "./CheckIn";
import { ScaleStepper } from "./ScaleStepper";
import type { NowModel } from "./useNowData";

/**
 * Dawn (docs/DESIGN-V2.md §3.1.2, §3.1.4, §3.1.5): "Morning, Quinton. Three questions, then the
 * scale." The check-in saves per tap; the scale saves only on Inscribe, the one gold control.
 * "Later" puts Dawn off for the day (the skipped chip keeps it one tap away in Earlier).
 */
export function DawnBody({ m, guidance, titleId, onLater, compact }: { m: NowModel; guidance: Guidance | null; titleId: string; onLater: () => void; compact?: boolean }) {
  const name = m.profile.display_name?.trim().split(/\s+/)[0] || null;
  const weighed = !!m.weighToday;
  const line = guidance ? readinessLine(guidance, m.template?.name ?? null) : null;
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="t-verdict text-[length:1.5rem] leading-[1.15] text-ivory">
          Morning{name ? `, ${name}` : ""}.
          <span className={cn("block text-stone", compact && "sr-only")}>{weighed ? "Three questions." : "Three questions, then the scale."}</span>
        </h2>
        <button type="button" onClick={onLater} className="t-meta -mr-2 -mt-2 min-h-11 shrink-0 px-2 font-semibold text-stone hover:text-ivory">
          Later
        </button>
      </div>

      <CheckIn date={m.today} sleepGoal={Number(m.profile.sleep_goal_h)} className="mt-1" withDetail={false} after={<ReadinessCall line={line} />} />

      {!weighed && (
        <section aria-label="The scale" className="mt-1 border-t border-vein pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="t-eyebrow">The scale</h3>
            <p className="t-meta text-ash">Before food · after the bathroom</p>
          </div>
          <div className={compact ? "mt-1" : "mt-2"}>
            <ScaleStepper unit={m.unit} compact={compact} />
          </div>
        </section>
      )}
      <CheckInDetail date={m.today} className="mt-2" />
    </>
  );
}
