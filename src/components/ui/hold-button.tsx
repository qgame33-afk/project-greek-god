"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Confirm } from "./sheet";

/**
 * Hold to seal (docs/DESIGN-V2.md §3.2.7, §3.11): press and hold for 600 ms while a fill grows;
 * releasing early cancels. There is ALWAYS an accessible path: a tap, a VoiceOver double-tap,
 * Switch Control or Enter/Space opens a two-button confirm instead (`Seal session` / `Not yet`).
 * The bar is a real `button` described by its instructions. Gold-leaf, 64 px, data-gold="fill".
 *
 *   <HoldButton label="Hold to seal" confirmTitle="Seal Push A?" confirmLabel="Seal session"
 *     onConfirm={finish} />
 */
export function HoldButton({
  label,
  onConfirm,
  confirmTitle,
  confirmBody,
  confirmLabel,
  cancelLabel = "Not yet",
  holdMs = 600,
  disabled,
  busy,
  className,
  instructions = "Press and hold to confirm, or tap for a confirm step.",
}: {
  label: ReactNode;
  onConfirm: () => void;
  confirmTitle: string;
  confirmBody?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  holdMs?: number;
  disabled?: boolean;
  /** Shows the label dimmed and ignores input while the action runs. */
  busy?: boolean;
  className?: string;
  instructions?: string;
}) {
  const descId = useId();
  const [holding, setHolding] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const off = disabled || busy;

  const clear = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  useEffect(() => clear, []);

  return (
    <>
      <button
        type="button"
        disabled={off}
        aria-describedby={descId}
        aria-busy={busy || undefined}
        data-gold={off ? undefined : "fill"}
        onPointerDown={(e) => {
          if (off || e.button !== 0) return;
          fired.current = false;
          setHolding(true);
          timer.current = window.setTimeout(() => {
            timer.current = null;
            fired.current = true;
            setHolding(false);
            onConfirm();
          }, holdMs);
        }}
        onPointerUp={() => timer.current != null && clear()}
        onPointerLeave={() => timer.current != null && clear()}
        onPointerCancel={() => timer.current != null && clear()}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          // A completed hold already fired. Anything else — a quick tap, a VoiceOver double-tap,
          // Switch Control, Enter/Space — gets the two-button confirm.
          if (fired.current) {
            fired.current = false;
            return;
          }
          if (!off) setConfirmOpen(true);
        }}
        className={cn(
          "leaf-btn t-key relative flex h-16 w-full select-none items-center justify-center gap-2 rounded-btn px-6 text-ink touch-none",
          "disabled:bg-none disabled:bg-m3 disabled:text-disabled disabled:shadow-[inset_0_0_0_1px_var(--vein-2)] disabled:after:hidden",
          className,
        )}
      >
        <span
          aria-hidden
          className="motion-keep pointer-events-none absolute inset-0 origin-left bg-[rgb(255_250_230/.42)]"
          style={{
            transform: `scaleX(${holding ? 1 : 0})`,
            transition: holding ? `transform ${holdMs}ms linear` : "transform 160ms var(--ease-out)",
          }}
        />
        <span className={cn("relative", busy && "opacity-60")}>{label}</span>
      </button>
      <span id={descId} className="sr-only">
        {instructions}
      </span>
      <Confirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmTitle}
        body={confirmBody}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        destructive={false}
        onConfirm={onConfirm}
      />
    </>
  );
}
