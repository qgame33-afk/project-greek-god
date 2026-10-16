"use client";

import { m } from "motion/react";
import { Switch as RSwitch } from "radix-ui";
import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { SPRING } from "@/lib/motion";

/* ------------------------------------------------------------------ chips */

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
        // 36px visible, 44px to the touch (DESIGN §5.5)
        "press relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] disabled:opacity-40",
        selected ? "border-line-gold bg-gold-tint text-gold-300" : "border-line bg-s3 text-fg-2 hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------ segmented control */

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
      className={cn("flex rounded-[12px] bg-s3 p-[3px]", size === "md" ? "h-11" : "h-9", className)}
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
              "relative flex-1 rounded-[9px] px-2 text-[13px] font-semibold transition-colors duration-(--dur-fast) before:absolute before:inset-x-0 before:content-['']",
              // the hit area covers the track's padding too: 44px (md) and 44px around the 36px sm
              size === "md" ? "before:-inset-y-[3px]" : "before:-inset-y-[7px]",
              active ? "text-fg" : "text-fg-2 hover:text-fg",
            )}
          >
            {active && (
              <m.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[9px] bg-[#2A2F37] shadow-[inset_0_1px_0_rgb(255_255_255/.06)]"
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
      className="group press-none relative h-[31px] w-[51px] shrink-0 rounded-full bg-s4 transition-colors duration-(--dur-base) before:absolute before:-inset-x-1 before:-inset-y-[7px] before:content-[''] data-[state=checked]:bg-gold-500 disabled:opacity-40"
    >
      <RSwitch.Thumb className="block size-[27px] translate-x-[2px] rounded-full bg-fg shadow-[0_2px_6px_rgb(0_0_0/.4)] transition-[translate,scale] duration-(--dur-slow) ease-spring group-active:scale-x-[1.12] data-[state=checked]:translate-x-[22px]" />
    </RSwitch.Root>
  );
}

/* ---------------------------------------------------------------- stepper */

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  format,
  label,
  className,
  size = "md",
  children,
  buttonClassName,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => ReactNode;
  label: string;
  className?: string;
  size?: "md" | "lg";
  children?: ReactNode;
  /** e.g. "bg-s4" when the stepper sits on a surface-3 card */
  buttonClassName?: string;
}) {
  const timer = useRef<number | null>(null);
  const valueRef = useRef(value);
  useLayoutEffect(() => {
    valueRef.current = value;
  });
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const bump = (dir: 1 | -1) => {
    const next = clamp(Number((valueRef.current + dir * step).toFixed(4)));
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
  const btn = cn(
    "press grid shrink-0 place-items-center rounded-[12px] bg-s3 text-fg-2 hover:text-fg active:bg-s4 disabled:opacity-30",
    size === "lg" ? "size-14" : "size-[52px]",
    buttonClassName,
  );
  return (
    <div className={cn("flex items-center gap-3", className)} role="group" aria-label={label}>
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
        <Minus className="size-5" />
      </button>
      <div className="min-w-0 flex-1 text-center" aria-live="polite">
        {children ?? <span className={size === "lg" ? "num-xl" : "num-md"}>{format ? format(value) : value}</span>}
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
        <Plus className="size-5" />
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
        <span className="text-[13px] font-semibold text-fg-2">{label}</span>
        <span className="num-xs text-fg-3">{value ?? "—"} / 5</span>
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
                "press num h-11 rounded-[10px] border text-[17px] font-semibold transition-colors",
                on ? "border-line-gold bg-gold-tint text-gold-300" : "border-line bg-s3 text-fg-2 hover:text-fg",
              )}
              data-invert={invert || undefined}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] font-medium text-fg-3">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
