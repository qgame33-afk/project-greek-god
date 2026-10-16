"use client";

import { forwardRef, useEffect, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const fieldCls =
  "h-[52px] w-full rounded-[12px] border border-line-field bg-s3 px-3.5 text-[16px] font-medium text-fg placeholder:text-fg-3 outline-none transition-[border-color,box-shadow] focus:border-gold-400 focus:shadow-[0_0_0_3px_rgb(213_172_103/.18)] disabled:opacity-50 aria-invalid:border-danger";

/** Field label. The hint sits outside <label> so it isn't read as part of the field's name. */
export function Label({ htmlFor, children, hint, hintId }: { htmlFor?: string; children: ReactNode; hint?: ReactNode; hintId?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-fg-2">
        {children}
      </label>
      {hint && (
        <span id={hintId} className="text-[12px] font-medium text-fg-3">
          {hint}
        </span>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { suffix?: ReactNode }>(function Input(
  { className, suffix, ...props },
  ref,
) {
  if (!suffix) return <input ref={ref} className={cn(fieldCls, className)} {...props} />;
  return (
    <div className="relative">
      <input ref={ref} className={cn(fieldCls, "pr-14", className)} {...props} />
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[13px] font-semibold text-fg-3">{suffix}</span>
    </div>
  );
});

export const NumberInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { suffix?: ReactNode; decimal?: boolean }>(
  function NumberInput({ className, decimal = true, ...props }, ref) {
    return <Input ref={ref} type="text" inputMode={decimal ? "decimal" : "numeric"} autoComplete="off" className={cn("num text-[18px]", className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(fieldCls, "h-auto min-h-24 resize-none py-3 leading-relaxed", className)} {...props} />;
});

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(fieldCls, "appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
    </div>
  );
}

/** Label + control + optional error text. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  // Tie the hint and error to whatever control the caller rendered with `id`, and mark it invalid
  // while an error shows (children are a render prop, so this is set on the element directly).
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const ids = [hintId, errId].filter(Boolean).join(" ");
    if (ids) el.setAttribute("aria-describedby", ids);
    else el.removeAttribute("aria-describedby");
    if (!errId) return;
    const had = el.getAttribute("aria-invalid");
    el.setAttribute("aria-invalid", "true");
    return () => {
      // If the control's own aria-invalid prop changed in the same commit (React already
      // removed or rewrote it), leave it: restoring `had` would pin a stale "true" — a red
      // border on a field that is now valid.
      if (el.getAttribute("aria-invalid") !== "true") return;
      if (had == null) el.removeAttribute("aria-invalid");
      else el.setAttribute("aria-invalid", had);
    };
  }, [id, hintId, errId]);
  return (
    <div className={className}>
      <Label htmlFor={id} hint={hint} hintId={hintId}>
        {label}
      </Label>
      {children(id)}
      {error && (
        <p id={errId} className="mt-1.5 text-[13px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
