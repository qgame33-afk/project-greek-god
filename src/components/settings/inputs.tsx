"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { Segmented, Stepper } from "@/components/ui/controls";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { CM_PER_IN, parseNumber, round } from "@/lib/units";
import { SCHEDULE_OPTIONS, WEEK_ORDER, WEEKDAY_LABEL, type PlanKey, type Schedule } from "@/lib/onboarding/plan";

/* ------------------------------------------------------------ stepper input */

/**
 * A 52px stepper whose value can also be typed. Shows exactly what will be saved; never
 * clamps silently — out-of-range input is left for the caller's validation to explain.
 */
export function StepperInput({
  label,
  value,
  onChange,
  step,
  min,
  max,
  decimals = 0,
  unit,
  size = "md",
  invalid,
  describedBy,
  thousands,
  onEdit,
  layout = "row",
  minDecimals,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  decimals?: number;
  unit?: string;
  size?: "md" | "lg";
  invalid?: boolean;
  describedBy?: string;
  /** Show 3,300 instead of 3300 when not focused. */
  thousands?: boolean;
  /** Called on any user edit (used to drop a SUGGESTED badge). */
  onEdit?: () => void;
  /** "stacked": value on top, − + underneath — for narrow two-column cards. */
  layout?: "row" | "stacked";
  /** Show at least this many decimals, trimming trailing zeros beyond it (3.0 L, 3.25 L). */
  minDecimals?: number;
}) {
  const fmt = (v: number) => {
    if (thousands) return v.toLocaleString("en-US", { maximumFractionDigits: decimals });
    if (minDecimals == null) return v.toFixed(decimals);
    let t = v.toFixed(decimals);
    while (t.includes(".") && t.split(".")[1].length > minDecimals && t.endsWith("0")) t = t.slice(0, -1);
    return t.endsWith(".") ? t.slice(0, -1) : t;
  };
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals]);
  const input = (
    <label className="block cursor-text text-center">
      <span className="sr-only">
        {label}
        {unit ? ` in ${unit}` : ""}
      </span>
      <input
        value={text}
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        enterKeyHint="done"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onFocus={(e) => {
          focused.current = true;
          // Swap "3,300" for "3300" on the element itself before selecting, so the re-render
          // that follows finds the same text and leaves the selection alone (otherwise typing
          // can land after the old digits: "8,000" + "15000" → "800015000").
          const el = e.currentTarget;
          const plain = value.toFixed(decimals);
          if (el.value !== plain) el.value = plain;
          setText(plain);
          el.select();
          requestAnimationFrame(() => {
            if (document.activeElement === el) el.select();
          });
        }}
        onBlur={() => {
          focused.current = false;
          setText(fmt(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseNumber(e.target.value.replace(/,(?=\d{3}\b)/g, ""));
          if (n != null) {
            onEdit?.();
            onChange(n);
          }
        }}
        className={cn(
          "w-full min-w-0 bg-transparent text-center text-fg outline-none",
          size === "lg" ? "num-xl" : "num-md",
          invalid && "text-danger",
        )}
      />
      {unit && <span className={cn("block font-semibold uppercase tracking-[0.16em] text-fg-3", size === "lg" ? "mt-1.5 text-[12px]" : "mt-1 text-[11px]")}>{unit}</span>}
    </label>
  );
  const bump = (v: number) => {
    onEdit?.();
    onChange(round(v, Math.max(decimals, 2)));
  };
  if (layout === "stacked") {
    return (
      <div role="group" aria-label={label}>
        {input}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <HoldButton label={`Decrease ${label}`} disabled={value <= min} onStep={() => bump(clampStep(value - step, step, min, max))}>
            <Minus className="size-[18px]" />
          </HoldButton>
          <HoldButton label={`Increase ${label}`} disabled={value >= max} onStep={() => bump(clampStep(value + step, step, min, max))}>
            <Plus className="size-[18px]" />
          </HoldButton>
        </div>
      </div>
    );
  }
  return (
    <div className="[&_button]:bg-s4 [&_button:active]:bg-s5">
      <Stepper label={label} value={value} step={step} min={min} max={max} size={size} onChange={bump}>
        {input}
      </Stepper>
    </div>
  );
}

function clampStep(v: number, step: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(v / step) * step));
}

/** 44px − / + that repeats while held (400ms, then every 120ms). Reads the latest step fn. */
function HoldButton({ label, disabled, onStep, children }: { label: string; disabled?: boolean; onStep: () => void; children: ReactNode }) {
  const fn = useRef(onStep);
  useEffect(() => {
    fn.current = onStep;
  });
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className="press grid h-11 place-items-center rounded-[12px] bg-s4 text-fg-2 hover:text-fg active:bg-s5 disabled:opacity-30"
      onPointerDown={(e) => {
        e.preventDefault();
        fn.current();
        const repeat = () => {
          fn.current();
          timer.current = window.setTimeout(repeat, 120);
        };
        timer.current = window.setTimeout(repeat, 400);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), fn.current())}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------- compact stepper */

/** 44px inline − value + for list rows (volleyball sessions, etc). */
export function MiniStepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  const btn = "press grid size-11 place-items-center rounded-[12px] bg-s3 text-fg-2 hover:text-fg active:bg-s4 disabled:opacity-30";
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        <Minus className="size-[18px]" />
      </button>
      <span className="num-sm w-9 text-center" aria-live="polite">
        {format ? format(value) : value}
      </span>
      <button type="button" className={btn} aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        <Plus className="size-[18px]" />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- height */

/** ft + in fields, or a cm stepper. Value is always centimetres. */
export function HeightInput({ cm, onChange, unit, invalid }: { cm: number; onChange: (cm: number) => void; unit: "in" | "cm"; invalid?: boolean }) {
  const id = useId();
  const totalIn = cm / CM_PER_IN;
  const ft0 = Math.floor(totalIn / 12);
  const in0 = round(totalIn - ft0 * 12, 1);
  const [ft, setFt] = useState(String(in0 >= 12 ? ft0 + 1 : ft0));
  const [inch, setInch] = useState(String(in0 >= 12 ? 0 : in0));
  const last = useRef(cm);
  useEffect(() => {
    if (Math.abs(last.current - cm) > 0.05) {
      const t = cm / CM_PER_IN;
      const f = Math.floor(t / 12);
      const i = round(t - f * 12, 1);
      setFt(String(i >= 12 ? f + 1 : f));
      setInch(String(i >= 12 ? 0 : i));
      last.current = cm;
    }
  }, [cm]);
  if (unit === "cm") {
    return <StepperInput label="Height" value={round(cm, 1)} onChange={(v) => ((last.current = v), onChange(v))} step={0.5} min={100} max={250} decimals={1} unit="cm" invalid={invalid} />;
  }
  const push = (fs: string, is: string) => {
    const f = parseNumber(fs);
    const i = parseNumber(is);
    if (f == null || i == null) return;
    const v = round((f * 12 + i) * CM_PER_IN, 1);
    last.current = v;
    onChange(v);
  };
  const field =
    "num h-[52px] w-full rounded-[12px] border border-line-field bg-s3 pl-3.5 pr-11 text-[22px] font-semibold text-fg outline-none transition-[border-color,box-shadow] focus:border-gold-400 focus:shadow-[0_0_0_3px_rgb(213_172_103/.18)] aria-invalid:border-danger";
  return (
    <div className="grid grid-cols-2 gap-3" role="group" aria-label="Height in feet and inches">
      <div className="relative">
        <label htmlFor={`${id}-ft`} className="sr-only">
          Feet
        </label>
        <input
          id={`${id}-ft`}
          className={field}
          value={ft}
          inputMode="numeric"
          enterKeyHint="next"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setFt(e.target.value);
            push(e.target.value, inch);
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[13px] font-semibold text-fg-3">ft</span>
      </div>
      <div className="relative">
        <label htmlFor={`${id}-in`} className="sr-only">
          Inches
        </label>
        <input
          id={`${id}-in`}
          className={field}
          value={inch}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setInch(e.target.value);
            push(ft, e.target.value);
          }}
          onBlur={() => {
            // 6 ft 14 in reads back as 7 ft 2 in
            const i = parseNumber(inch);
            if (i == null || i < 12) return;
            const t = last.current / CM_PER_IN;
            const f = Math.floor(t / 12);
            const r = round(t - f * 12, 1);
            setFt(String(r >= 12 ? f + 1 : f));
            setInch(String(r >= 12 ? 0 : r));
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[13px] font-semibold text-fg-3">in</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ unit toggles */

export function WeightUnitToggle({ value, onChange, className }: { value: "lb" | "kg"; onChange: (v: "lb" | "kg") => void; className?: string }) {
  return (
    <Segmented
      ariaLabel="Weight unit"
      size="sm"
      className={cn("w-[112px]", className)}
      value={value}
      onChange={onChange}
      options={[
        { value: "lb", label: "lb" },
        { value: "kg", label: "kg" },
      ]}
    />
  );
}

export function LengthUnitToggle({ value, onChange, className }: { value: "in" | "cm"; onChange: (v: "in" | "cm") => void; className?: string }) {
  return (
    <Segmented
      ariaLabel="Length unit"
      size="sm"
      className={cn("w-[128px]", className)}
      value={value}
      onChange={onChange}
      options={[
        { value: "in", label: "ft · in" },
        { value: "cm", label: "cm" },
      ]}
    />
  );
}

/* --------------------------------------------------------- weekly schedule */

const SHORT: Record<string, string> = { "0": "Sun", "1": "Mon", "2": "Tue", "3": "Wed", "4": "Thu", "5": "Fri", "6": "Sat" };

/** Seven rows, Monday first. Each day picks a template or Rest with the native picker. */
export function ScheduleEditor({ value, onChange }: { value: Schedule; onChange: (s: Schedule) => void }) {
  const id = useId();
  return (
    <ul className="overflow-hidden rounded-[16px] border border-line bg-s1">
      {WEEK_ORDER.map((d, i) => {
        const v = value[d] ?? "rest";
        const rest = v === "rest";
        return (
          <li key={d} className={cn("flex min-h-[56px] items-center gap-3 pl-4 pr-2", i > 0 && "border-t border-line-hair")}>
            <label htmlFor={`${id}-${d}`} className="flex w-[92px] shrink-0 items-center gap-2.5">
              <span className={cn("size-1.5 rounded-full", rest ? "bg-line-strong" : "bg-gold-400")} aria-hidden />
              <span className="text-[15px] font-semibold text-fg">
                <span className="sm:hidden">{SHORT[d]}</span>
                <span className="hidden sm:inline">{WEEKDAY_LABEL[d]}</span>
              </span>
            </label>
            <div className="min-w-0 flex-1">
              <Select
                id={`${id}-${d}`}
                value={v}
                onChange={(e) => onChange({ ...value, [d]: e.target.value as PlanKey })}
                className={cn("h-11 border-transparent bg-s3 text-[16px] font-semibold", rest ? "text-fg-2" : "text-fg")}
                aria-label={`${WEEKDAY_LABEL[d]} session`}
              >
                {SCHEDULE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
