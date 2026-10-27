"use client";

import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProposalCard } from "@/components/ui/proposal-card";
import { Confirm } from "@/components/ui/sheet";
import { AiChip } from "@/components/ui/ai-chip";
import { fieldLabel, planApply, type ApplyProfile } from "@/lib/coach/apply";
import { useApplyProfileChange, useRevertProfileChange } from "@/lib/coach/hooks";
import { suggestionIsCurrent } from "@/lib/coach/suggestions";
import type { CoachSuggestion, SuggestionStatus } from "@/lib/coach/types";
import { isOffline } from "@/lib/data/core";
import type { Profile } from "@/lib/data/profile";
import { formatInt } from "@/lib/units";

const UNIT: Partial<Record<NonNullable<CoachSuggestion["field"]>, string>> = { calorie_goal: " kcal/day", protein_goal: " g/day" };

/**
 * One change Coach suggests (docs/DESIGN-V3-SIMPLE.md §4.8), as an AI card "Suggested change · Not
 * saved": the exact before → after, `Not now` (writes nothing but the dismissal on the message) and
 * `Review`, which opens the confirm showing the diff; only its `Apply` writes, through
 * useApplyProfileChange (profiles + goal_changes; Undo puts the old values back and removes that
 * history row). A note (advice that changes no setting) has only `Got it`.
 */
export function Proposal({ suggestion: s, profile, onStatus }: { suggestion: CoachSuggestion; profile: Profile | undefined; onStatus: (st: SuggestionStatus) => void }) {
  const [confirm, setConfirm] = useState(false);
  const save = useApplyProfileChange();
  const revert = useRevertProfileChange();
  const busy = useRef(false);
  const isNote = s.kind === "note" || !s.field;
  const current = isNote || suggestionIsCurrent(s, profile as unknown as Record<string, unknown>);
  const plan = profile && !isNote ? planApply(s, profile as unknown as ApplyProfile) : null;
  const label = fieldLabel(s);

  if (s.status === "applied") {
    return (
      <p className="t-label mt-3 flex min-h-11 items-center gap-2.5 rounded-tile-lg bg-card px-4 py-2">
        <Check className="size-4 shrink-0 text-fg" strokeWidth={2.2} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-fg">{isNote ? s.title : `${label} set to ${s.proposedLabel}`}</span>
          {s.decidedAt && <span> · {new Date(s.decidedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
        </span>
      </p>
    );
  }

  if (s.status === "dismissed") {
    return (
      <div className="t-label mt-3 flex min-h-11 items-center justify-between gap-3 rounded-tile-lg border border-dashed border-ui-line px-4">
        <span className="min-w-0 truncate">
          {isNote ? "Noted" : "Not now"} · {s.title}
        </span>
        <button type="button" onClick={() => onStatus("open")} className="press -mr-2 inline-flex h-11 shrink-0 items-center gap-1.5 px-2 font-semibold text-fg">
          <RotateCcw className="size-3.5" strokeWidth={1.8} aria-hidden />
          Review
        </button>
      </div>
    );
  }

  if (isNote) {
    return (
      <section className="mt-3 rounded-card border border-ai-line bg-surface p-[18px]">
        <AiChip label="AI" status="Suggestion" />
        <h3 className="t-section mt-3">{s.title}</h3>
        <p className="t-label mt-1" data-ai-answer="">
          {s.rationale}
        </p>
        <Button variant="ghost" size="sm" className="mt-2 -ml-3" onClick={() => onStatus("dismissed")}>
          Got it
        </Button>
      </section>
    );
  }

  // the exact diff: the field itself, plus anything the change moves with it (carbs)
  const rows: { label: string; before: string; after: string }[] = [{ label, before: `${s.currentLabel ?? "—"}`, after: `${s.proposedLabel ?? "—"}` }];
  if (plan?.values.carb_goal != null && plan.previous.carb_goal != null) rows.push({ label: "Carbs", before: `${formatInt(plan.previous.carb_goal)} g`, after: `${formatInt(plan.values.carb_goal)} g` });

  const apply = () => {
    if (!plan || busy.current) return;
    // offline: say so at once rather than spinning until the connection comes back
    if (isOffline()) {
      toast.error("You're offline", { description: `${label} stays at ${s.currentLabel ?? "its current value"}. Apply it again once you're back online.` });
      return;
    }
    busy.current = true;
    // mutateAsync, so the toast's Undo still works after this card unmounts (sheet closed)
    save
      .mutateAsync({ values: plan.values as Record<string, number | string>, reason: `Coach suggestion: ${s.title}` })
      .then(({ goalChangeIds }) => {
        onStatus("applied");
        toast(`${label} set to ${s.proposedLabel}`, {
          description: "Saved to your goal history.",
          duration: 6000,
          action: {
            label: "Undo",
            onClick: () => {
              revert
                .mutateAsync({ values: plan.previous as Record<string, number | string>, goalChangeIds })
                .then(() => {
                  onStatus("open");
                  toast(`${label} back to ${s.currentLabel}`);
                })
                .catch(() => {});
            },
          },
        });
      })
      .catch(() => {})
      .finally(() => {
        busy.current = false;
      });
  };

  return (
    <>
      <ProposalCard
        className="mt-3"
        title={s.title}
        rows={rows.map((r) => ({ label: r.label, before: r.before, after: unitize(r.after, s, r.label === label) }))}
        note={
          <>
            {s.rationale}
            {!current && <span className="mt-1.5 block">Your {label.toLowerCase()} changed after this was proposed. Ask again for a fresh one.</span>}
          </>
        }
        onDismiss={() => onStatus("dismissed")}
        onApply={() => current && plan && setConfirm(true)}
        applying={save.isPending}
      />
      {plan && (
        <Confirm
          open={confirm}
          onOpenChange={setConfirm}
          title={`Change ${label.toLowerCase()}?`}
          destructive={false}
          confirmLabel="Apply"
          cancelLabel="Not now"
          onConfirm={apply}
          body={
            <div>
              <dl className="[&>div+div]:border-t [&>div+div]:border-line">
                {rows.map((r) => (
                  <div key={r.label} className="flex min-h-12 items-center justify-between gap-3 py-2">
                    <dt>{r.label}</dt>
                    <dd className="flex flex-wrap items-center justify-end gap-x-2">
                      <span className="t-row whitespace-nowrap text-fg-2 line-through decoration-ui-line">{r.before}</span>
                      <ArrowRight className="size-4 text-fg-3" strokeWidth={2.2} aria-label="to" />
                      <span className="t-row whitespace-nowrap text-fg">{unitize(r.after, s, r.label === label)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <ul className="mt-3 space-y-1.5">
                {plan.effects.map((e) => (
                  <li key={e}>{e}</li>
                ))}
                {s.field !== "training_mode" && <li>Saved to your goal history. You can change it back any time in Settings.</li>}
              </ul>
            </div>
          }
        />
      )}
    </>
  );
}

/** "3,450 kcal" → "3,450 kcal/day" for daily targets, as the spec writes the diff. */
function unitize(after: string, s: CoachSuggestion, main: boolean) {
  const u = main && s.field ? UNIT[s.field] : undefined;
  if (!u) return after;
  const base = u.replace("/day", "").trim();
  return after.endsWith(base) ? `${after}/day` : after;
}
