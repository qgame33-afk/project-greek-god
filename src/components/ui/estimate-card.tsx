import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AiChip } from "./ai-chip";

/**
 * The AI card (docs/DESIGN-V3-SIMPLE.md §1.4.19, §4.7.2): what the scanner, the Add sheet's
 * sentence and the coach's meal drafts return BEFORE anything is saved. A --card with a 1 px
 * --ai-line border, so an unsaved estimate can never look like a logged row; the chip
 * "AI estimate" + "Not saved yet"; the items; an optional consequence line ("After this: 152 kcal
 * and 23 g protein to go today."); and the actions (one gold "Add as …" at most). It never saves
 * without the gold confirm.
 *
 *   <AiCard title="Pepperoni pizza, 3 slices" status="unsaved" items={…}
 *     consequence="After this: 152 kcal and 23 g protein to go today."
 *     actions={<Button variant="primary" block>Add as dinner</Button>} />
 */
export type EstimateStatus = "unsaved" | "saving" | "saved" | "error";

const STATUS: Record<EstimateStatus, string> = {
  unsaved: "Not saved yet",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
};

export function EstimateCard({
  title,
  tag,
  status,
  items,
  consequence,
  actions,
  note,
  className,
}: {
  title: ReactNode;
  /** Replaces the default chip. */
  tag?: ReactNode;
  status: EstimateStatus;
  items: ReactNode;
  consequence?: ReactNode;
  actions: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-card border border-ai-line bg-surface p-[18px]", className)} aria-live="polite" aria-busy={status === "saving" || undefined} data-ai-card="">
      {tag ?? <AiChip label="AI estimate" status={STATUS[status]} />}
      <h3 className="t-section mt-3 text-fg" data-food="">
        {title}
      </h3>
      <div className="mt-3">{items}</div>
      {consequence && <div className="t-label mt-3 flex flex-wrap items-center gap-2">{consequence}</div>}
      {note && <div className="t-cap mt-2">{note}</div>}
      <div className="mt-4 flex flex-col gap-2">{actions}</div>
    </section>
  );
}

/** The V3 name of the same card (§1.4.19). */
export const AiCard = EstimateCard;
