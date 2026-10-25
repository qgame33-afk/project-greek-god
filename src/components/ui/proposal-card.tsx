"use client";

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { AiChip } from "./ai-chip";
import { Button } from "./button";

/**
 * A suggested change (docs/DESIGN-V3-SIMPLE.md §4.8): every change the coach suggests (a calorie
 * target, protein, a training mode) arrives as this AI card with the exact before → after. "Not
 * now" writes nothing; "Review" opens the caller's confirm (which writes through the existing
 * goal-change path). Nothing is ever applied from the card itself.
 */
export function ProposalCard({
  title,
  rows,
  onDismiss,
  onApply,
  applying,
  note,
  className,
}: {
  title: ReactNode;
  rows: { label: ReactNode; before: ReactNode; after: ReactNode }[];
  onDismiss: () => void;
  onApply: () => void;
  applying?: boolean;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-card border border-ai-line bg-surface p-[18px]", className)}>
      <AiChip label="AI" status="Suggested change · Not saved" />
      <h3 className="t-section mt-3 text-fg">{title}</h3>
      <dl className="mt-3 overflow-hidden rounded-tile-lg bg-control [&>*+*]:border-t [&>*+*]:border-line">
        {rows.map((r, i) => (
          <div key={i} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5">
            <dt className="t-label">{r.label}</dt>
            <dd className="flex items-center gap-2 text-right">
              <span className="t-row text-fg-2 line-through decoration-ui-line">{r.before}</span>
              <ArrowRight className="size-4 text-fg-3" strokeWidth={2.2} aria-label="to" />
              <span className="t-row text-fg">{r.after}</span>
            </dd>
          </div>
        ))}
      </dl>
      {note && <p className="t-cap mt-2">{note}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onDismiss} disabled={applying}>
          Not now
        </Button>
        <Button variant="secondary" onClick={onApply} loading={applying}>
          Review
        </Button>
      </div>
    </section>
  );
}
