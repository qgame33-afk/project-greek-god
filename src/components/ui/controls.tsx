"use client";

import { m } from "motion/react";
import { Switch as RSwitch } from "radix-ui";
import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { SPRING } from "@/lib/motion";

/* ------------------------------------------------------------------ chips */

/**
 * A toggle chip, 44 px tall (docs/DESIGN-V2.md §1.3). Selection is never gold: the selected chip
 * is m4 with an ivory edge, so the state reads at 3:1 without colour.
 */
export function Chip({
  selected,
  onClick,
  children,
  className,
  disabled,
  ariaLabel,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={cn(
        "press relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[length:max(14px,0.875rem)] font-semibold transition-colors disabled:opacity-40",
        selected
          ? "bg-m4 text-ivory shadow-[inset_0_0_0_1.5px_var(--ivory)]"
          : "bg-m3 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] hover:text-ivory",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------ segmented control */

/** A 44 px segmented control: m3 track, m4 thumb that glides on a spring (translate only). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex rounded-field bg-m3 p-[3px] shadow-[inset_0_0_0_1px_var(--vein)]", size === "md" ? "h-11" : "h-9", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex-1 rounded-[9px] px-2 text-[length:max(13px,0.8125rem)] font-semibold transition-colors duration-(--dur-fast) before:absolute before:inset-x-0 before:content-['']",
              // the hit area covers the track's padding too: 44px (md) and 44px around the 36px sm
              size === "md" ? "before:-inset-y-[3px]" : "before:-inset-y-[7px]",
              active ? "text-ivory" : "text-stone hover:text-ivory",
            )}
          >
            {active && (
              <m.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[9px] bg-m4 shadow-[inset_0_1px_0_rgb(255_244_220/.07),0_1px_2px_rgb(0_0_0/.4)]"
                transition={SPRING.snappy}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- switch */

/** iOS-size switch. On is an ivory track (never a gold fill: a setting is not an achievement). */
export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <RSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className="group press-none relative h-[31px] w-[51px] shrink-0 rounded-full bg-m4 shadow-[inset_0_0_0_1px_var(--ui-line)] transition-colors duration-(--dur-base) before:absolute before:-inset-x-1 before:-inset-y-[7px] before:content-[''] data-[state=checked]:bg-ivory data-[state=checked]:shadow-none disabled:opacity-40"
    >
      <RSwitch.Thumb className="block size-[27px] translate-x-[2px] rounded-full bg-ivory shadow-[0_2px_6px_rgb(0_0_0/.45)] transition-[translate,scale,background-color] duration-(--dur-lift) ease-spring group-active:scale-x-[1.12] data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-night" />
    </RSwitch.Root>
  );
}

/* ---------------------------------------------------------------- stepper */

const STEP_BTN: Record<"sm" | "md" | "lg", string> = {
  sm: "size-11",
  md: "size-14",
  lg: "h-16 w-14",
};

/**
 * − value + stepper (docs/DESIGN-V2.md §5.2). Sizes: sm 44 · md 56 (default) · lg 64 (Gym Mode).
 * The value is a VoiceOver-adjustable spinbutton (arrow keys / swipe up and down); the buttons
 * repeat while held. Tapping the value can open a keypad via `onValueClick`.
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  format,
  label,
  valueText,
  className,
  size = "md",
  children,
  buttonClassName,
  onValueClick,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => ReactNode;
  label: string;
  /** Spoken value ("190 pounds"); defaults to the number. */
  valueText?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  children?: ReactNode;
  /** e.g. "bg-m4" when the stepper sits on an m3 surface */
  buttonClassName?: string;
  onValueClick?: () => void;
}) {
  const timer = useRef<number | null>(null);
  const valueRef = useRef(value);
  useLayoutEffect(() => {
    valueRef.current = value;
  });
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const bump = (dir: 1 | -1) => {
    const next = clamp(Number((valueRef.current + dir * step).toFixed(4)));
    if (next === valueRef.current) return;
    valueRef.current = next;
    onChange(next);
  };
  const start = (dir: 1 | -1) => {
    bump(dir);
    const repeat = () => {
      bump(dir);
      timer.current = window.setTimeout(repeat, 120);
    };
    timer.current = window.setTimeout(repeat, 400);
  };
  const stop = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      bump(1);
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      bump(-1);
    } else if ((e.key === "Enter" || e.key === " ") && onValueClick) {
      e.preventDefault();
      onValueClick();
    }
  };
  const btn = cn(
    "press grid shrink-0 place-items-center rounded-btn bg-m3 text-ivory shadow-[inset_0_0_0_1px_var(--vein-2)] hover:bg-m4 active:bg-m4 disabled:text-disabled",
    STEP_BTN[size],
    buttonClassName,
  );
  const shown = children ?? <span className={size === "lg" ? "t-num-l" : size === "md" ? "t-num-l" : "t-num-m"}>{format ? format(value) : value}</span>;
  return (
    <div className={cn("flex items-center", size === "lg" ? "gap-1" : "gap-3", className)} role="group" aria-label={label}>
      <button
        type="button"
        className={btn}
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onPointerDown={(e) => {
          e.preventDefault();
          start(-1);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && bump(-1)}
      >
        <Minus className={size === "sm" ? "size-5" : "size-6"} strokeWidth={1.8} />
      </button>
      <div
        // the shown value is the adjustable control; custom children (an input) are their own control
        {...(children == null
          ? {
              role: "spinbutton",
              tabIndex: 0,
              "aria-label": label,
              "aria-valuenow": value,
              "aria-valuemin": min,
              "aria-valuemax": max,
              "aria-valuetext": valueText,
              onKeyDown: onKey,
              onClick: onValueClick,
            }
          : {})}
        aria-live="polite"
        className={cn("min-w-0 flex-1 rounded-field text-center outline-offset-4", children == null && onValueClick && "cursor-pointer")}
      >
        {shown}
      </div>
      <button
        type="button"
        className={btn}
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onPointerDown={(e) => {
          e.preventDefault();
          start(1);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && bump(1)}
      >
        <Plus className={size === "sm" ? "size-5" : "size-6"} strokeWidth={1.8} />
      </button>
    </div>
  );
}

/* ----------------------------------------------------- 1–5 scale selector */

export function Scale({
  value,
  onChange,
  low,
  high,
  label,
  invert,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  low: string;
  high: string;
  label: string;
  /** When true, 5 is "bad" (soreness, fatigue, stress) — colours stay neutral either way. */
  invert?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[length:max(13px,0.8125rem)] font-semibold text-stone">{label}</span>
        <span className="t-meta tnum text-ash">{value ?? "—"} / 5</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(on ? null : n)}
              className={cn(
                "press tnum h-11 rounded-field text-[length:max(17px,1.0625rem)] font-semibold transition-colors",
                on ? "bg-m4 text-ivory shadow-[inset_0_0_0_1.5px_var(--ivory)]" : "bg-m3 text-stone shadow-[inset_0_0_0_1px_var(--vein-2)] hover:text-ivory",
              )}
              data-invert={invert || undefined}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="t-meta mt-1.5 flex justify-between text-ash">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
