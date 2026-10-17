"use client";

import { BodyTab } from "../body/BodyTab";
import { PhotosTab } from "../photos/PhotosTab";

/** Ascent → Gallery (docs/DESIGN-V2.md §3.6.3): photos and measurements. */
export function GalleryTab() {
  return (
    <div className="grid grid-cols-1 gap-10">
      <section id="ascent-photos" className="scroll-mt-24">
        <PhotosTab />
      </section>
      <section id="ascent-measurements" className="scroll-mt-24">
        <BodyTab />
      </section>
    </div>
  );
}
