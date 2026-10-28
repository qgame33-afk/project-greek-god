"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Buttons (docs/DESIGN-V3-SIMPLE.md §1.4.10). Pill-shaped, sentence case, `t-button` labels.
 *   primary      gold fill, --gold-ink: the ONE main action of a viewport (data-gold="fill")
 *   inverse      white fill, black text: the main action while a win card shows
 *   secondary    --card-2 (--sheet-control in a sheet)
 *   ghost        text only
 *   destructive  --danger text
 *   link         inline text action
 * Sizes: sm 44 · md 52 · lg 56 · xl 64 (gym, 1.125rem label) · icon 44 (round).
 * Old variants alias: outline and outline-gold → secondary, destructive-solid → destructive.
 */
export const buttonVariants = cva(
  "press relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-pill font-sans transition-[background-color,color,opacity] duration-(--dur-fast) disabled:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-gold text-gold-ink disabled:bg-control disabled:text-fg-2",
        inverse: "bg-fg text-bg disabled:bg-control disabled:text-fg-2",
        secondary: "bg-control text-fg hover:bg-card-3 active:bg-card-3 disabled:opacity-50",
        outline: "bg-control text-fg hover:bg-card-3 active:bg-card-3 disabled:opacity-50",
        "outline-gold": "bg-control text-fg hover:bg-card-3 active:bg-card-3 disabled:opacity-50",
        ghost: "bg-transparent text-fg hover:bg-white/5 active:bg-white/5 disabled:opacity-50",
        destructive: "bg-transparent text-danger hover:bg-danger-soft active:bg-danger-soft disabled:opacity-50",
        "destructive-solid": "bg-transparent text-danger hover:bg-danger-soft active:bg-danger-soft disabled:opacity-50",
        link: "h-auto bg-transparent px-0 text-fg underline-offset-4 hover:underline",
      },
      size: {
        sm: "t-button h-11 px-[18px]",
        md: "t-button h-[52px] px-[22px]",
        lg: "t-button h-14 px-6",
        xl: "t-button-gym h-16 px-6",
        icon: "t-button size-11 p-0",
        "icon-sm": "t-button hit-44 size-9 p-0",
      },
      block: { true: "w-full" },
    },
    compoundVariants: [{ variant: "link", className: "h-auto min-h-11 px-0" }],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild, loading, disabled, children, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  const off = disabled || loading;
  const gold = variant === "primary" && !off;
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, block }), className)}
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
