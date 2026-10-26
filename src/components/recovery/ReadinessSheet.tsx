"use client";

import { DetailsSheet } from "@/components/ui/details-sheet";
import { DISCLAIMER, THRESHOLDS, type Guidance } from "@/lib/recovery/guidance";

/**
 * "How we got this" for a check-in's result (docs/DESIGN-V3-SIMPLE.md §4.6, law 5): the call in one
 * sentence, each signal with what was logged and the points it adds, and the rule in plain words.
 * Fixed rules over his own logs; no AI.
 */
export function ReadinessSheet({ open, onOpenChange, guidance: g, title }: { open: boolean; onOpenChange: (o: boolean) => void; guidance: Guidance | null; title: string }) {
  return (
    <DetailsSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      rows={(g?.factors ?? []).map((f) => ({ label: f.label, detail: f.value, value: f.points ? `+${f.points}` : "0" }))}
      note={
        g ? (
          <span data-program-text="">
            {g.title.endsWith(".") ? g.title : `${g.title}.`}
            <span className="t-label mt-1 block">{g.detail}</span>
          </span>
        ) : undefined
      }
      how={`Each signal from your check-in, your last few nights and your recent training adds points (${g?.score ?? 0} in all). 0–${THRESHOLDS.trim - 1} is ready, ${THRESHOLDS.trim}–${THRESHOLDS.ease - 1} drops a set, ${THRESHOLDS.ease}–${THRESHOLDS.recover - 1} goes lighter, ${THRESHOLDS.recover} or more suggests a recovery day. Sleep counts at most 3. Fixed rules, no AI. ${DISCLAIMER}`}
    />
  );
}
