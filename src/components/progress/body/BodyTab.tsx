"use client";

import { Measurements } from "./Measurements";
import { PhotosCard } from "./PhotosCard";

/** Progress › Body (docs/DESIGN-V3-SIMPLE.md §4.5.4): the photos card, then measurements. */
export function BodyTab() {
  return (
    <div>
      <PhotosCard />
      <Measurements />
    </div>
  );
}
