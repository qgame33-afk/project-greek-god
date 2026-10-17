"use client";

import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProposalCard } from "@/components/ui/proposal-card";
import { Confirm } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { fieldLabel, planApply, type ApplyProfile } from "@/lib/coach/apply";
import { useApplyProfileChange, useRevertProfileChange } from "@/lib/coach/hooks";
import { suggestionIsCurrent } from "@/lib/coach/suggestions";
import type { CoachSuggestion, SuggestionStatus } from "@/lib/coach/types";
import type { Profile } from "@/lib/data/profile";
import { formatInt } from "@/lib/units";

const UNIT: Partial<Record<NonNullable<CoachSuggestion["field"]>, string>> = { calorie_goal: " kcal/day", protein_goal: " g/day" };

/**
 * One change the Oracle proposes (docs/DESIGN-V2.md §3.9.2), as "Proposed · not saved": the exact
 * before → after, `Not now` (writes nothing but the dismissal on the message) and `Apply…`, which
 * opens a confirm showing the diff and only then writes through useApplyProfileChange (the goal
 * history records it; Undo puts the old values back and removes that history row). A note (advice
 * that changes no setting) has only `Got it`.
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
      <p className="t-callout mt-4 flex min-h-11 items-center gap-2.5 rounded-field bg-m2 px-3.5 py-2 text-stone shadow-(--e1)">
        <Check className="size-4 shrink-0 text-ivory" strokeWidth={2} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-ivory">{isNote ? s.title : `${label} set to ${s.proposedLabel}`}</span>
          {s.decidedAt && <span> · {new Date(s.decidedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
        </span>
      </p>
    );
  }

  if (s.status === "dismissed") {
    return (
      <div className="t-callout mt-4 flex min-h-11 items-center justify-between gap-3 rounded-field border border-dashed border-ui-line px-3.5 text-stone">
        <span className="min-w-0 truncate">
          {isNote ? "Noted" : "Not now"} · {s.title}
        </span>
        <button type="button" onClick={() => onStatus("open")} className="press -mr-2 inline-flex h-11 shrink-0 items-center gap-1.5 px-2 font-semibold text-ivory">
          <RotateCcw className="size-3.5" strokeWidth={1.8} aria-hidden />
          Review
        </button>
      </div>
    );
  }

  if (isNote) {
    return (
      <section className="mt-4 rounded-card border border-aegean-line bg-m2 p-4">
        <div className="flex items-center gap-2">
          <Tag kind="AI" />
          <span className="t-tag text-aegean">Suggestion</span>
        </div>
        <h3 className="t-title-3 mt-2 text-ivory">{s.title}</h3>
        <p className="t-callout mt-1 text-stone">{s.rationale}</p>
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
    busy.current = true;
    // mutateAsync, so the toast's Undo still works after this card unmounts (sheet closed)
    save
      .mutateAsync({ values: plan.values as Record<string, number | string>, reason: `Oracle suggestion: ${s.title}` })
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
        className="mt-4"
        title={s.title}
        rows={rows.map((r) => ({ label: r.label, before: r.before, after: unitize(r.after, s, r.label === label) }))}
        note={
          <>
            {s.rationale}
            {!current && <span className="mt-1.5 block text-stone">Your {label.toLowerCase()} changed after this was proposed. Ask again for a fresh one.</span>}
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
              <dl className="divide-y divide-vein border-y border-vein">
                {rows.map((r) => (
                  <div key={r.label} className="flex min-h-12 items-center justify-between gap-3 py-2">
                    <dt className="text-stone">{r.label}</dt>
                    <dd className="flex items-center gap-2">
                      <span className="t-num-s text-stone line-through decoration-ui-line">{r.before}</span>
                      <ArrowRight className="size-4 text-ash" strokeWidth={1.6} aria-label="to" />
                      <span className="t-num-s text-ivory">{unitize(r.after, s, r.label === label)}</span>
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
