"use client";

import { Check, Undo2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FeedbackReason } from "@/lib/meals/types";
import { REGEN_REASONS } from "./model";

export type StripPhase = "ask" | "noted";

/**
 * The non-blocking strip under a regenerated meal: Undo, then an optional "why" in one tap.
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
    <div className="border-t border-line-hair bg-[linear-gradient(180deg,rgb(255_255_255/.025),transparent)] px-4 pt-2 pb-4" role="group" aria-label="Meal swapped">
      <div className="flex min-h-11 items-center gap-1">
        <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-fg-2" aria-live="polite">
          Swapped out <span className="text-fg">{fromName}</span>
        </p>
        <button type="button" onClick={onUndo} className="press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[12px] px-2.5 text-[13.5px] font-bold text-gold-300 hover:text-gold-200">
          <Undo2 className="size-4" aria-hidden />
          Undo
        </button>
        <button type="button" onClick={onClose} aria-label="Keep it and close" className="press -mr-2 grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-3 hover:text-fg">
          <X className="size-[18px]" />
        </button>
      </div>
      {phase === "ask" ? (
        <>
          <p className="text-[12px] font-medium text-fg-3">What was wrong with it? Optional — it teaches the planner.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {REGEN_REASONS.map((o) => (
              <button
                key={o.reason}
                type="button"
                onClick={() => onReason(o.reason)}
                className={cn(
                  "press relative inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
                  chosen === o.reason ? "border-line-gold bg-gold-tint text-gold-300" : "border-line bg-s3 text-fg-2 hover:text-fg",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="swap-in flex items-start gap-2 text-[13px] font-semibold leading-snug text-fg-2">
          <Check className="mt-px size-4 shrink-0 text-success" aria-hidden />
          <span>{noted}</span>
        </p>
      )}
    </div>
  );
}
