"use client";

// NumberPad dock: replaces the iOS keyboard on touch screens so the layout never jumps.
// Cells stay read-only buttons; this dock edits the targeted cell and never overlaps the
// rest dock (the parent shows one or the other).

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
      className="wk-up fixed inset-x-0 bottom-0 z-40 rounded-t-[20px] border-t border-line bg-s2 shadow-[var(--e3)]"
      style={{ paddingBottom: "var(--safe-bottom)" }}
      data-numpad
    >
      <div className="mx-auto max-w-[560px]">
        <div className="flex h-[52px] items-center gap-3 pl-4 pr-1.5">
          <p className="eyebrow min-w-0 flex-1 truncate text-fg-2">{p.title}</p>
          <p className="flex items-baseline gap-1" aria-live="polite">
            <span className={cn("num-md", showGhost ? "wk-ghost text-fg-3" : "text-fg", p.error && "text-danger")}>{showGhost ? p.ghost : p.text || "—"}</span>
            <span className="text-[12px] font-semibold text-fg-2">{p.unitLabel}</span>
          </p>
          <button type="button" onClick={p.onClose} aria-label="Close keypad" className="grid size-11 place-items-center rounded-[12px] text-fg-2 hover:text-fg">
            <ChevronDown className="size-5" />
          </button>
        </div>
        {p.error && (
          <p className="-mt-1 px-4 pb-1.5 text-[13px] font-semibold text-danger" role="alert">
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
              = Last <span className="num text-fg-2">{p.lastText}</span>
            </PadChip>
          )}
          {p.plates && <span className="ml-1 min-w-0 flex-1 text-right text-[12px] font-semibold leading-tight text-fg-3">{p.plates}</span>}
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
                className="press grid place-items-center rounded-[12px] bg-s3 text-fg active:bg-s4 disabled:opacity-25"
                style={{ gridColumn: (i % 3) + 1, gridRow: Math.floor(i / 3) + 1 }}
              >
                {k === "back" ? <Delete className="size-6 text-fg-2" /> : <span className="num text-[26px] font-semibold">{k}</span>}
              </button>
            );
          })}
          <button
            type="button"
            onClick={p.onNext}
            className="press col-start-4 row-span-2 row-start-1 flex flex-col items-center justify-center gap-1 rounded-[14px] border border-line-strong bg-s3 text-fg active:bg-s4"
          >
            <span className="t-button text-[15px]">Next</span>
          </button>
          <button
            type="button"
            onClick={p.onLog}
            className="press col-start-4 row-span-2 row-start-3 flex flex-col items-center justify-center rounded-[14px] bg-[image:var(--grad-leaf)] px-1 text-center text-ink shadow-[inset_0_1px_0_rgb(255_255_255/.45),inset_0_-1px_0_rgb(0_0_0/.25)]"
          >
            <span className="t-button text-[15px] leading-tight">{p.logLabel}</span>
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
      className="press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-line bg-s3 px-4 text-[14px] font-bold text-fg hover:bg-s4"
    >
      {children}
    </button>
  );
}
