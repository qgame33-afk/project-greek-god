"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Switch } from "@/components/ui/controls";
import { cn } from "@/lib/cn";

/**
 * Settings' lists (docs/DESIGN-V3-SIMPLE.md §1.4.8, §4.9): a --card group, radius 20, rows of at
 * least 56 px separated by --line hairlines, an optional plain heading above and a caption below.
 * At accessibility sizes a row's value drops under its words (`ax:`).
 */
export function Group({
  id,
  title,
  footer,
  children,
  className,
}: {
  id?: string;
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("@container scroll-mt-20", className)} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {title && (
        <h2 id={id ? `${id}-title` : undefined} className="t-section mb-3">
          {title}
        </h2>
      )}
      <div className="overflow-hidden rounded-tile-lg bg-surface [&>*+*]:border-t [&>*+*]:border-line">{children}</div>
      {footer && <div className="t-label mt-2 px-1">{footer}</div>}
    </section>
  );
}

export const rowBase = "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left ax:flex-wrap ax:gap-y-1";

function Labels({ label, detail, danger, className }: { label: ReactNode; detail?: ReactNode; danger?: boolean; className?: string }) {
  return (
    <span className={cn("min-w-0 flex-1", className)}>
      <span className={cn("t-row block", danger && "text-danger")}>{label}</span>
      {detail && <span className="t-label mt-0.5 block">{detail}</span>}
    </span>
  );
}

const Value = ({ children }: { children: ReactNode }) => <span className="t-body max-w-[55%] shrink-0 truncate text-right text-fg-2 tabular-nums ax:ml-auto ax:max-w-none ax:whitespace-normal">{children}</span>;
const Chevron = () => <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />;

/** A row that opens a sheet. */
export function NavRow({
  label,
  detail,
  value,
  onClick,
  danger,
  disabled,
  chevron = true,
}: {
  label: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  chevron?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(rowBase, detail != null && "min-h-[68px]", "press-soft disabled:opacity-50")}>
      <Labels label={label} detail={detail} danger={danger} className={value != null ? "ax:basis-full" : undefined} />
      {value != null && <Value>{value}</Value>}
      {chevron && <Chevron />}
    </button>
  );
}

/** A row that goes to another screen or Settings page. */
export function LinkRow({ label, detail, value, href, icon }: { label: ReactNode; detail?: ReactNode; value?: ReactNode; href: string; icon?: ReactNode }) {
  return (
    <Link href={href} className={cn(rowBase, "gap-3.5", detail != null && "min-h-[68px]", "press-soft")}>
      {icon}
      <Labels label={label} detail={detail} className={value != null ? "ax:basis-full" : undefined} />
      {value != null && <Value>{value}</Value>}
      <Chevron />
    </Link>
  );
}

/** A static row with any control on the right (segmented, stepper, time); stacked when `stack`. */
export function ControlRow({ label, detail, children, stack }: { label: ReactNode; detail?: ReactNode; children: ReactNode; stack?: boolean }) {
  return (
    <div className={cn(rowBase, (stack || detail != null) && "min-h-[68px]", stack && "flex-col items-stretch gap-2.5 py-3", "ax:flex-col ax:items-stretch")}>
      <Labels label={label} detail={detail} />
      <div className={cn("shrink-0", stack && "w-full")}>{children}</div>
    </div>
  );
}

/** Label + switch; the whole row toggles. On is white: a setting is not an achievement. */
export function SwitchRow({ label, detail, checked, onChange, disabled }: { label: string; detail?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div
      className={cn(rowBase, "cursor-pointer flex-nowrap", detail != null && "min-h-[68px]", disabled && "pointer-events-none opacity-50")}
      onClick={(e) => {
        // the switch handles its own clicks; inside a <form> Radix also fires a synthetic click on
        // a hidden checkbox, which must not toggle the row a second time
        if ((e.target as HTMLElement).closest("button, input, a")) return;
        onChange(!checked);
      }}
    >
      <Labels label={label} detail={detail} />
      <Switch checked={checked} onCheckedChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

/** A read-only value row. */
export function InfoRow({ label, value, detail }: { label: ReactNode; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className={rowBase}>
      <Labels label={label} detail={detail} className="ax:basis-full" />
      <Value>{value}</Value>
    </div>
  );
}

/** Row skeleton used while the profile loads. */
export function GroupSkeleton({ rows = 3 }: { rows?: number; title?: boolean }) {
  return (
    <div aria-hidden className="overflow-hidden rounded-tile-lg bg-surface">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn("flex h-14 items-center justify-between px-4", i > 0 && "border-t border-line")}>
          <div className="skeleton h-3.5 w-32 rounded-full" />
          <div className="skeleton h-3.5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
