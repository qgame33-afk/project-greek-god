"use client";

import { Check, RefreshCw, Undo2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FeedbackReason } from "@/lib/meals/types";
import type { StripPhase } from "./actions";
import { REGEN_REASONS } from "./model";

export type { StripPhase };

/**
 * After "Swap this meal": a calm card with Undo, another pick, and an optional "why" in one tap
 * that teaches the planner. Nothing here is required: ignoring it keeps the new meal (and tells
 * the planner it was fine). Never gold.
 */
export function RegenStrip({
  fromName,
  phase,
  noted,
  chosen,
  onUndo,
  onReason,
  onClose,
  onAgain,
  className,
}: {
  fromName: string;
  phase: StripPhase;
  noted?: string | null;
  chosen?: FeedbackReason | null;
  onUndo: () => void;
  onReason: (r: FeedbackReason) => void;
  onClose: () => void;
  /** Another pick for the same place (never one already shown). */
  onAgain?: () => void;
  className?: string;
}) {
  return (
    <section className={cn("rounded-card bg-surface px-5 pb-5 pt-2", className)} role="group" aria-label="Meal swapped">
      <div className="flex min-h-11 items-center gap-1">
        <p className="t-label min-w-0 flex-1" aria-live="polite">
          Swapped out <span className="text-fg" data-food="">{fromName}</span>
        </p>
        <button type="button" onClick={onClose} aria-label="Keep it and close" className="press -mr-3 grid size-11 shrink-0 place-items-center rounded-full text-fg-2 hover:text-fg">
          <X className="size-5" strokeWidth={1.9} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onUndo} className="press t-label hit-44 inline-flex h-9 items-center gap-1.5 rounded-pill bg-control px-3.5 font-semibold text-fg">
          <Undo2 className="size-4" strokeWidth={1.9} aria-hidden />
          Undo
        </button>
        {onAgain && phase === "ask" && (
          <button type="button" onClick={onAgain} className="press t-label hit-44 inline-flex h-9 items-center gap-1.5 rounded-pill bg-control px-3.5 font-semibold text-fg">
            <RefreshCw className="size-4" strokeWidth={1.9} aria-hidden />
            Another one
          </button>
        )}
      </div>
      {phase === "ask" ? (
        <>
          <p className="t-label mt-4">What was wrong with it? Optional: it teaches the planner.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {REGEN_REASONS.map((o) => (
              <button
                key={o.reason}
                type="button"
                onClick={() => onReason(o.reason)}
                aria-pressed={chosen === o.reason}
                className={cn("press t-label hit-44 inline-flex h-9 items-center rounded-pill px-3.5 font-semibold", chosen === o.reason ? "bg-fg text-bg" : "bg-control text-fg")}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="swap-in t-body mt-3 flex items-start gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-fg-2" strokeWidth={2.2} aria-hidden />
          <span>{noted}</span>
        </p>
      )}
    </section>
  );
}
