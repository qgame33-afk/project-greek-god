"use client";

import { ArrowRight, Check, Info, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { SuggestedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { fieldLabel, planApply, type ApplyProfile } from "@/lib/coach/apply";
import { suggestionIsCurrent } from "@/lib/coach/suggestions";
import type { CoachSuggestion, SuggestionStatus } from "@/lib/coach/types";
import { useApplyProfileChange } from "@/lib/coach/hooks";
import type { Profile } from "@/lib/data/profile";
import { cn } from "@/lib/cn";

/**
 * A SUGGESTED change (lapis, never gold). Nothing changes until the user taps Apply and then
 * confirms in a sheet; the write goes through useSaveProfile with source "suggestion" so it
 * lands in the goal history. Applied / Not now is stored on the message, so it syncs.
 */
export function SuggestionCard({
  suggestion: s,
  profile,
  onStatus,
}: {
  suggestion: CoachSuggestion;
  profile: Profile | undefined;
  onStatus: (status: SuggestionStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const save = useApplyProfileChange();
  const busy = useRef(false);
  const isNote = s.kind === "note" || !s.field;
  const current = isNote || suggestionIsCurrent(s, profile as unknown as Record<string, unknown>);
  const plan = profile && !isNote ? planApply(s, profile as unknown as ApplyProfile) : null;

  if (s.status === "applied") {
    return (
      <div className="mt-3 flex min-h-11 items-center gap-2.5 rounded-[14px] border border-line px-3.5 py-2 text-[13px] text-fg-2">
        <span className="grid size-5 place-items-center rounded-full bg-success-tint text-success">
          <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-fg">{isNote ? s.title : `${fieldLabel(s)} set to ${s.proposedLabel}`}</span>
          {s.decidedAt && <span className="text-fg-3"> · {new Date(s.decidedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
        </span>
      </div>
    );
  }

  if (s.status === "dismissed") {
    return (
      <div className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-[14px] border border-dashed border-line px-3.5 text-[13px] text-fg-3">
        <span className="min-w-0 truncate">
          {isNote ? "Noted" : "Not now"} · {s.title}
        </span>
        <button type="button" onClick={() => onStatus("open")} className="-mr-2 inline-flex h-11 shrink-0 items-center gap-1.5 px-2 font-bold text-fg-2 hover:text-fg">
          <RotateCcw className="size-3.5" aria-hidden />
          Review
        </button>
      </div>
    );
  }

  const confirm = () => {
    if (!plan || busy.current) return;
    busy.current = true;
    save.mutate(
      { values: plan.values as Record<string, number | string>, reason: `Coach suggestion: ${s.title}`, source: "suggestion" },
      {
        onSuccess: () => {
          setOpen(false);
          onStatus("applied");
          toast(`${fieldLabel(s)} set to ${s.proposedLabel}`, {
            duration: 6000,
            action: {
              label: "Undo",
              onClick: () => save.mutate({ values: plan.previous as Record<string, number | string>, reason: "Undid a coach suggestion", source: "user" }, { onSuccess: () => onStatus("open") }),
            },
          });
        },
        onSettled: () => {
          busy.current = false;
        },
      },
    );
  };

  return (
    <div className="mt-3 rounded-[16px] border border-lapis-line bg-lapis-tint p-3.5 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <SuggestedBadge>{isNote ? "Suggestion" : "Suggested"}</SuggestedBadge>
        {!isNote && <span className="text-[11.5px] font-semibold text-fg-3">{fieldLabel(s)}</span>}
      </div>
      <p className="mt-2 text-[15px] font-bold leading-snug text-fg">{s.title}</p>
      {!isNote && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="num text-[22px] font-semibold text-fg-2">{s.currentLabel}</span>
          <ArrowRight className="size-4 translate-y-[1px] self-center text-lapis-text" aria-label="to" />
          <span className="num text-[22px] font-semibold text-lapis-text">{s.proposedLabel}</span>
        </p>
      )}
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{s.rationale}</p>
      {!current && (
        <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-fg-3">
          <Info className="mt-[2px] size-3.5 shrink-0" aria-hidden />
          Your {fieldLabel(s).toLowerCase()} changed after this suggestion. Ask again for a fresh one.
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {isNote ? (
          <Button size="md" className="h-11 flex-1 border-lapis-line bg-transparent text-lapis-text hover:bg-lapis-tint sm:flex-none sm:px-5" onClick={() => onStatus("dismissed")}>
            Got it
          </Button>
        ) : (
          <>
            <Button
              size="md"
              disabled={!current || !plan}
              onClick={() => setOpen(true)}
              className={cn("h-11 flex-1 border-lapis-line bg-[rgb(111_163_236/.16)] text-lapis-text hover:bg-[rgb(111_163_236/.24)] sm:flex-none sm:px-6", (!current || !plan) && "opacity-50")}
            >
              Apply
            </Button>
            <Button variant="ghost" size="md" className="h-11 px-4" onClick={() => onStatus("dismissed")}>
              Not now
            </Button>
          </>
        )}
      </div>

      {plan && (
        <Sheet
          open={open}
          onOpenChange={(o) => !save.isPending && setOpen(o)}
          title={`Change ${fieldLabel(s).toLowerCase()}?`}
          description="Nothing changes until you confirm."
          footer={
            <div className="grid grid-cols-[1fr_1.4fr] gap-3">
              <Button variant="secondary" size="lg" onClick={() => setOpen(false)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button variant="primary" size="lg" onClick={confirm} loading={save.isPending}>
                Confirm
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[16px] bg-s3 px-4 py-4">
            <div className="min-w-0">
              <p className="eyebrow">Now</p>
              <p className="num mt-1.5 truncate text-[28px] font-semibold text-fg-2">{s.currentLabel}</p>
            </div>
            <ArrowRight className="size-5 text-lapis-text" aria-hidden />
            <div className="min-w-0">
              <p className="eyebrow text-lapis-text">New</p>
              <p className="num mt-1.5 truncate text-[28px] font-semibold text-fg">{s.proposedLabel}</p>
            </div>
          </div>
          <p className="mt-4 text-[14px] leading-relaxed text-fg-2">{s.rationale}</p>
          <ul className="mt-4 space-y-2.5">
            {plan.effects.map((e) => (
              <li key={e} className="flex gap-2.5 text-[13.5px] leading-relaxed text-fg-2">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-lapis" aria-hidden />
                {e}
              </li>
            ))}
            {s.field !== "training_mode" && (
              <li className="flex gap-2.5 text-[13.5px] leading-relaxed text-fg-2">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-lapis" aria-hidden />
                Saved to your goal history. You can change it back any time in Settings.
              </li>
            )}
          </ul>
        </Sheet>
      )}
    </div>
  );
}
