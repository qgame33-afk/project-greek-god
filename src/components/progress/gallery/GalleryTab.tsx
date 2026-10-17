"use client";

import { Measurements } from "./Measurements";
import { Photos } from "./Photos";

/**
 * Ascent → Gallery (docs/DESIGN-V2.md §3.6.3): progress photos as framed pairs with date
 * placards, then tape measurements first → latest. Images stay private (signed URLs).
 */
export function GalleryTab() {
  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-x-10">
      <Photos />
      <Measurements />
    </div>
  );
}
