"use client";

import { useEffect, useRef } from "react";
import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import type { PadKey } from "@/lib/workout/numpad";
import type { CellField } from "@/lib/workout/types";

const KEYS: PadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

export interface PlatesInfo {
  bar: number;
  perSide: number[];
  /** Index of the plate that changed since last time (outlined). */
  changed: number | null;
}

/**
 * The keypad (docs/DESIGN-V3-SIMPLE.md §4.2.7): a sheet "Barbell Back Squat · weight", the value
 * in `t-big` with its unit, a "Last 220" pill that fills it, and for barbell, Smith and
 * plate-loaded lifts "Plates on each side · 45 lb bar" with plate chips (the plate that changed
 * since last time has a white outline). A 3×4 keypad of 52 px keys and a gold "Done". The draft,
 * validation and 0 lb rules are the existing NumberPad logic, run by the controller. With
 * Settings › Workout › "Use the phone keyboard" on, a plain input replaces the keys.
 */
export function KeypadSheet({
  open,
  title,
  text,
  ghost,
  unitLabel,
  field,
  error,
  lastText,
  plates,
  unit,
  systemKeyboard,
  onKey,
  onText,
  onLast,
  onDone,
}: {
  open: boolean;
  title: string;
  text: string;
  ghost: string | null;
  unitLabel: string;
  field: CellField;
  error: string | null;
  lastText: string | null;
  plates: PlatesInfo | null;
  unit: "lb" | "kg";
  systemKeyboard: boolean;
  onKey: (k: PadKey) => void;
  onText: (t: string) => void;
  onLast: () => void;
  onDone: () => void;
}) {
  const handlers = useRef({ onKey, onDone });
  useEffect(() => {
    handlers.current = { onKey, onDone };
  });
  // Hardware keyboards (iPad, desktop) type into the keypad too.
  useEffect(() => {
    if (!open || systemKeyboard) return;
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const h = handlers.current;
      if (/^[0-9]$/.test(e.key)) h.onKey(e.key as PadKey);
      else if (e.key === "." || e.key === ",") h.onKey(".");
      else if (e.key === "Backspace") h.onKey("back");
      else if (e.key === "Enter") h.onDone();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, systemKeyboard]);

  const showGhost = text === "" && ghost != null;
  const sum = plates ? plates.perSide.reduce((a, b) => a + b, 0) : 0;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onDone()} title={<span className="t-label">{title}</span>}>
      <div className="pb-1">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1" aria-live="polite">
            <span className={cn("t-big tabular-nums", showGhost ? "text-fg-2" : "text-fg", error && "text-danger")}>{showGhost ? ghost : text || "—"}</span>
            <span className="unit">{unitLabel}</span>
          </p>
          {lastText != null && (
            <button type="button" onClick={onLast} className="press t-button h-11 shrink-0 rounded-pill bg-control px-[18px] text-fg">
              Last {lastText}
            </button>
          )}
        </div>
        {error && (
          <p className="t-label mt-1 text-danger" role="alert">
            {error}
          </p>
        )}
        {plates && (
          <div className="mt-3 rounded-tile-lg bg-surface px-4 py-3.5">
            <p className="t-label">
              Plates on each side · {plates.bar} {unit} bar
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {plates.perSide.length ? (
                plates.perSide.map((p, i) => (
                  <span key={i} className={cn("t-row grid h-10 min-w-12 place-items-center rounded-pill bg-control px-3 tabular-nums", plates.changed === i && "outline outline-[1.5px] outline-fg")}>
                    {p}
                  </span>
                ))
              ) : (
                <span className="t-row">Empty bar</span>
              )}
              {plates.perSide.length > 0 && (
                <span className="t-body text-fg-2">
                  = {Number(sum.toFixed(2))} {unit} a side
                </span>
              )}
            </div>
          </div>
        )}
        {systemKeyboard ? (
          <input
            autoFocus
            value={text}
            placeholder={ghost ?? "—"}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onDone();
              }
            }}
            inputMode={field === "weight" ? "decimal" : "numeric"}
            enterKeyHint="done"
            aria-label={title}
            className="t-num mt-4 h-14 w-full rounded-field bg-surface px-4 text-fg outline-none placeholder:text-fg-2 focus:ring-2 focus:ring-fg"
          />
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {KEYS.map((k) => {
              const disabled = k === "." && field !== "weight";
              return (
                <button
                  key={k}
                  type="button"
                  disabled={disabled}
                  onClick={() => onKey(k)}
                  aria-label={k === "back" ? "Delete" : k === "." ? "Decimal point" : k}
                  className="press t-num grid h-[52px] place-items-center rounded-field bg-control text-fg disabled:opacity-30"
                >
                  {k === "back" ? <Delete className="size-6" strokeWidth={1.9} aria-hidden /> : k}
                </button>
              );
            })}
          </div>
        )}
        <Button variant="primary" size="lg" block className="mt-4" onClick={onDone}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}
