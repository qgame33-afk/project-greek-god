"use client";

import { Undo2, X } from "lucide-react";
import { SealTick } from "@/components/art/icons";
import { cn } from "@/lib/cn";
import type { FeedbackReason } from "@/lib/meals/types";
import { REGEN_REASONS } from "./model";

export type StripPhase = "ask" | "noted";

/**
 * The non-blocking strip under a swapped meal: Undo, then an optional "why" in one tap.
 * Nothing here is required — ignoring it keeps the new meal (and teaches the planner that).
 */
export function RegenStrip({
  fromName,
  phase,
  noted,
  chosen,
  onUndo,
  onReason,
  onClose,
}: {
  fromName: string;
  phase: StripPhase;
  noted?: string | null;
  chosen?: FeedbackReason | null;
  onUndo: () => void;
  onReason: (r: FeedbackReason) => void;
  onClose: () => void;
}) {
  return (
    <div className="mb-3 ml-[3.25rem] rounded-field bg-m2 px-3.5 pb-3.5 pt-1 shadow-[inset_0_0_0_1px_var(--vein-2)]" role="group" aria-label="Meal swapped">
      <div className="flex min-h-11 items-center gap-1">
        <p className="t-meta min-w-0 flex-1 text-stone" aria-live="polite">
          Swapped out <span className="text-ivory">{fromName}</span>
        </p>
        <button type="button" onClick={onUndo} className="press t-callout inline-flex h-11 shrink-0 items-center gap-1.5 rounded-field px-2 font-semibold text-ivory">
          <Undo2 className="size-4" strokeWidth={1.6} aria-hidden />
          Undo
        </button>
        <button type="button" onClick={onClose} aria-label="Keep it and close" className="press -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-stone hover:text-ivory">
          <X className="size-[18px]" strokeWidth={1.6} />
        </button>
      </div>
      {phase === "ask" ? (
        <>
          <p className="t-meta text-stone">What was wrong with it? Optional: it teaches the planner.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {REGEN_REASONS.map((o) => (
              <button
                key={o.reason}
                type="button"
                onClick={() => onReason(o.reason)}
                aria-pressed={chosen === o.reason}
                className={cn(
                  "press t-meta inline-flex h-11 items-center rounded-full px-3.5 font-semibold transition-colors",
                  chosen === o.reason ? "bg-m4 text-ivory shadow-[inset_0_0_0_1px_var(--ivory)]" : "bg-m3 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] hover:text-ivory",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="swap-in t-meta flex items-start gap-2 text-ivory">
          <SealTick className="mt-px size-4 shrink-0 text-stone" />
          <span>{noted}</span>
        </p>
      )}
    </div>
  );
}
