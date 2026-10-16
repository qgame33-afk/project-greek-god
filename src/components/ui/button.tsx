"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "press inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[14px] font-sans transition-[background-color,border-color,color,opacity] duration-150 disabled:pointer-events-none disabled:opacity-100 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "t-button text-ink bg-[image:var(--grad-leaf)] shadow-[inset_0_1px_0_rgb(255_255_255/.45),inset_0_-1px_0_rgb(0_0_0/.25),var(--glow-cta)] disabled:bg-none disabled:bg-s3 disabled:text-fg-dis disabled:shadow-none",
        secondary: "bg-s3 border border-line-strong text-fg font-bold text-[15px] hover:bg-s4 disabled:text-fg-dis",
        "outline-gold": "border border-line-gold text-gold-300 font-bold text-[15px] hover:bg-gold-tint disabled:text-fg-dis disabled:border-line",
        ghost: "text-fg-2 font-bold text-[15px] hover:text-fg active:bg-white/5 disabled:text-fg-dis",
        destructive: "bg-danger-tint border border-danger/35 text-danger font-bold text-[15px] hover:bg-danger/15",
        "destructive-solid": "bg-danger text-ink font-extrabold text-[15px] disabled:bg-s3 disabled:text-fg-dis",
        link: "text-gold-300 font-bold text-[13px] h-auto px-0 hover:text-gold-200",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px] rounded-[10px]",
        md: "h-12 px-5",
        lg: "h-14 px-6",
        icon: "size-11 rounded-[12px] p-0",
        "icon-sm": "size-9 rounded-[10px] p-0",
      },
      block: { true: "w-full" },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** One-shot gold sheen (key CTAs only). */
  shine?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild, shine, loading, disabled, children, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, block }), shine && variant === "primary" && "sheen", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
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
