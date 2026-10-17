"use client";

import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronRight, Minus, Plus } from "lucide-react";
import { SealKey } from "@/components/ui/seal-key";
import { cn } from "@/lib/cn";
import { EASE_CSS, prefersReducedMotion } from "@/lib/motion";

export interface DeckField {
  /** Display text ("190", "1,000", "5", "—"). */
  text: string;
  /** Raw value in display units for the spinbutton (null when empty). */
  value: number | null;
  /** True when the value is a suggestion (ghost), not a typed or logged number. */
  ghost: boolean;
  /** "lb", "reps", "sec", "+lb", "lb / hand". */
  unitLabel: string;
  /** Spoken unit ("pounds", "reps"). */
  unitWord: string;
  /** Spoken name ("load", "reps"). */
  name: string;
  step: number;
  min: number;
  max: number;
  onStep: (dir: 1 | -1) => void;
  /** Opens the NumberPad on this field (tap or long-press on the value). */
  onOpen: () => void;
  /** Inline input mode (system keyboard pref, desktop): commit typed text. */
  onCommit?: (raw: string) => boolean;
  /** The stored text for inline editing. */
  editText?: string;
  invalid?: boolean;
}

export type DeckKey =
  | { kind: "seal"; label: string; detail: string | null; onPress: () => void; pulse: number; disabled?: boolean }
  | { kind: "hold"; label: string; onHold: () => void; onTap: () => void; pulse: number }
  | { kind: "nav"; label: string; detail?: string | null; onPress: () => void };

/**
 * The thumb deck (§3.2.1, §3.2.2): the bottom third, opaque m1, e3. Two steppers — load (±5 lb
 * or the lift's increment, ±2.5 kg) and reps (±1; seconds ±5 for timed sets) — then the seal
 * key, the viewport's one gold control. The load stepper is the wider of the two so "190" and
 * "1,000" sit comfortably at 375–390 px; at AX sizes they stack. Every control is ≥ 56 px tall.
 */
export const ThumbDeck = forwardRef<
  HTMLDivElement,
  { load: DeckField | null; work: DeckField; stacked: boolean; error: string | null; deckKey: DeckKey; hint?: ReactNode; hidden?: boolean; inputId: string }
>(function ThumbDeck({ load, work, stacked, error, deckKey, hint, hidden, inputId }, ref) {
  return (
    <div
      ref={ref}
      role="region"
      aria-label="Log the set"
      aria-hidden={hidden || undefined}
      inert={hidden}
      className={cn("fixed inset-x-0 bottom-0 z-(--z-deck) rounded-t-sheet bg-m1 shadow-(--e3) md:left-1/2 md:w-full md:max-w-col md:-translate-x-1/2", hidden && "invisible")}
      style={{ paddingBottom: "calc(var(--safe-bottom) + 12px)" }}
    >
      <div className="mx-auto max-w-col px-3 pt-3">
        {error && (
          <p className="t-meta mb-2 px-1 font-semibold text-cinnabar" role="alert">
            {error}
          </p>
        )}
        {!error && hint}
        <div className={cn("grid gap-2", stacked ? "grid-cols-1" : load ? "grid-cols-[minmax(0,1.42fr)_minmax(0,1fr)]" : "grid-cols-1")}>
          {load && <DeckStepper field={load} wide cell={`${inputId}:weight`} />}
          <DeckStepper field={work} wide={!load || stacked} cell={`${inputId}:work`} />
        </div>
        <div className="mt-2">
          {deckKey.kind === "seal" ? (
            <SealKey label={deckKey.label} detail={deckKey.detail} pulse={deckKey.pulse} onClick={deckKey.onPress} disabled={deckKey.disabled} />
          ) : deckKey.kind === "hold" ? (
            <HoldKey label={deckKey.label} pulse={deckKey.pulse} onHold={deckKey.onHold} onTap={deckKey.onTap} />
          ) : (
            <button
              type="button"
              onClick={deckKey.onPress}
              className="press t-key flex h-16 w-full items-center justify-center gap-2 rounded-btn bg-m3 px-5 text-ivory shadow-[inset_0_0_0_1px_var(--vein-3)] hover:bg-m4"
            >
              <span className="truncate">{deckKey.label}</span>
              {deckKey.detail && <span className="tnum truncate text-stone">· {deckKey.detail}</span>}
              <ChevronRight className="size-5 shrink-0" strokeWidth={1.8} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

function DeckStepper({ field: f, wide, cell }: { field: DeckField; wide: boolean; cell: string }) {
  const timer = useRef<number | null>(null);
  const longPress = useRef<number | null>(null);
  const longFired = useRef(false);
  const pressed = useRef(false);
  const stop = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const start = (dir: 1 | -1) => {
    pressed.current = true;
    f.onStep(dir);
    const repeat = () => {
      f.onStep(dir);
      timer.current = window.setTimeout(repeat, 140);
    };
    timer.current = window.setTimeout(repeat, 450);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      f.onStep(1);
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      f.onStep(-1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      f.onOpen();
    }
  };
  const stepWord = Number.isInteger(f.step) ? String(f.step) : f.step.toFixed(1);
  const btn = "press grid h-16 w-[52px] shrink-0 place-items-center rounded-btn text-ivory active:bg-m3 hover:bg-m3/60 disabled:text-disabled";
  const long = f.text.replace(/[^0-9]/g, "").length >= 4;
  return (
    <div
      role="group"
      aria-label={f.name}
      className={cn("flex h-16 items-stretch rounded-btn bg-m2 shadow-[inset_0_0_0_1px_var(--vein-2)]", f.invalid && "shadow-[inset_0_0_0_1.5px_var(--cinnabar)]")}
    >
      <button
        type="button"
        className={btn}
        aria-label={`${f.name} minus ${stepWord}`}
        disabled={f.value != null && f.value <= f.min}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          start(-1);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onClick={() => {
          // a click with no pointer press first (VoiceOver, Switch Control) still steps
          if (!pressed.current) f.onStep(-1);
          pressed.current = false;
        }}
      >
        <Minus className="size-6" strokeWidth={1.8} />
      </button>
      {f.onCommit ? (
        <InlineValue field={f} long={long} cell={cell} />
      ) : (
        <div
          role="spinbutton"
          tabIndex={0}
          aria-label={f.name}
          aria-valuenow={f.value ?? undefined}
          aria-valuemin={f.min}
          aria-valuemax={f.max}
          aria-valuetext={f.value == null ? "empty" : `${f.text} ${f.unitWord}${f.ghost ? ", suggested" : ""}`}
          onKeyDown={onKey}
          onClick={() => {
            if (longFired.current) {
              longFired.current = false;
              return;
            }
            f.onOpen();
          }}
          onPointerDown={() => {
            longFired.current = false;
            longPress.current = window.setTimeout(() => {
              longFired.current = true;
              f.onOpen();
            }, 500);
          }}
          onPointerUp={() => longPress.current && window.clearTimeout(longPress.current)}
          onPointerLeave={() => longPress.current && window.clearTimeout(longPress.current)}
          onContextMenu={(e) => e.preventDefault()}
          className="press-soft flex min-w-0 flex-1 cursor-pointer select-none flex-col items-center justify-center rounded-field outline-offset-2"
        >
          <Value field={f} long={long} wide={wide} />
        </div>
      )}
      <button
        type="button"
        className={btn}
        aria-label={`${f.name} plus ${stepWord}`}
        disabled={f.value != null && f.value >= f.max}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          start(1);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onClick={() => {
          // a click with no pointer press first (VoiceOver, Switch Control) still steps
          if (!pressed.current) f.onStep(1);
          pressed.current = false;
        }}
      >
        <Plus className="size-6" strokeWidth={1.8} />
      </button>
    </div>
  );
}

function Value({ field: f, long, wide }: { field: DeckField; long: boolean; wide: boolean }) {
  return (
    <>
      <span aria-hidden className={cn("t-num-l whitespace-nowrap leading-none", f.value == null ? "text-ash" : f.ghost ? "text-stone" : "text-ivory", long && !wide && "!text-[length:1.625rem]")}>
        {f.text}
      </span>
      <span aria-hidden className="t-tag mt-1 text-stone">
        {f.unitLabel}
      </span>
    </>
  );
}

/** System keyboard / desktop: the value is a real input; Enter or blur commits it. */
function InlineValue({ field: f, long, cell }: { field: DeckField; long: boolean; cell: string }) {
  const stored = f.editText ?? "";
  const [text, setText] = useState(stored);
  const [focused, setFocused] = useState(false);
  const [prev, setPrev] = useState(stored);
  if (stored !== prev && !focused) {
    setPrev(stored);
    setText(stored);
  }
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (!focused) return;
    input.current?.select();
  }, [focused]);
  return (
    <label className="relative flex min-w-0 flex-1 flex-col items-center justify-center">
      <span className="sr-only">{f.name}</span>
      <input
        ref={input}
        data-cell={cell}
        value={text}
        placeholder={f.ghost ? f.text : "—"}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (text !== stored && f.onCommit) f.onCommit(text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (f.onCommit?.(text)) input.current?.blur();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            f.onStep(1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            f.onStep(-1);
          }
        }}
        inputMode={f.unitWord === "pounds" || f.unitWord === "kilograms" ? "decimal" : "numeric"}
        enterKeyHint="done"
        autoComplete="off"
        aria-invalid={f.invalid || undefined}
        className={cn("t-num-l w-full min-w-0 bg-transparent text-center text-ivory outline-none placeholder:text-stone", long && "!text-[length:1.625rem]")}
      />
      <span aria-hidden className="t-tag text-stone">
        {f.unitLabel}
      </span>
    </label>
  );
}

/**
 * Once every set is logged the key seals the session itself: hold 600 ms (a fill grows; releasing
 * early cancels). A tap — or VoiceOver, Switch Control, Enter — opens the Seal panel instead,
 * which shows the count and carries the same hold bar and its two-button confirm.
 */
function HoldKey({ label, pulse, onHold, onTap }: { label: string; pulse: number; onHold: () => void; onTap: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const ref = useRef<HTMLButtonElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof el.animate !== "function") return;
    el.animate([{ transform: "scale(1)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }], { duration: 300, easing: EASE_CSS.out });
  }, [pulse]);
  const clear = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  return (
    <button
      ref={ref}
      type="button"
      data-gold="fill"
      aria-describedby="wk-hold-help"
      className="leaf-btn press t-key relative flex h-16 w-full touch-none select-none items-center justify-center gap-2.5 overflow-hidden rounded-btn px-5 text-ink"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        fired.current = false;
        setHolding(true);
        timer.current = window.setTimeout(() => {
          timer.current = null;
          fired.current = true;
          setHolding(false);
          onHold();
        }, 600);
      }}
      onPointerUp={() => timer.current != null && clear()}
      onPointerLeave={() => timer.current != null && clear()}
      onPointerCancel={() => timer.current != null && clear()}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        onTap();
      }}
    >
      <span
        aria-hidden
        className="motion-keep pointer-events-none absolute inset-0 origin-left bg-[rgb(255_250_230/.42)]"
        style={{ transform: `scaleX(${holding ? 1 : 0})`, transition: holding ? "transform 600ms linear" : "transform 160ms var(--ease-out)" }}
      />
      <span className="relative truncate">{label}</span>
      <span id="wk-hold-help" className="sr-only">
        Press and hold to seal the session, or tap to review it first.
      </span>
    </button>
  );
}
