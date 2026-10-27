"use client";

import { m } from "motion/react";
import { Switch as RSwitch } from "radix-ui";
import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { Minus, Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { SPRING } from "@/lib/motion";

/* ------------------------------------------------------------------ chips */

/**
 * Chip (docs/DESIGN-V3-SIMPLE.md §1.4.11): 30 px (44 px hit), --card-2. Selected = --text fill,
 * black text (never gold). Tones: `win` (--gold-soft, gold text: a real win), `ai` (--ai-soft,
 * --ai), `outline` (1.5 px --ui-line). A button with `onClick`, a plain label without.
 */
export function Chip({
  selected,
  onClick,
  children,
  className,
  disabled,
  ariaLabel,
  tone = "default",
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  tone?: "default" | "win" | "ai" | "outline";
}) {
  const cls = cn(
    "t-label relative inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-3 font-semibold transition-colors [&_svg]:size-4",
    selected ? "bg-fg text-bg" : tone === "win" ? "bg-gold-soft text-gold" : tone === "ai" ? "bg-ai-soft text-ai" : tone === "outline" ? "border-[1.5px] border-ui-line text-fg" : "bg-control text-fg",
    className,
  );
  if (!onClick && selected === undefined)
    return (
      <span className={cls} aria-label={ariaLabel}>
        {children}
      </span>
    );
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={ariaLabel} className={cn("press hit-44 disabled:opacity-40", cls)}>
      {children}
    </button>
  );
}

/**
 * Pill (§1.4.11): the header accessory and small actions. 36 px (44 px with `size="lg"`, and a
 * 44 px hit either way), --card-2, 15/600, an optional leading icon.
 */
export function Pill({
  children,
  icon: Icon,
  href,
  onClick,
  ariaLabel,
  size = "md",
  disabled,
  className,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  href?: string;
  onClick?: () => void;
  ariaLabel?: string;
  size?: "md" | "lg";
  disabled?: boolean;
  className?: string;
}) {
  const cls = cn(
    "press hit-44 t-label inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill bg-control font-semibold text-fg hover:bg-card-3 disabled:opacity-40",
    size === "lg" ? "h-11 px-[18px]" : "h-9 px-3.5",
    className,
  );
  const inner = (
    <>
      {Icon && <Icon className="size-[18px] shrink-0" strokeWidth={1.9} aria-hidden />}
      {children}
    </>
  );
  if (href)
    return (
      <Link href={href} aria-label={ariaLabel} className={cls}>
        {inner}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

/* ------------------------------------------------------ segmented control */

/**
 * Segmented (§1.4.12): 44 px, a --card track, the selected segment --card-3 with --text, the others
 * --text-2. Used only on Progress, Train › Lifts and the scanner. The thumb glides (translate only).
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  /** @deprecated one size */
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex h-11 gap-1 rounded-pill bg-surface p-1", className)}>
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
              "t-label relative flex-1 rounded-pill px-2 font-semibold transition-colors duration-(--dur-fast) before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
              active ? "text-fg" : "text-fg-2 hover:text-fg",
            )}
          >
            {active && <m.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-pill bg-card-3" transition={SPRING.snappy} />}
            <span className="relative z-10">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- switch */

/** Switch (§1.4.13): 51×31; off --card-3 with a white knob, on --text with a black knob. Never gold. */
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
      className="group press-none relative h-[31px] w-[51px] shrink-0 rounded-full bg-card-3 transition-colors duration-(--dur-base) before:absolute before:-inset-x-1 before:-inset-y-[7px] before:content-[''] data-[state=checked]:bg-fg disabled:opacity-40"
    >
      <RSwitch.Thumb className="block size-[27px] translate-x-[2px] rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/.35)] transition-[translate,background-color] duration-(--dur-base) ease-spring data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-black" />
    </RSwitch.Root>
  );
}

/* ---------------------------------------------------------------- stepper */

const STEP_BTN: Record<"sm" | "md" | "lg", string> = {
  sm: "size-11",
  md: "size-14",
  lg: "size-16",
};

/**
 * − value + stepper (docs/DESIGN-V3-SIMPLE.md §1.4.15–16). Round --card-2 buttons. Sizes: sm 44 ·
 * md 56 (default) · lg 64 (the workout).
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
  /** e.g. "bg-card-3" when the stepper sits on a --card-2 surface */
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
    "press grid shrink-0 place-items-center rounded-full bg-control text-fg hover:bg-card-3 active:bg-card-3 disabled:opacity-40",
    STEP_BTN[size],
    buttonClassName,
  );
  const shown = children ?? <span className={size === "sm" ? "t-num-s" : "t-num"}>{format ? format(value) : value}</span>;
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
        <Minus className={size === "sm" ? "size-5" : "size-6"} strokeWidth={1.9} />
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
        <Plus className={size === "sm" ? "size-5" : "size-6"} strokeWidth={1.9} />
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
        <span className="t-label font-semibold">{label}</span>
        <span className="t-cap tabular-nums">{value ?? "—"} of 5</span>
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
                "press t-row h-11 rounded-pill tabular-nums transition-colors",
                on ? "bg-fg text-bg" : "bg-control text-fg hover:bg-card-3",
              )}
              data-invert={invert || undefined}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="t-cap mt-1.5 flex justify-between">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
