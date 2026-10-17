"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Switch } from "@/components/ui/controls";
import { cn } from "@/lib/cn";

/**
 * Settings' grouped lists (docs/DESIGN-V2.md §3.10): an eyebrow, then plain rows on one m2 slab
 * separated by hairlines, then an optional footnote. No ornament.
 */
export function Group({
  id,
  title,
  footer,
  children,
  className,
  action,
}: {
  id?: string;
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20 lg:scroll-mt-8", className)} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {title && (
        <div className="mb-2 flex min-h-6 items-end justify-between gap-3 px-1">
          <h2 id={id ? `${id}-title` : undefined} className="t-eyebrow">
            {title}
          </h2>
          {action}
        </div>
      )}
      <div className="overflow-hidden rounded-card bg-m2 shadow-(--e1)">{children}</div>
      {footer && <div className="t-meta mt-2 px-1 text-ash">{footer}</div>}
    </section>
  );
}

export const rowBase =
  "relative flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:left-4 [&:not(:first-child)]:before:right-0 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-vein";

function Labels({ label, detail, danger }: { label: ReactNode; detail?: ReactNode; danger?: boolean }) {
  return (
    <span className="min-w-0 flex-1">
      <span className={cn("t-title-3 block", danger ? "text-cinnabar" : "text-ivory")}>{label}</span>
      {detail && <span className="t-meta mt-0.5 block text-stone">{detail}</span>}
    </span>
  );
}

const Value = ({ children }: { children: ReactNode }) => <span className="t-callout max-w-[55%] shrink-0 truncate text-right text-stone">{children}</span>;

/** A row that opens a sheet. */
export function NavRow({
  label,
  detail,
  value,
  onClick,
  danger,
  badge,
  disabled,
  chevron = true,
}: {
  label: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  badge?: ReactNode;
  disabled?: boolean;
  chevron?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(rowBase, "press-soft transition-colors hover:bg-white/[.025] active:bg-white/[.04] disabled:opacity-50")}>
      <Labels label={label} detail={detail} danger={danger} />
      {badge}
      {value != null && <Value>{value}</Value>}
      {chevron && <ChevronRight className="-mr-1 size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />}
    </button>
  );
}

/** A row that goes to another screen (the schedule lives in Train → Program). */
export function LinkRow({ label, detail, value, href }: { label: ReactNode; detail?: ReactNode; value?: ReactNode; href: string }) {
  return (
    <Link href={href} className={cn(rowBase, "press-soft transition-colors hover:bg-white/[.025] active:bg-white/[.04]")}>
      <Labels label={label} detail={detail} />
      {value != null && <Value>{value}</Value>}
      <ChevronRight className="-mr-1 size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
    </Link>
  );
}

/** A static row with any control on the right (segmented, stepper, time). */
export function ControlRow({ label, detail, children, stack }: { label: ReactNode; detail?: ReactNode; children: ReactNode; stack?: boolean }) {
  return (
    <div className={cn(rowBase, stack && "flex-col items-stretch gap-2.5 py-3 lg:flex-row lg:items-center lg:gap-6", "@max-[19rem]:flex-col @max-[19rem]:items-stretch")}>
      <Labels label={label} detail={detail} />
      <div className={cn("shrink-0", stack && "w-full lg:w-[21rem]")}>{children}</div>
    </div>
  );
}

/** Label + switch; the whole row toggles. On is ivory: a setting is not an achievement. */
export function SwitchRow({ label, detail, checked, onChange, disabled }: { label: string; detail?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div
      className={cn(rowBase, "cursor-pointer", disabled && "pointer-events-none opacity-50")}
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
      <Labels label={label} detail={detail} />
      <Value>{value}</Value>
    </div>
  );
}

/** Row skeleton used while the profile loads. */
export function GroupSkeleton({ rows = 3, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div aria-hidden>
      {title && <div className="skeleton mb-2 ml-1 h-3 w-24 rounded-full" />}
      <div className="overflow-hidden rounded-card bg-m2 shadow-(--e1)">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={cn("flex h-14 items-center justify-between px-4", i > 0 && "border-t border-vein")}>
            <div className="skeleton h-3.5 w-32 rounded-full" />
            <div className="skeleton h-3.5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
