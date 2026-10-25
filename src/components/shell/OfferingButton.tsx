"use client";

import { PlusButton } from "./PlusButton";

/**
 * The old Offering (+), now the V3 + (docs/DESIGN-V3-SIMPLE.md §3.1): kept as a wrapper until
 * integration (§6.7). The tab bar renders <PlusButton /> itself.
 */
export function OfferingButton({ variant = "float" }: { variant?: "float" | "rail" }) {
  return <PlusButton variant={variant === "rail" ? "rail" : "bar"} />;
}
