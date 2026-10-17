"use client";

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Tag } from "./tag";

/**
 * "Proposed · not saved" (docs/DESIGN-V2.md §3.9.2–3.9.3): every change the Oracle suggests
 * (a calorie target, protein, a session swap) arrives as this card with the exact before → after.
 * `Not now` writes nothing; `Apply…` opens the caller's confirm (which writes through the existing
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
    <section className={cn("rounded-card border border-aegean-line bg-m2 p-4", className)}>
      <div className="flex items-center gap-2">
        <Tag kind="AI" />
        <span className="t-tag text-aegean">Proposed · not saved</span>
      </div>
      <h3 className="t-title-2 mt-2 text-ivory">{title}</h3>
      <dl className="mt-3 divide-y divide-vein border-y border-vein">
        {rows.map((r, i) => (
          <div key={i} className="flex min-h-12 items-center justify-between gap-3 py-2">
            <dt className="t-callout text-stone">{r.label}</dt>
            <dd className="flex items-center gap-2 text-right">
              <span className="t-num-s text-stone line-through decoration-ui-line">{r.before}</span>
              <ArrowRight className="size-4 text-ash" strokeWidth={1.6} aria-label="to" />
              <span className="t-num-s text-ivory">{r.after}</span>
            </dd>
          </div>
        ))}
      </dl>
      {note && <p className="t-meta mt-2 text-ash">{note}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onDismiss} disabled={applying}>
          Not now
        </Button>
        <Button variant="outline" onClick={onApply} loading={applying}>
          Apply…
        </Button>
      </div>
    </section>
  );
}
