"use client";

import { forwardRef, useEffect, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

// Fields: m1 wells with a 3:1 edge (--ui-line), 16 px+ text (iOS never zooms), a leaf focus ring,
// cinnabar only when invalid.
const fieldCls =
  "h-[52px] w-full rounded-field border border-ui-line bg-m1 px-3.5 text-[length:max(16px,1rem)] font-medium text-ivory placeholder:text-ash outline-none transition-[border-color,box-shadow] focus:border-leaf-300 focus:shadow-[0_0_0_3px_var(--leaf-tint)] disabled:opacity-50 aria-invalid:border-cinnabar";

/** Field label. The hint sits outside <label> so it isn't read as part of the field's name. */
export function Label({ htmlFor, children, hint, hintId }: { htmlFor?: string; children: ReactNode; hint?: ReactNode; hintId?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-[length:max(13px,0.8125rem)] font-semibold text-stone">
        {children}
      </label>
      {hint && (
        <span id={hintId} className="t-meta text-ash">
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
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[length:max(13px,0.8125rem)] font-semibold text-ash">{suffix}</span>
    </div>
  );
});

export const NumberInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { suffix?: ReactNode; decimal?: boolean }>(
  function NumberInput({ className, decimal = true, ...props }, ref) {
    return <Input ref={ref} type="text" inputMode={decimal ? "decimal" : "numeric"} autoComplete="off" className={cn("tnum text-[length:max(18px,1.125rem)] font-semibold", className)} {...props} />;
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
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ash" strokeWidth={1.6} />
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
        <p id={errId} className="mt-1.5 text-[length:max(13px,0.8125rem)] font-medium text-cinnabar" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
