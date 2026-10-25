"use client";

import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { EASE_CSS, prefersReducedMotion } from "@/lib/motion";

/**
 * The old seal key, as the V3 gym button (docs/DESIGN-V3-SIMPLE.md §1.4.10, §4.2.3): a full-width
 * 64 px gold pill whose label names what it logs ("Log set 3"). One tap logs the shown values. It
 * is the viewport's one gold fill (data-gold="fill"). Deleted at integration (§6.7); the workout
 * moves to <Button variant="primary" size="xl">.
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
        "press t-button-gym flex h-16 w-full items-center justify-center gap-2 rounded-pill bg-gold px-5 text-gold-ink",
        "disabled:bg-control disabled:text-fg-2",
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
          <span className="truncate tabular-nums">{detail}</span>
        </>
      )}
      {!noTick && <Check className="size-5 shrink-0" strokeWidth={2.4} aria-hidden />}
    </button>
  );
});
