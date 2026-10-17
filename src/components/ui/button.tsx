"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Buttons (docs/DESIGN-V2.md §1.1.2, §5.2). `primary` is the gold-leaf key: the ONE gold-filled
 * control per viewport. It carries data-gold="fill" so scripts/dev/gold-audit.mjs can count it.
 * Sizes: sm 44 · md 48 · lg 56 · xl 64 (gym and seal keys) · icon 44.
 */
export const buttonVariants = cva(
  "press relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-btn font-sans transition-[background-color,border-color,color,opacity,box-shadow] duration-(--dur-fast) disabled:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "leaf-btn t-key text-ink disabled:bg-none disabled:bg-m3 disabled:text-disabled disabled:shadow-[inset_0_0_0_1px_var(--vein-2)] disabled:after:hidden",
        secondary:
          "bg-m3 text-ivory font-semibold text-[length:max(15px,0.9375rem)] shadow-[inset_0_0_0_1px_var(--vein-2),inset_0_1px_0_rgb(255_244_220/.05)] hover:bg-m4 active:bg-m4 disabled:text-disabled",
        outline:
          "text-ivory font-semibold text-[length:max(15px,0.9375rem)] shadow-[inset_0_0_0_1px_var(--vein-3)] hover:bg-white/[.03] active:bg-m3 disabled:text-disabled",
        "outline-gold":
          "text-leaf-200 font-semibold text-[length:max(15px,0.9375rem)] shadow-[inset_0_0_0_1px_var(--leaf-line)] hover:bg-leaf-tint active:bg-leaf-tint disabled:text-disabled disabled:shadow-[inset_0_0_0_1px_var(--vein-2)]",
        ghost: "text-stone font-semibold text-[length:max(15px,0.9375rem)] hover:text-ivory active:bg-white/5 disabled:text-disabled",
        destructive:
          "bg-cinnabar-tint text-cinnabar font-semibold text-[length:max(15px,0.9375rem)] shadow-[inset_0_0_0_1px_var(--cinnabar-line)] hover:bg-cinnabar/15",
        "destructive-solid": "bg-cinnabar text-ink font-bold text-[length:max(15px,0.9375rem)] disabled:bg-m3 disabled:text-disabled",
        link: "text-leaf-300 font-semibold text-[length:max(13px,0.8125rem)] h-auto px-0 hover:text-leaf-200",
      },
      size: {
        sm: "h-11 px-4 text-[length:max(14px,0.875rem)] rounded-field",
        md: "h-12 px-5",
        lg: "h-14 px-6",
        xl: "h-16 px-6",
        icon: "size-11 rounded-field p-0",
        "icon-sm": "hit-44 size-9 rounded-field p-0",
      },
      block: { true: "w-full" },
    },
    compoundVariants: [
      { variant: "link", className: "h-auto px-0" },
      { variant: "primary", size: "sm", className: "text-[length:max(13px,0.8125rem)]" },
    ],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** One Sheen pass over the gold (key moments only). */
  shine?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild, shine, loading, disabled, children, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  const off = disabled || loading;
  const gold = variant === "primary" && !off;
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, block }), shine && variant === "primary" && "sheen", className)}
      disabled={off}
      aria-busy={loading || undefined}
      data-gold={gold ? "fill" : undefined}
      {...props}
    >
      {loading ? (
        <>
          <Spinner />
          <span className="sr-only">Working</span>
          <span aria-hidden className="opacity-70">
            {children}
          </span>
        </>
      ) : (
        children
      )}
    </Comp>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
