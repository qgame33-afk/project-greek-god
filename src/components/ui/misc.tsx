"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * CountUp, retired (docs/DESIGN-V3-SIMPLE.md §1.6: numbers change instantly, no count-up). Kept
 * for old callers: it renders the formatted value at once.
 */
export function CountUp({
  value,
  decimals = 0,
  className,
  format,
}: {
  value: number;
  decimals?: number;
  /** @deprecated ignored */
  duration?: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const text = format ? format(value) : value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span className={className}>{text}</span>;
}

/**
 * An in-page title row for old screens (the shell's PageHeader/BackHeader are in shell/*): the
 * `t-title` on the left and at most one accessory on the right. An `eyebrow` renders as a quiet
 * `t-cap` line above the title (no uppercase).
 */
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
    <header className={cn("mb-5 flex min-h-14 items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="t-cap mb-1">{eyebrow}</p>}
        <h1 className="t-title text-fg">{title}</h1>
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
      <p className="t-cap truncate">{label}</p>
      <p className={cn("mt-1 truncate", size === "lg" ? "t-num" : "t-num-s")}>
        {value}
        {unit && <span className="unit">{unit}</span>}
      </p>
      {delta != null && <p className={cn("t-cap mt-1 truncate font-semibold", deltaTone === "good" ? "text-gold" : "text-fg-2")}>{delta}</p>}
      {caption && <p className="t-cap mt-1 truncate">{caption}</p>}
    </div>
  );
}

/** Skeleton (§1.4.24): a --card block in the final layout's shape; a 1.2 s pulse. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

/**
 * Empty (§1.4.24): a --card with one `t-row` line and one `t-label` next step, centred, no art
 * ("Nothing yet today" / "Tap + to add food"). `art` is ignored.
 */
export function Empty({
  title,
  children,
  action,
  className,
}: {
  /** @deprecated ignored: empty states have no art */
  art?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-card bg-surface px-5 py-[26px] text-center", className)}>
      <p className="t-row text-fg">{title}</p>
      {children && <div className="t-label mt-1.5 max-w-[34ch]">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * ErrorNote (§1.4.24): a --card with the message ("Couldn't load this." by default) and a
 * secondary "Try again". Text in --text, never red unless something was lost. Shown inside the
 * affected block only; the rest of the screen keeps working.
 */
export function ErrorNote({ children, onRetry, className }: { children?: ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-card bg-surface px-5 py-4", className)} role="alert">
      <span className="t-body text-fg">{children ?? "Couldn't load this."}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="press t-button h-11 shrink-0 rounded-pill bg-control px-[18px] text-fg">
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Disclosure body that opens and closes smoothly to its natural height (CSS grid 0fr → 1fr, no
 * measuring) with the content fading in on top. Closed content stays mounted but `inert`, so
 * it is skipped by focus and screen readers. Give the toggle `aria-expanded` and
 * `aria-controls={id}`.
 */
export function Collapse({ open, id, className, children }: { open: boolean; id?: string; className?: string; children: ReactNode }) {
  return (
    <div id={id} className="collapse-panel" data-open={open} inert={!open}>
      <div className={className}>{children}</div>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line", className)} />;
}
