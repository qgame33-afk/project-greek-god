import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Tag } from "./tag";

/**
 * The AI estimate card (docs/DESIGN-V2.md §3.9.3): what the scanner, the Offering's natural-language
 * log and the Oracle's meal drafts return, BEFORE anything is saved. An aegean rim, the header
 * "AI · ESTIMATE · Not saved yet", the items, an optional CALC consequence line ("If you add it:
 * 3,435 kcal · 190 g"), and the actions (one gold `Confirm & add` at most).
 *
 *   <EstimateCard title="Pepperoni pizza, 3 slices" status="unsaved" items={…}
 *     consequence={<>If you add it: 3,435 kcal · 190 g <Tag kind="CALC" /></>}
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
  /** Replaces the default AI · ESTIMATE tag (e.g. with confidence pips). */
  tag?: ReactNode;
  status: EstimateStatus;
  items: ReactNode;
  consequence?: ReactNode;
  actions: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-card border border-aegean-line bg-m2 p-4 shadow-[inset_0_1px_0_var(--aegean-tint)]", className)}
      aria-live="polite"
      aria-busy={status === "saving" || undefined}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {tag ?? <Tag kind="AI" detail="Estimate" />}
        <span className={cn("t-tag", status === "error" ? "text-cinnabar" : status === "saved" ? "text-ivory" : "text-aegean")}>· {STATUS[status]}</span>
      </div>
      <h3 className="t-title-2 mt-2 text-ivory">{title}</h3>
      <div className="mt-3">{items}</div>
      {consequence && <div className="t-meta mt-3 flex flex-wrap items-center gap-2 border-t border-vein pt-3 text-stone">{consequence}</div>}
      {note && <div className="t-meta mt-2 text-ash">{note}</div>}
      <div className="mt-4 flex flex-col gap-2">{actions}</div>
    </section>
  );
}
