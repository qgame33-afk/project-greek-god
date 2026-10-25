"use client";

import { forwardRef, useEffect, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

// Fields (docs/DESIGN-V3-SIMPLE.md §1.4.14): 56 px, radius 18, --card (--sheet-card in a sheet),
// 17 px text (never under 16 px, so iOS never zooms), placeholder --text-2, a 2 px --text focus
// ring, --danger only when invalid.
const fieldCls =
  "t-body h-14 w-full rounded-field border-0 bg-surface px-4 text-fg placeholder:text-fg-2 outline-none transition-shadow focus:shadow-[inset_0_0_0_2px_var(--text)] disabled:opacity-50 aria-invalid:shadow-[inset_0_0_0_2px_var(--danger)]";

/** Field label. The hint sits outside <label> so it isn't read as part of the field's name. */
export function Label({ htmlFor, children, hint, hintId }: { htmlFor?: string; children: ReactNode; hint?: ReactNode; hintId?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="t-label font-semibold">
        {children}
      </label>
      {hint && (
        <span id={hintId} className="t-cap">
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
      <span className="t-label pointer-events-none absolute inset-y-0 right-4 flex items-center font-semibold">{suffix}</span>
    </div>
  );
});

export const NumberInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { suffix?: ReactNode; decimal?: boolean }>(
  function NumberInput({ className, decimal = true, ...props }, ref) {
    return <Input ref={ref} type="text" inputMode={decimal ? "decimal" : "numeric"} autoComplete="off" className={cn("tabular-nums font-semibold", className)} {...props} />;
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
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-fg-3" strokeWidth={1.9} />
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
        <p id={errId} className="t-label mt-1.5 text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
