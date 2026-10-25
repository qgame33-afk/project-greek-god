"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Small pieces every Train sheet shares (docs/DESIGN-V3-SIMPLE.md §4.3.4): the plain reason under
 * a sheet's title, the checked list of what a change does, and the button stack at the bottom.
 * Built on the V3 kit's surfaces (a list inside a sheet steps up to --sheet-card by itself).
 */

/** One or two sentences of plain reason in --text-2 (the suggestion's "How we got this"). */
export function SheetReason({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("t-body text-fg-2", className)} data-program-text="">
      {children}
    </p>
  );
}

export interface CheckedLine {
  title: ReactNode;
  subtitle?: ReactNode;
  /** The title is a name from data (a lift, a workout): one word for the budget. */
  dataName?: boolean;
}

/** The changes as a checked list: a row per change with a white check on the right. */
export function CheckedList({ lines, label, className }: { lines: CheckedLine[]; label?: string; className?: string }) {
  return (
    <ul aria-label={label} className={cn("overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line", className)}>
      {lines.map((l, i) => (
        <li key={i} className={cn("flex items-center gap-3.5 px-4", l.subtitle != null ? "min-h-[68px] py-3" : "min-h-14 py-2.5")}>
          <span className="min-w-0 flex-1">
            <span className="t-row block" data-budget-name={l.dataName ? "" : undefined}>
              {l.title}
            </span>
            {l.subtitle != null && <span className="t-label mt-0.5 block">{l.subtitle}</span>}
          </span>
          <Check className="size-5 shrink-0 text-fg" strokeWidth={2.2} aria-hidden />
        </li>
      ))}
    </ul>
  );
}

/** The bottom of a sheet: the gold primary over a secondary or ghost way out, full width. */
export function SheetActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-3", className)}>{children}</div>;
}

/** A `t-cap` caption line under a group. */
export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("t-cap mt-2.5 px-1", className)}>{children}</p>;
}
