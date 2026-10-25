"use client";

import { Check } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * The check circle (docs/DESIGN-V3-SIMPLE.md §1.4.9), 44 px:
 *   done  white fill, black check (VoiceOver "Eaten, undo" by default)
 *   next  gold fill, --gold-ink check: the screen's one gold fill (data-gold="fill")
 *   todo  a 2 px --ui-line ring
 * A button when it has `onClick`; otherwise a mark (pass `label` to name it as an image).
 *
 *   <CheckCircle state="next" onClick={eat} label="Mark Berry Protein Smoothie eaten" />
 */
export type CheckState = "done" | "next" | "todo";

export function CheckCircle({
  state,
  label,
  className,
  onClick,
  disabled,
  ...rest
}: { state: CheckState; label?: string; className?: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const name = label ?? (state === "done" ? "Eaten, undo" : "Mark eaten");
  const cls = cn(
    "grid size-11 shrink-0 place-items-center rounded-full",
    state === "done" && "bg-fg text-bg",
    state === "next" && "bg-gold text-gold-ink",
    state === "todo" && "border-2 border-ui-line text-fg-2",
    className,
  );
  const gold = state === "next" && !disabled ? "fill" : undefined;
  const mark = state === "todo" ? null : <Check className="size-5" strokeWidth={2.4} aria-hidden />;
  if (!onClick)
    return (
      <span role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cls} data-gold={gold} data-check={state}>
        {mark}
      </span>
    );
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={name} className={cn("press disabled:opacity-50", cls)} data-gold={gold} data-check={state} {...rest}>
      {mark}
    </button>
  );
}
