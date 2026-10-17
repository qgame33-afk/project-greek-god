"use client";

import { PlateStack } from "@/components/art/PlateStack";
import { Tag } from "@/components/ui/tag";
import type { PlateChange } from "@/lib/workout/gym";
import type { PlateLoad } from "@/lib/workout/plates";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));

/**
 * The plate stack (§3.2.1): `Per side 45 · 25 · 2.5 + 45 bar` and one sleeve drawn to scale,
 * labelled per side. The plate that changed since last session is leaf, with its caption
 * ("2.5 = today's +5 lb", CALC). Barbell lifts only; the drawing hides in the AX layout.
 */
export function Plates({ load, unit, change, drawing }: { load: PlateLoad; unit: "lb" | "kg"; change: PlateChange | null; drawing: boolean }) {
  const text = load.perSide.length ? load.perSide.map(fmt).join(" · ") : "Empty bar";
  return (
    <section aria-label="Plates" className="flex items-center gap-3 border-t border-vein pt-3">
      <div className="min-w-0 flex-1">
        <p className="t-eyebrow">Per side</p>
        <p className="t-callout tnum mt-1 text-ivory">
          {text}
          <span className="text-stone">
            {" "}
            + {load.bar} {unit} bar
          </span>
          {load.leftover > 0 && <span className="text-stone"> · +{fmt(load.leftover)} not loadable</span>}
        </p>
        {change && (
          <p className="mt-1 flex items-center gap-2">
            <span className="t-meta tnum text-leaf-300">{change.caption}</span>
            <Tag kind="CALC" className="pointer-events-none" />
          </p>
        )}
      </div>
      {drawing && load.perSide.length > 0 && <PlateStack plates={load.perSide} unit={unit} changed={change?.index ?? null} height={48} className="shrink-0" />}
    </section>
  );
}
