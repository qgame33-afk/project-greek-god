"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const fieldCls =
  "h-[52px] w-full rounded-[12px] border border-line-field bg-s3 px-3.5 text-[16px] font-medium text-fg placeholder:text-fg-3 outline-none transition-[border-color,box-shadow] focus:border-gold-400 focus:shadow-[0_0_0_3px_rgb(213_172_103/.18)] disabled:opacity-50 aria-invalid:border-danger";

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-semibold text-fg-2">
      <span>{children}</span>
      {hint && <span className="text-[12px] font-medium text-fg-3">{hint}</span>}
    </label>
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
  return (
    <div className={className}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      {children(id)}
      {error && (
        <p className="mt-1.5 text-[13px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
