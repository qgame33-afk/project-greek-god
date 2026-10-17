"use client";

import { AthleticTab } from "../athletic/AthleticTab";
import { StrengthTab } from "../strength/StrengthTab";

/** Ascent → Hall (docs/DESIGN-V2.md §3.6.2): strength and athletic records. */
export function HallTab() {
  return (
    <div className="grid grid-cols-1 gap-10">
      <section id="ascent-strength" className="scroll-mt-24">
        <StrengthTab />
      </section>
      <section id="ascent-athletic" className="scroll-mt-24">
        <AthleticTab />
      </section>
    </div>
  );
}
