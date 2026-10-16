"use client";

import { animate, useInView } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Animated number for Monument surfaces. Writes textContent directly — no per-frame renders. */
export function CountUp({
  value,
  decimals = 0,
  duration = 0.7,
  className,
  format,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const inView = useInView(ref, { once: true });
  const fmt = format ?? ((n: number) => n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.textContent = fmt(value);
      from.current = value;
      return;
    }
    const ctl = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = fmt(v);
      },
    });
    from.current = value;
    return () => ctl.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, inView, duration, decimals]);
  return (
    <span ref={ref} className={className}>
      {fmt(0)}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  action,
  className,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <header className={cn("mb-6 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="t-title">{title}</h1>
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function Stat({
  label,
  value,
  unit,
  delta,
  deltaTone = "neutral",
  caption,
  className,
  size = "lg",
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  delta?: ReactNode;
  deltaTone?: "good" | "neutral";
  caption?: ReactNode;
  className?: string;
  size?: "lg" | "md" | "sm";
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="eyebrow truncate">{label}</p>
      <p className={cn("mt-1.5 truncate", size === "lg" ? "num-lg" : size === "md" ? "num-md" : "num-sm")}>
        {value}
        {unit && <span className="unit">{unit}</span>}
      </p>
      {delta != null && (
        <p className={cn("mt-1 truncate text-[12px] font-semibold", deltaTone === "good" ? "text-success" : "text-fg-2")}>{delta}</p>
      )}
      {caption && <p className="mt-1 truncate text-[12px] font-medium text-fg-3">{caption}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function Empty({
  art,
  title,
  children,
  action,
  className,
}: {
  art?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("card-inset flex flex-col items-center px-5 py-7 text-center", className)}>
      {art && <div className="mb-3 opacity-90">{art}</div>}
      <p className="text-[15px] font-bold text-fg">{title}</p>
      {children && <div className="mt-1 max-w-[34ch] text-[13px] leading-relaxed text-fg-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Small "error with retry" block; never loses the user's input. */
export function ErrorNote({ children, onRetry, className }: { children: ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-[12px] border border-danger/30 bg-danger-tint px-3.5 py-3 text-[13px] text-fg", className)} role="alert">
      <span>{children}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 font-bold text-gold-300">
          Retry
        </button>
      )}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line-hair", className)} />;
}
