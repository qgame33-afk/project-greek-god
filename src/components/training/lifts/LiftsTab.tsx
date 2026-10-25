"use client";

import { BackHeader } from "@/components/shell/BackHeader";
import { Segmented } from "@/components/ui/controls";
import { useSwapIn } from "@/lib/motion";
import type { useTrainingWeek } from "../hooks";
import { History } from "./History";
import { Lifts } from "./Lifts";

export type LiftsView = "library" | "history";

/** Train › Lifts and history (docs/DESIGN-V3-SIMPLE.md §4.3.10, `train-lifts`): Lifts · History. */
export function LiftsPage({ week, view, onView }: { week: ReturnType<typeof useTrainingWeek>; view: LiftsView; onView: (v: LiftsView) => void }) {
  const ref = useSwapIn<HTMLDivElement, number>(view === "library" ? 0 : 1);
  return (
    <div>
      <BackHeader href="/training" parent="Train" title="Lifts" />
      <Segmented<LiftsView>
        ariaLabel="Lifts or history"
        value={view}
        onChange={onView}
        className="mt-3"
        options={[
          { value: "library", label: "Lifts" },
          { value: "history", label: "History" },
        ]}
      />
      <div ref={ref} className="mt-4">
        {view === "library" ? <Lifts /> : <History week={week} />}
      </div>
    </div>
  );
}
