"use client";

import { ListGroup, Row } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import type { ISODate } from "@/lib/dates";
import type { WeightUnit } from "@/lib/units";
import { dayLabel, setText, type LiftLine } from "./model";

/**
 * All lifts (docs/DESIGN-V3-SIMPLE.md §4.5.3): every lift he has logged, with the best set of its
 * first workout and of its latest one, most recent first. Each row opens the exercise detail
 * (history, the estimated max and how it is worked out). Stored lift names count as history.
 */
export function AllLiftsSheet({ open, onOpenChange, lines, today, unit }: { open: boolean; onOpenChange: (o: boolean) => void; lines: LiftLine[]; today: ISODate; unit: WeightUnit }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="All lifts" description="Best set of the first and the latest workout">
      {lines.length === 0 ? (
        <p className="t-body pb-2 text-fg-2">Nothing logged yet. Your lifts show here after your first workout.</p>
      ) : (
        <ListGroup ariaLabel="All lifts">
          {lines.map((l) => {
            const one = l.sessions === 1;
            const first = setText(l.first.set, unit);
            const latest = setText(l.latest.set, unit);
            return (
              <Row
                key={l.key}
                title={l.name}
                subtitle={one ? "First time" : `First ${first}`}
                value={<span className="t-row tabular-nums text-fg">{latest}</span>}
                href={`/training/exercise/${encodeURIComponent(l.slug)}`}
                dataName
                history
                wrap
                ariaLabel={`${l.name}: ${one ? `first time ${dayLabel(l.first.date, today)}, ${latest.replace("×", "times")}` : `first ${first.replace("×", "times")} on ${dayLabel(l.first.date, today)}, latest ${latest.replace("×", "times")} on ${dayLabel(l.latest.date, today)}`}. Opens the lift`}
              />
            );
          })}
        </ListGroup>
      )}
    </Sheet>
  );
}
