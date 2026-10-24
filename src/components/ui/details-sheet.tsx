"use client";

import { Info } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Sheet } from "./sheet";

/**
 * "How we got this" (docs/DESIGN-V3-SIMPLE.md §1.4.21, law 5): every derived number opens one.
 * This is where provenance lives now that the tags are gone: a few rows with the numbers, an
 * optional note card, and one plain paragraph that names the inputs and the rule.
 *
 *   <DetailsSheet open={open} onOpenChange={setOpen} title="Today in numbers"
 *     rows={[{ label: "Calories", value: "1,887 kcal", detail: "1,413 to go of 3,300 kcal" }]}
 *     note={<>If you eat what is planned · 3,386 kcal and 198 g protein by tonight</>}
 *     how="Goals come from Settings › Goals. Eaten adds up the 3 foods you logged today." />
 *
 * The paragraph carries `data-how` and `data-budget-group` (§5.1, §5.4).
 */
export interface DetailsRow {
  label: ReactNode;
  value: ReactNode;
  /** A line under the label ("1,413 to go of 3,300 kcal"). */
  detail?: ReactNode;
}

export interface DetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  rows?: DetailsRow[];
  /** A card between the rows and the paragraph ("If you eat what is planned · …"). */
  note?: ReactNode;
  /** The "How we got this" paragraph: the inputs and the rule, in plain words. */
  how: ReactNode;
  /** Anything else under the paragraph (an action, a source chip). */
  children?: ReactNode;
}

export function DetailsSheet({ open, onOpenChange, title, rows = [], note, how, children }: DetailsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <DetailsBody rows={rows} note={note} how={how}>
        {children}
      </DetailsBody>
    </Sheet>
  );
}

/** The sheet's content, for a caller that already has a sheet open (a second step inside one). */
export function DetailsBody({ rows = [], note, how, children }: Omit<DetailsSheetProps, "open" | "onOpenChange" | "title">) {
  return (
    <div className="flex flex-col gap-3 pb-2">
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-tile-lg bg-sheet-card">
          {rows.map((r, i) => (
            <div key={i} className={cn("flex min-h-14 items-center gap-3 px-4 py-3", i > 0 && "border-t border-line", r.detail != null && "min-h-[68px]")}>
              <div className="min-w-0 flex-1">
                <p className="t-row">{r.label}</p>
                {r.detail != null && <p className="t-label mt-0.5">{r.detail}</p>}
              </div>
              <p className="t-row shrink-0 text-right tabular-nums">{r.value}</p>
            </div>
          ))}
        </div>
      )}
      {note != null && <div className="t-row rounded-tile-lg bg-sheet-card px-4 py-3.5">{note}</div>}
      <section aria-label="How we got this" className="mt-3">
        <h3 className="t-section">How we got this</h3>
        <p data-how="" data-budget-group="" className="t-body mt-2 text-fg-2">
          {how}
        </p>
      </section>
      {children}
    </div>
  );
}

/**
 * A 44 px Info button that opens a DetailsSheet with one explanation. The old Tag's `explain`
 * renders this until the owning stream adds its own "How we got this".
 */
export function InfoButton({ title = "How we got this", how, label = "How this is worked out", className }: { title?: ReactNode; how: ReactNode; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-haspopup="dialog"
        className={cn("press -m-3 inline-grid size-11 shrink-0 place-items-center rounded-full align-middle text-fg-3 hover:text-fg-2", className)}
      >
        <Info className="size-4" strokeWidth={2.2} aria-hidden />
      </button>
      <DetailsSheet open={open} onOpenChange={setOpen} title={title} how={how} />
    </>
  );
}
