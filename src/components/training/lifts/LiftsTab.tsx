"use client";

import { Segmented } from "@/components/ui/controls";
import { useSwapIn } from "@/lib/motion";
import type { useTrainingWeek } from "../hooks";
import { History } from "./History";
import { Library } from "./Library";

export type LiftsView = "library" | "history";

/** Train → Lifts (§3.4.3): the exercise library with bests and 28-day lines, and session history. */
export function LiftsTab({ week, view, onView, onStartToday }: { week: ReturnType<typeof useTrainingWeek>; view: LiftsView; onView: (v: LiftsView) => void; onStartToday: () => void }) {
  const ref = useSwapIn<HTMLDivElement, number>(view === "library" ? 0 : 1);
  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <h1 className="t-title-1 text-ivory">Lifts</h1>
        <Segmented<LiftsView>
          size="sm"
          ariaLabel="Lifts view"
          value={view}
          onChange={onView}
          className="w-full max-w-60"
          options={[
            { value: "library", label: "Library" },
            { value: "history", label: "History" },
          ]}
        />
      </header>
      <div ref={ref} className="mt-5">
        {view === "library" ? <Library today={week.today} /> : <History week={week} onStartToday={onStartToday} />}
      </div>
    </div>
  );
}
