"use client";

import { Plus } from "lucide-react";
import { openOffering } from "@/components/offering/store";
import { cn } from "@/lib/cn";

/**
 * The + (docs/DESIGN-V3-SIMPLE.md §3.1): a 58 px WHITE circle with a black 28 px Plus (stroke 2.6)
 * at the right end of the tab bar, rising 14 px above it. VoiceOver "Add". Opens the Add sheet
 * through the existing `openOffering({ mode: "log" })` store. Never gold. `variant="rail"` is the
 * desktop rail's row.
 */
export function PlusButton({ variant = "bar", className }: { variant?: "bar" | "rail"; className?: string }) {
  if (variant === "rail")
    return (
      <button
        type="button"
        onClick={() => openOffering({ mode: "log" })}
        aria-label="Add"
        className={cn("press t-row flex h-11 w-full items-center gap-3 rounded-pill px-2 text-fg hover:bg-white/5", className)}
      >
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-fg text-bg">
          <Plus className="size-5" strokeWidth={2.6} />
        </span>
        Add
      </button>
    );
  return (
    <button
      type="button"
      onClick={() => openOffering({ mode: "log" })}
      aria-label="Add"
      data-plus=""
      className={cn("press vt-fab grid size-[58px] shrink-0 place-items-center rounded-full bg-fg text-bg", className)}
    >
      <Plus className="size-7" strokeWidth={2.6} aria-hidden />
    </button>
  );
}
