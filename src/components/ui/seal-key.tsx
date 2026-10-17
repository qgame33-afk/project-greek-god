"use client";

import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { EASE_CSS, prefersReducedMotion } from "@/lib/motion";

/**
 * The seal key (docs/DESIGN-V2.md §3.2.1): Gym Mode's full-width 64 px gold-leaf key in the thumb
 * deck — `SEAL SET 3 · 190 × 5 ✓`. One tap logs the shown values. It is the viewport's one gold
 * fill (data-gold="fill"). Bump `pulse` (a counter) to play the Final-10 pulse once
 * (scale 1 → 1.03 → 1, 300 ms; skipped under reduced motion).
 */
export interface SealKeyProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: ReactNode;
  /** The values on the key: "190 × 5". */
  detail?: ReactNode;
  pulse?: number;
  /** Hide the ✓ (e.g. "HOLD TO SEAL PUSH A"). */
  noTick?: boolean;
}

export const SealKey = forwardRef<HTMLButtonElement, SealKeyProps>(function SealKey(
  { label, detail, pulse, noTick, className, disabled, type, ...rest },
  outer,
) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!el || pulse == null || prefersReducedMotion() || typeof el.animate !== "function") return;
    el.animate([{ transform: "scale(1)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }], { duration: 300, easing: EASE_CSS.out });
  }, [pulse]);
  return (
    <button
      ref={(el) => {
        ref.current = el;
        if (typeof outer === "function") outer(el);
        else if (outer) outer.current = el;
      }}
      type={type ?? "button"}
      disabled={disabled}
      data-gold={disabled ? undefined : "fill"}
      className={cn(
        "leaf-btn press t-key flex h-16 w-full items-center justify-center gap-2.5 rounded-btn px-5 text-ink",
        "disabled:bg-none disabled:bg-m3 disabled:text-disabled disabled:shadow-[inset_0_0_0_1px_var(--vein-2)] disabled:after:hidden",
        className,
      )}
      {...rest}
    >
      <span className="truncate">{label}</span>
      {detail != null && (
        <>
          <span aria-hidden className="opacity-60">
            ·
          </span>
          <span className="tnum truncate tracking-[0.04em]">{detail}</span>
        </>
      )}
      {!noTick && <Check className="size-5 shrink-0" strokeWidth={2.2} aria-hidden />}
    </button>
  );
});
