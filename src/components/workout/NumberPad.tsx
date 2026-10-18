"use client";

// NumberPad dock: replaces the iOS keyboard on touch screens so the layout never jumps. A
// tap (or long-press) on a deck value opens it on that field; it takes the deck's place (the
// parent shows one or the other), and its Seal key is then the one gold control.

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, Delete } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PadKey } from "@/lib/workout/numpad";
import type { CellField } from "@/lib/workout/types";

export interface NumberPadProps {
  title: string;
  text: string;
  ghost: string | null;
  unitLabel: string;
  field: CellField;
  error: string | null;
  step: number;
  lastText: string | null;
  plates: string | null;
  logLabel: string;
  onKey: (k: PadKey) => void;
  onNudge: (delta: number) => void;
  onLast: () => void;
  onNext: () => void;
  onLog: () => void;
  onClose: () => void;
}

const KEYS: PadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

export function NumberPad(p: NumberPadProps) {
  const ref = useRef<HTMLDivElement>(null);
  const handlers = useRef(p);
  useEffect(() => {
    handlers.current = p;
  });

  // Hardware keyboards (iPad, desktop with the pad forced on) work too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = handlers.current;
      // Already handled: Enter on a deck value opens this pad, and that same keydown reaches the
      // window once the pad has mounted — it must not also count as "Next".
      if (e.defaultPrevented) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^[0-9]$/.test(e.key)) h.onKey(e.key as PadKey);
      else if (e.key === "." || e.key === ",") h.onKey(".");
      else if (e.key === "Backspace") h.onKey("back");
      else if (e.key === "Enter") h.onNext();
      else if (e.key === "Escape") h.onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showGhost = p.text === "" && p.ghost != null;
  const fmtStep = Number.isInteger(p.step) ? String(p.step) : p.step.toFixed(1);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={`Keypad · ${p.title}`}
      className="wk-up fixed inset-x-0 bottom-0 z-(--z-deck) rounded-t-sheet bg-m1 shadow-(--e3)"
      style={{ paddingBottom: "var(--safe-bottom)" }}
      data-numpad
    >
      <div className="mx-auto max-w-col">
        <div className="flex min-h-[52px] items-center gap-3 pl-4 pr-1.5 pt-1">
          <p className="t-eyebrow min-w-0 flex-1 truncate !text-stone">{p.title}</p>
          <p className="flex items-baseline gap-1" aria-live="polite">
            <span className={cn("t-num-m", showGhost ? "wk-ghost text-stone" : "text-ivory", p.error && "text-cinnabar")}>{showGhost ? p.ghost : p.text || "—"}</span>
            <span className="t-meta font-semibold text-stone">{p.unitLabel}</span>
          </p>
          <button type="button" onClick={p.onClose} aria-label="Close keypad" className="press grid size-11 place-items-center rounded-full text-stone hover:text-ivory">
            <ChevronDown className="size-5" />
          </button>
        </div>
        {p.error && (
          <p className="t-meta -mt-1 px-4 pb-1.5 font-semibold text-cinnabar" role="alert">
            {p.error}
          </p>
        )}
        <div className="flex items-center gap-2 px-3 pb-2.5">
          <PadChip label={`Minus ${fmtStep}`} onClick={() => p.onNudge(-p.step)}>
            −{fmtStep}
          </PadChip>
          <PadChip label={`Plus ${fmtStep}`} onClick={() => p.onNudge(p.step)}>
            +{fmtStep}
          </PadChip>
          {p.lastText != null && (
            <PadChip label={`Use last value ${p.lastText}`} onClick={p.onLast}>
              = Last <span className="text-stone">{p.lastText}</span>
            </PadChip>
          )}
          {p.plates && <span className="t-meta ml-1 min-w-0 flex-1 text-right leading-tight text-stone">{p.plates}</span>}
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr_96px] grid-rows-[repeat(4,56px)] gap-[6px] px-3 pb-3">
          {KEYS.map((k, i) => {
            const disabled = k === "." && p.field !== "weight";
            return (
              <button
                key={k}
                type="button"
                disabled={disabled}
                onClick={() => p.onKey(k)}
                aria-label={k === "back" ? "Delete" : k === "." ? "Decimal point" : k}
                className="press grid place-items-center rounded-field bg-m2 text-ivory shadow-[inset_0_0_0_1px_var(--vein)] active:bg-m3 disabled:opacity-25"
                style={{ gridColumn: (i % 3) + 1, gridRow: Math.floor(i / 3) + 1 }}
              >
                {k === "back" ? <Delete className="size-6 text-stone" strokeWidth={1.6} /> : <span className="t-num-l">{k}</span>}
              </button>
            );
          })}
          <button
            type="button"
            onClick={p.onNext}
            className="press col-start-4 row-span-2 row-start-1 flex flex-col items-center justify-center gap-1 rounded-btn bg-m3 text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)] active:bg-m4"
          >
            <span className="t-key">Next</span>
          </button>
          <button
            type="button"
            onClick={p.onLog}
            data-gold="fill"
            className="leaf-btn press col-start-4 row-span-2 row-start-3 flex flex-col items-center justify-center rounded-btn px-1 text-center text-ink"
          >
            <span className="t-key leading-tight">{p.logLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function PadChip({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="press t-callout tnum inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-m3 px-4 font-semibold text-ivory shadow-[inset_0_0_0_1px_var(--vein-2)] hover:bg-m4"
    >
      {children}
    </button>
  );
}
