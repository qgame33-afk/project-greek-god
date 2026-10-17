"use client";

import { OfferingPlus } from "@/components/art/icons";
import { openOffering } from "@/components/offering/store";
import { cn } from "@/lib/cn";

/**
 * The Offering (+) (docs/DESIGN-V2.md §2.1): a 56 px glass circle to the right of the capsule,
 * ivory plus, "Log or ask". Opens the Offering sheet in Log mode. Sized in px like the capsule.
 * `variant="rail"` is the 48 px button at the top of the desktop rail.
 */
export function OfferingButton({ variant = "float" }: { variant?: "float" | "rail" }) {
  if (variant === "rail") {
    return (
      <button
        type="button"
        onClick={() => openOffering({ mode: "log" })}
        aria-label="Log or ask"
        title="Log or ask"
        className="press flex h-12 w-full items-center justify-center gap-2.5 rounded-btn bg-m2 text-ivory shadow-[inset_0_0_0_1px_var(--leaf-line)] hover:bg-m3 lg:justify-start lg:px-4"
      >
        <OfferingPlus className="size-[22px]" />
        <span className="hidden text-[length:max(14px,0.875rem)] font-semibold lg:inline">Log or ask</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => openOffering({ mode: "log" })}
      aria-label="Log or ask"
      data-offering="float"
      className={cn(
        "glass vt-fab press fixed right-[14px] z-(--z-chrome) grid size-[56px] place-items-center rounded-full text-ivory md:hidden",
        "shadow-[inset_0_0_0_1px_var(--leaf-line),inset_0_1px_0_rgb(255_244_220/.07),0_18px_40px_-16px_rgb(0_0_0/.9)]",
      )}
      style={{ bottom: "calc(var(--safe-bottom) + var(--capsule-gap) + 4px)" }}
    >
      <OfferingPlus className="size-[26px]" />
    </button>
  );
}
